import { Tweet } from "agent-twitter-client";
import {
    composeContext,
    generateMessageResponse,
    generateShouldRespond,
    Content,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    stringToUuid,
    elizaLogger,
    IImageDescriptionService,
    ServiceType,
    UUID,
    InteractionLogger,
} from "@elizaos/core";
import { ClientBase } from "./base";
import {
    buildConversationThread,
    twitterHandlerCallback,
    wait,
} from "./utils.ts";
import {
    twitterShouldRespondTemplate,
    twitterMessageHandlerTemplate,
} from "./templates";
import { KnowledgeProcessor } from "./KnowledgeProcessor";
import { TwitterHelpers } from "./helpers";

const MENTIONS_TO_FETCH = 20;

export class TwitterInteractionClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    knowledgeProcessor: KnowledgeProcessor;
    private interactionTimeout: NodeJS.Timeout | null = null;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.knowledgeProcessor = new KnowledgeProcessor(runtime, client);
    }

    async start() {
        const handleTwitterInteractionsLoop = () => {
            this.handleTwitterInteractions();
            this.interactionTimeout = setTimeout(
                handleTwitterInteractionsLoop,
                // Defaults to 2 minutes
                this.client.twitterConfig.TWITTER_POLL_INTERVAL * 1000
            );
        };
        handleTwitterInteractionsLoop();
    }

    async stop() {
        if (this.interactionTimeout) {
            clearTimeout(this.interactionTimeout);
            this.interactionTimeout = null;
        }
    }

    async handleTwitterInteractions() {
        elizaLogger.log("Checking Twitter interactions");

        try {
            const mentions = await this.fetchMentionCandidates();
            const { uniqueTweetCandidates, allUserTweets } =
                await this.fetchAllUserTweets(mentions);

            // Filter tweets for knowledge processing (all users in KNOWLEDGE_USERS)
            const knowledgeUserTweets =
                this.filterTweetsForKnowledge(allUserTweets);
            await this.knowledgeProcessor.processKnowledge(knowledgeUserTweets);

            this.sortCandidates(uniqueTweetCandidates);

            for (const tweet of uniqueTweetCandidates) {
                const shouldSkip = await this.shouldSkip(tweet);
                if (shouldSkip) {
                    continue;
                }

                await this.prepareTweet(tweet);
            }

            await this.client.cacheLatestCheckedTweetId();
            elizaLogger.log("Finished checking Twitter interactions");
        } catch (error) {
            elizaLogger.error("Error handling Twitter interactions:", error);
        }
    }

    private async shouldSkip(tweet: Tweet): Promise<boolean> {
        if (this.isProcessed(tweet)) {
            return true;
        }

        const isRespondedTo = await this.isAlreadyRespondedTo(tweet);
        return isRespondedTo;
    }

    private async prepareTweet(tweet: Tweet) {
        const roomId = stringToUuid(
            tweet.conversationId + "-" + this.runtime.agentId
        );
        const userIdUUID =
            tweet.userId === this.client.profile.id
                ? this.runtime.agentId
                : stringToUuid(tweet.userId!);

        InteractionLogger.logMessageReceived({
            client: "twitter",
            agentId: this.runtime.agentId,
            userId: userIdUUID,
            roomId,
            messageId: tweet.id,
        });

        await this.runtime.ensureConnection(
            userIdUUID,
            roomId,
            tweet.username,
            tweet.name,
            "twitter"
        );

        const thread = await buildConversationThread(tweet, this.client);

        const message = {
            content: { text: tweet.text },
            agentId: this.runtime.agentId,
            userId: userIdUUID,
            roomId,
        };

        await this.handleTweet({
            tweet,
            message,
            thread,
        });

        this.client.lastCheckedTweetId = BigInt(tweet.id);
    }

    private isProcessed(tweet: Tweet): boolean {
        const isUnprocessed =
            !this.client.lastCheckedTweetId ||
            BigInt(tweet.id) > this.client.lastCheckedTweetId;
        return !isUnprocessed;
    }

    private async isAlreadyRespondedTo(tweet: Tweet): Promise<boolean> {
        const tweetId = stringToUuid(tweet.id + "-" + this.runtime.agentId);
        const existingResponse =
            await this.runtime.messageManager.getMemoryById(tweetId);

        if (existingResponse) {
            elizaLogger.log(`Already responded to tweet ${tweet.id}, skipping`);
            return true;
        }
        return false;
    }

    private sortCandidates(candidates: Tweet[]) {
        // Sort candidates by ID in ascending order
        return candidates
            .sort((a, b) => a.id.localeCompare(b.id))
            .filter((tweet) => tweet.userId !== this.client.profile.id);
    }

    private async fetchMentionCandidates(): Promise<Tweet[]> {
        const twitterUsername = this.client.profile.username;
        // Use the maximum of lastCheckedTweetId and lastKnowledgeCheckedTweetId
        // to avoid reprocessing already handled tweets
        const maxSinceId = await TwitterHelpers.getMaxTweetId(this.client);
        const response = await this.client.fetchSearchTweets(
            `@${twitterUsername}`,
            MENTIONS_TO_FETCH,
            undefined,
            maxSinceId
        );
        const candidates = response.tweets;
        elizaLogger.log(
            "Completed checking mentioned tweets:",
            candidates.length,
            maxSinceId
                ? `(since ID: ${maxSinceId})`
                : "(using start_time fallback)"
        );
        return candidates;
    }

    private async fetchAllUserTweets(
        mentions: Tweet[]
    ): Promise<{ uniqueTweetCandidates: Tweet[]; allUserTweets: Tweet[] }> {
        const TARGET_USERS =
            this.client.twitterConfig.TWITTER_TARGET_USERS || [];
        const KNOWLEDGE_USERS =
            this.client.twitterConfig.TWITTER_KNOWLEDGE_USERS || [];

        // Merge and deduplicate all users
        const allUsers = [...new Set([...TARGET_USERS, ...KNOWLEDGE_USERS])];

        if (allUsers.length === 0) {
            elizaLogger.log(
                "No target or knowledge users configured, processing only mentions"
            );
            return {
                uniqueTweetCandidates: mentions,
                allUserTweets: [],
            };
        }

        elizaLogger.log("Processing unified user list:", allUsers);
        elizaLogger.log(`Target users: [${TARGET_USERS.join(", ")}]`);
        elizaLogger.log(`Knowledge users: [${KNOWLEDGE_USERS.join(", ")}]`);

        let allUserTweets: Tweet[] = [];
        const targetTweetsByUser = new Map<string, Tweet[]>();

        try {
            // Single API call for all users (target + knowledge)
            const combinedQuery = TwitterHelpers.buildFromUsersQuery(allUsers);
            const maxSinceId = await TwitterHelpers.getMaxTweetId(this.client);

            elizaLogger.log(
                `Fetching tweets with unified query: ${combinedQuery}${maxSinceId ? ` (since ID: ${maxSinceId})` : " (using start_time fallback)"}`
            );

            const fetchResult = await this.client.fetchSearchTweets(
                combinedQuery,
                allUsers.length * 10, // More tweets per user to cover both target and knowledge needs
                undefined,
                maxSinceId
            );
            allUserTweets = fetchResult.tweets as Tweet[];

            // Process target user tweets for interaction candidates
            for (const tweet of allUserTweets) {
                const username = tweet.username;
                if (!username || !TARGET_USERS.includes(username)) {
                    continue;
                }

                // Filter for unprocessed, non-reply, recent tweets
                const isUnprocessed =
                    !this.client.lastCheckedTweetId ||
                    parseInt(tweet.id) > this.client.lastCheckedTweetId;
                const isRecent =
                    Date.now() - tweet.timestamp * 1000 < 2 * 60 * 60 * 1000;

                if (
                    isUnprocessed &&
                    !tweet.isReply &&
                    !tweet.isRetweet &&
                    isRecent
                ) {
                    if (!targetTweetsByUser.has(username)) {
                        targetTweetsByUser.set(username, []);
                    }
                    targetTweetsByUser.get(username)!.push(tweet);
                }
            }

            // Log found tweets per target user
            for (const [username, tweets] of targetTweetsByUser) {
                if (tweets.length > 0) {
                    elizaLogger.log(
                        `Found ${tweets.length} valid target tweets from ${username}`
                    );
                }
            }
        } catch (error) {
            elizaLogger.error("Error fetching tweets from users:", error);
        }

        const allTargetTweets: Tweet[] = [];
        for (const [username, tweets] of targetTweetsByUser) {
            if (tweets.length > 0) {
                allTargetTweets.push(...tweets);
                elizaLogger.log(
                    `Added ${tweets.length} interaction candidates from ${username}`
                );
            }
        }

        return {
            uniqueTweetCandidates: [...mentions, ...allTargetTweets],
            allUserTweets,
        };
    }

    private filterTweetsForKnowledge(allUserTweets: Tweet[]): Tweet[] {
        const KNOWLEDGE_USERS =
            this.client.twitterConfig.TWITTER_KNOWLEDGE_USERS || [];

        if (KNOWLEDGE_USERS.length === 0) {
            return [];
        }

        const knowledgeTweets = allUserTweets.filter(
            (tweet) =>
                tweet.username && KNOWLEDGE_USERS.includes(tweet.username)
        );

        elizaLogger.log(
            `Filtered ${knowledgeTweets.length} tweets for knowledge processing from ${KNOWLEDGE_USERS.length} users`
        );

        return knowledgeTweets;
    }

    private async handleTweet(props: {
        tweet: Tweet;
        message: Memory;
        thread: Tweet[];
    }): Promise<void> {
        const { tweet, message, thread } = props;

        if (this.isFromMyself(tweet)) {
            return;
        }
        if (!message.content.text) {
            elizaLogger.log("Skipping Tweet with no text", tweet.id);
            return;
        }

        const currentPost = this.formatTweet(tweet);
        const formattedConversation = this.formatThread(thread);

        elizaLogger.log("Processing Tweet: ", tweet.id);
        elizaLogger.debug("Thread: ", thread);
        elizaLogger.debug("formattedConversation: ", formattedConversation);

        const descriptions = await this.processImages(tweet);
        const imageDescriptions = this.stringifyImgDescriptions(descriptions);

        let state = await this.runtime.composeState(message, {
            twitterClient: this.client.twitterClient,
            twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
            currentPost,
            formattedConversation,
            imageDescriptions,
        });

        // check if the tweet exists, save if it doesn't
        const tweetId = stringToUuid(tweet.id + "-" + this.runtime.agentId);
        const exists = await this.runtime.messageManager.getMemoryById(tweetId);
        if (!exists) {
            this.saveTweet(tweet, tweetId, state);
        }

        const shouldRespond = await this.shouldRespond(state, message);
        if (!shouldRespond) {
            InteractionLogger.logAgentResponse({
                client: "twitter",
                agentId: this.runtime.agentId,
                userId: message.userId,
                roomId: message.roomId,
                messageId: tweet.id,
                status: "ignored",
            });
            return;
        }

        const { response, context } = await this.generateTweetResponse(
            state,
            message
        );
        response.inReplyTo = tweetId;

        if (!response.text) {
            elizaLogger.log("No response text, skipping");
            return;
        }

        try {
            const responseMessages = await twitterHandlerCallback(
                this.client,
                response,
                message.roomId,
                this.runtime,
                this.client.twitterConfig.TWITTER_USERNAME,
                tweet.id
            );
            state = (await this.runtime.updateRecentMessageState(
                state
            )) as State;

            const lastResponse = responseMessages[responseMessages.length - 1];
            const responseTweetId = lastResponse?.content?.tweetId as string;

            await this.runtime.processActions(
                message,
                responseMessages,
                state,
                (response: Content) =>
                    twitterHandlerCallback(
                        this.client,
                        response,
                        message.roomId,
                        this.runtime,
                        this.client.twitterConfig.TWITTER_USERNAME,
                        responseTweetId
                    ),
                {
                    tags: ["twitter", "twitter-reply", "twitter-interaction"],
                }
            );

            await this.saveResponseInfoToCache(context, tweet, response);
            await wait();
            InteractionLogger.logAgentResponse({
                client: "twitter",
                agentId: this.runtime.agentId,
                userId: message.userId,
                roomId: message.roomId,
                messageId: tweet.id,
                status: "sent",
            });
        } catch (error) {
            elizaLogger.error(`Error sending response tweet: ${error}`);
            InteractionLogger.logAgentResponse({
                client: "twitter",
                agentId: this.runtime.agentId,
                userId: message.userId,
                roomId: message.roomId,
                messageId: tweet.id,
                status: "error",
            });
        }
    }

    private async saveResponseInfoToCache(
        context: string,
        tweet: Tweet,
        response: Content
    ) {
        const responseInfo = `Context:\n\n${context}\n\nSelected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}\nAgent's Output:\n${response.text}`;
        await this.runtime.cacheManager.set(
            `twitter/tweet_generation_${tweet.id}.txt`,
            responseInfo
        );
    }

    private async generateTweetResponse(state: State, message: Memory) {
        const context = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.twitterMessageHandlerTemplate ||
                this.runtime.character?.templates?.messageHandlerTemplate ||
                twitterMessageHandlerTemplate,
        });
        elizaLogger.debug("Interactions prompt:\n" + context);

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
            message,
            tags: ["twitter", "twitter-response"],
        });
        return { response, context };
    }

    private async shouldRespond(
        state: State,
        message: Memory
    ): Promise<boolean> {
        const context = this.buildShouldRespondContext(state);
        const res = await generateShouldRespond({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.SMALL,
            message,
            tags: ["twitter", "twitter-should-respond"],
        });
        return res === "RESPOND";
    }

    private buildShouldRespondContext(state: State) {
        const validTargetUsersStr =
            this.client.twitterConfig.TWITTER_TARGET_USERS.join(",");

        const shouldRespondContext = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.twitterShouldRespondTemplate ||
                this.runtime.character?.templates?.shouldRespondTemplate ||
                twitterShouldRespondTemplate(validTargetUsersStr),
        });
        return shouldRespondContext;
    }

    private saveTweet(tweet: Tweet, tweetId: UUID, state: State) {
        elizaLogger.log("tweet does not exist, saving");
        const userIdUUID = stringToUuid(tweet.userId as string);
        const roomId = stringToUuid(tweet.conversationId);

        const message = {
            id: tweetId,
            agentId: this.runtime.agentId,
            content: {
                text: tweet.text,
                url: tweet.permanentUrl,
                inReplyTo: tweet.inReplyToStatusId
                    ? stringToUuid(
                          tweet.inReplyToStatusId + "-" + this.runtime.agentId
                      )
                    : undefined,
            },
            userId: userIdUUID,
            roomId,
            createdAt: tweet.timestamp * 1000,
        };
        // this runs the evaluators, how do we leverage this?
        this.client.saveRequestMessage(message, state);
    }

    private stringifyImgDescriptions(descriptions: any[]) {
        let imageDescriptions = "";
        if (descriptions.length > 0) {
            imageDescriptions = `\nImages in Tweet:\n${descriptions
                .map(
                    (desc, i) =>
                        `Image ${i + 1}: Title: ${desc.title}\nDescription: ${desc.description}`
                )
                .join("\n\n")}`;
        }
        return imageDescriptions;
    }

    private async processImages(tweet: Tweet) {
        const imageDescriptionsArray = [];
        try {
            elizaLogger.debug("Getting images");
            for (const photo of tweet.photos) {
                elizaLogger.debug(photo.url);
                const description = await this.runtime
                    .getService<IImageDescriptionService>(
                        ServiceType.IMAGE_DESCRIPTION
                    )
                    .describeImage(photo.url);
                imageDescriptionsArray.push(description);
            }
        } catch (error) {
            // Handle the error
            elizaLogger.error("Error Occured during describing image: ", error);
        }
        return imageDescriptionsArray;
    }

    private formatThread(thread: Tweet[]) {
        return thread
            .map(
                (tweet) => `@${tweet.username} (${new Date(
                    tweet.timestamp * 1000
                ).toLocaleString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                })}):
        ${tweet.text}`
            )
            .join("\n\n");
    }

    private isFromMyself(tweet: Tweet) {
        return tweet.userId === this.client.profile.id;
    }

    private formatTweet(tweet: Tweet) {
        return `  ID: ${tweet.id}
  From: ${tweet.name} (@${tweet.username})
  Text: ${tweet.text}`;
    }
}
