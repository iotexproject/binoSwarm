import { Tweet } from "agent-twitter-client";
import {
    composeContext,
    IAgentRuntime,
    ModelClass,
    stringToUuid,
    UUID,
    elizaLogger,
    generateTweetActions,
    IImageDescriptionService,
    ServiceType,
    State,
    ActionResponse,
    TemplateType,
    generateMessageResponse,
    Content,
    Memory,
} from "@elizaos/core";

import { ClientBase } from "./base.ts";

import { twitterActionTemplate, twitterPostTemplate } from "./templates.ts";
import { buildConversationThread, twitterHandlerCallback } from "./utils.ts";
import { twitterMessageHandlerTemplate } from "./templates.ts";
import TwitterQuoteClient from "./quote.ts";
import TwitterLikeClient from "./like.ts";
import TwitterRetweetClient from "./retweet.ts";
import TwitterReplyClient from "./reply.ts";

const MAX_TIMELINES_TO_FETCH = 15;

export class TwitterActionProcessor {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
    private isProcessing: boolean = false;
    private stopProcessingActions: boolean = false;
    private processingInterval: NodeJS.Timeout | null = null;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;

        this.logConfigOnInitialization();
    }

    async start() {
        if (this.client.twitterConfig.ENABLE_ACTION_PROCESSING) {
            if (!this.client.profile) {
                await this.client.init();
            }

            this.processActionsLoop();
        }
    }

    async stop() {
        this.stopProcessingActions = true;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
    }

    private logConfigOnInitialization() {
        elizaLogger.log("Twitter Action Processor Configuration:");
        elizaLogger.log(
            `- Action Processing: ${this.client.twitterConfig.ENABLE_ACTION_PROCESSING ? "enabled" : "disabled"}`
        );
        elizaLogger.log(
            `- Action Interval: ${this.client.twitterConfig.ACTION_INTERVAL} minutes`
        );

        const targetUsers = this.client.twitterConfig.TWITTER_TARGET_USERS;
        if (targetUsers) {
            elizaLogger.log(`- Target Users: ${targetUsers}`);
        }
    }

    private processActionsLoop() {
        const actionIntervalMin = this.client.twitterConfig.ACTION_INTERVAL;
        const intervalMs = actionIntervalMin * 60 * 1000;

        // Store the interval ID so we can clear it later
        this.processingInterval = setInterval(async () => {
            if (this.stopProcessingActions) {
                if (this.processingInterval) {
                    clearInterval(this.processingInterval);
                    this.processingInterval = null;
                }
                return;
            }

            try {
                if (this.isProcessing) {
                    throw new Error(
                        "Already processing tweet actions, skipping"
                    );
                }

                await this.processTweetActions();
                elizaLogger.log(
                    `Next action processing scheduled in ${actionIntervalMin} minutes`
                );
            } catch (error) {
                elizaLogger.error("Error in action processing loop:", error);
            }
        }, intervalMs);
    }

    /**
     * Processes tweet actions (likes, retweets, quotes, replies).
     */
    private async processTweetActions(): Promise<void> {
        try {
            this.isProcessing = true;

            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.client.profile.username,
                this.runtime.character.name,
                "twitter"
            );

            const timelines = await this.client.fetchTimelineForActions(
                MAX_TIMELINES_TO_FETCH
            );
            const actions = await this.decideTimelineActions(timelines);
            const sorted = this.sortProcessedTimeline(actions);
            const maxActions = this.client.twitterConfig.MAX_ACTIONS_PROCESSING;
            const sliced = sorted.slice(0, maxActions);

            await this.processTimelineActions(sliced);
        } catch (error) {
            elizaLogger.error("Error in processTweetActions:", error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    private async decideTimelineActions(timelines: Tweet[]) {
        const processedTimelines = await Promise.all(
            timelines.map(async (tweet) => await this.decideTweetActions(tweet))
        );
        return processedTimelines.filter((timeline) => timeline !== undefined);
    }

    private async decideTweetActions(tweet: Tweet): Promise<
        | {
              tweet: Tweet;
              actionResponse: ActionResponse;
              tweetState: State;
              roomId: UUID;
          }
        | undefined
    > {
        const agentId = this.runtime.agentId;
        const roomId = stringToUuid(tweet.conversationId + "-" + agentId);

        try {
            const alreadyProcessed = await this.isTweetAlreadyProcessed(tweet);
            if (alreadyProcessed) {
                return;
            }

            const tweetState = await this.composeTweetState(roomId, tweet);
            const actionResponse =
                await this.genTwitterActionResponse(tweetState);

            return {
                tweet,
                actionResponse,
                tweetState,
                roomId,
            };
        } catch (error) {
            elizaLogger.error(`Error processing tweet ${tweet.id}:`, error);
        }
    }

    private async genTwitterActionResponse(
        tweetState: State
    ): Promise<ActionResponse> {
        const actionContext = composeContext({
            state: tweetState,
            template:
                this.runtime.character.templates?.twitterActionTemplate ||
                twitterActionTemplate,
        });

        const actionResponse = await generateTweetActions({
            runtime: this.runtime,
            context: actionContext,
            modelClass: ModelClass.SMALL,
            tags: ["twitter", "twitter-action"],
        });

        return actionResponse;
    }

    private async composeTweetState(roomId: UUID, tweet: Tweet) {
        const agentId = this.runtime.agentId;

        return await this.runtime.composeState(
            {
                userId: agentId,
                roomId,
                agentId,
                content: { text: "", action: "" },
            },
            {
                twitterUserName: this.twitterUsername,
                currentTweet: `ID: ${tweet.id}\nFrom: ${tweet.name} (@${tweet.username})\nText: ${tweet.text}`,
            }
        );
    }

    private async isTweetAlreadyProcessed(tweet: Tweet) {
        const agentId = this.runtime.agentId;
        const memoryId = stringToUuid(tweet.id + "-" + agentId);
        const memory =
            await this.runtime.messageManager.getMemoryById(memoryId);

        if (memory) {
            elizaLogger.log(`Already processed tweet ID: ${tweet.id}`);
            return true;
        }
        return false;
    }

    // Sort the timeline based on the action decision score,
    private sortProcessedTimeline(
        arr: {
            tweet: Tweet;
            actionResponse: ActionResponse;
            tweetState: State;
            roomId: UUID;
        }[]
    ) {
        return arr.sort((a, b) => {
            // Count the number of true values in the actionResponse object
            const countTrue = (obj: typeof a.actionResponse) =>
                Object.values(obj).filter(Boolean).length;

            const countA = countTrue(a.actionResponse);
            const countB = countTrue(b.actionResponse);

            // Primary sort by number of true values
            if (countA !== countB) {
                return countB - countA;
            }

            // Secondary sort by the "like" property
            if (a.actionResponse.like !== b.actionResponse.like) {
                return a.actionResponse.like ? -1 : 1;
            }

            // Tertiary sort keeps the remaining objects with equal weight
            return 0;
        });
    }

    /**
     * Processes a list of timelines by executing the corresponding tweet actions.
     * Each timeline includes the tweet, action response, tweet state, and room context.
     * Results are returned for tracking completed actions.
     *
     * @param timelines - Array of objects containing tweet details, action responses, and state information.
     * @returns A promise that resolves to an array of results with details of executed actions.
     */
    private async processTimelineActions(
        timelines: {
            tweet: Tweet;
            actionResponse: ActionResponse;
            tweetState: State;
            roomId: UUID;
        }[]
    ): Promise<void> {
        await Promise.all(
            timelines.map(async (tweet) => {
                await this.processDecidedTweetActions(tweet);
            })
        );

        elizaLogger.log(`Processed ${timelines.length} tweets`);
    }

    private async processDecidedTweetActions(timeline: {
        tweet: Tweet;
        actionResponse: ActionResponse;
        tweetState: State;
        roomId: UUID;
    }) {
        const { actionResponse, roomId, tweet } = timeline;
        const executedActions: string[] = [];

        try {
            if (actionResponse.like) {
                await TwitterLikeClient.process(this.client, tweet.id);
                executedActions.push("like");
            }

            if (actionResponse.retweet) {
                await TwitterRetweetClient.process(this.client, tweet.id);
                executedActions.push("retweet");
            }

            if (actionResponse.quote) {
                await this.processQuote(tweet);
                executedActions.push("quote");
            }

            if (actionResponse.reply) {
                await this.processReply(tweet, roomId);
                executedActions.push("reply");
            }

            await this.addExecutedActionsMemory(roomId, tweet, executedActions);
        } catch (error) {
            elizaLogger.error(`Error processing tweet ${tweet.id}:`, error);
        }
    }

    private async addExecutedActionsMemory(
        roomId: UUID,
        tweet: Tweet,
        executedActions: string[]
    ) {
        const agentId = this.runtime.agentId;
        const userId = stringToUuid(tweet.userId);

        await this.runtime.ensureRoomExists(roomId);
        await this.runtime.ensureUserExists(
            userId,
            tweet.username,
            tweet.name,
            "twitter"
        );
        await this.runtime.ensureParticipantInRoom(agentId, roomId);

        await this.runtime.messageManager.createMemory({
            memory: {
                id: stringToUuid(tweet.id + "-" + agentId),
                userId,
                content: {
                    text: tweet.text,
                    url: tweet.permanentUrl,
                    source: "twitter",
                    action: executedActions.join(","),
                },
                agentId,
                roomId,
                createdAt: tweet.timestamp * 1000,
            },
            isUnique: true,
        });
    }

    private async processQuote(tweet: Tweet) {
        try {
            const enrichedState = await this.composeStateForAction(
                tweet,
                "QUOTE"
            );
            const quoteContent = await this.genActionContent(enrichedState);
            await TwitterQuoteClient.process(
                this.client,
                this.runtime,
                quoteContent,
                tweet,
                enrichedState
            );
        } catch (error) {
            elizaLogger.error("Error in quote tweet generation:", error);
        }
    }

    private async genActionContent(enrichedState: State) {
        const content = await this.generateTweetContent(enrichedState, {
            template:
                this.runtime.character.templates
                    ?.twitterMessageHandlerTemplate ||
                twitterMessageHandlerTemplate,
        });

        if (!content) {
            elizaLogger.error("Failed to generate valid tweet content");
            throw new Error("Failed to generate valid tweet content");
        }

        elizaLogger.log("Generated tweet content:", content);
        return content;
    }

    private async generateTweetContent(
        tweetState: any,
        options?: {
            template?: TemplateType;
            context?: string;
        }
    ): Promise<string> {
        const context = composeContext({
            state: tweetState,
            template:
                options?.template ||
                this.runtime.character.templates?.twitterPostTemplate ||
                twitterPostTemplate,
        });

        elizaLogger.debug("generate post prompt:\n" + context);

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context: options?.context || context,
            modelClass: ModelClass.LARGE,
            tags: ["twitter", "twitter-action-post"],
        });

        return this.trimTweetLength(response.text);
    }

    private async generateTweetActionResponse(
        state: State
    ): Promise<{ response: Content; context: string }> {
        const context = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.twitterMessageHandlerTemplate ||
                twitterMessageHandlerTemplate,
        });
        elizaLogger.debug("generateTweetActionResponse prompt:\n" + context);

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
            tags: ["twitter", "twitter-action-response"],
        });

        response.text = this.trimTweetLength(response.text);

        return { response, context };
    }

    // Helper method to ensure tweet length compliance
    private trimTweetLength(text: string, maxLength: number = 280): string {
        if (text.length <= maxLength) return text;

        // Try to cut at last sentence
        const lastSentence = text.slice(0, maxLength).lastIndexOf(".");
        if (lastSentence > 0) {
            return text.slice(0, lastSentence + 1).trim();
        }

        // Fallback to word boundary
        return (
            text.slice(0, text.lastIndexOf(" ", maxLength - 3)).trim() + "..."
        );
    }

    private async composeStateForAction(tweet: Tweet, action: string) {
        const agentId = this.runtime.agentId;
        const roomId = stringToUuid(tweet.conversationId + "-" + agentId);
        const imageDescriptions = await this.describeTweetImages(tweet);
        const imageContext = this.formatImageDescriptions(imageDescriptions);
        const quotedContent = await this.processQuotedTweet(tweet);
        const formattedConversation = await this.formatThread(tweet);

        return await this.runtime.composeState(
            {
                userId: agentId,
                roomId,
                agentId,
                content: {
                    text: tweet.text,
                    action,
                },
            },
            {
                twitterUserName: this.twitterUsername,
                currentPost: `From @${tweet.username}: ${tweet.text}`,
                formattedConversation,
                imageContext,
                quotedContent,
            }
        );
    }

    private formatImageDescriptions(
        imageDescriptions: { title: string; description: string }[]
    ) {
        return imageDescriptions.length > 0
            ? `\nImages in Tweet:\n${imageDescriptions.map((desc, i) => `Image ${i + 1}: ${desc}`).join("\n")}`
            : "";
    }

    private async processQuotedTweet(tweet: Tweet) {
        if (!tweet.quotedStatusId) {
            return "";
        }

        try {
            const quotedTweet = await this.client.twitterClient.getTweet(
                tweet.quotedStatusId
            );
            if (quotedTweet) {
                return `\nQuoted Tweet from @${quotedTweet.username}:\n${quotedTweet.text}`;
            }
        } catch (error) {
            elizaLogger.error("Error fetching quoted tweet:", error);
            return "";
        }
    }

    private async describeTweetImages(tweet: Tweet) {
        if (!tweet.photos?.length) {
            return [];
        }

        elizaLogger.log("Processing images in tweet for context");

        return await Promise.all(
            tweet.photos.map(async (photo) => this.desribePhoto(photo.url))
        );
    }

    private async desribePhoto(photoUrl: string) {
        return this.runtime
            .getService<IImageDescriptionService>(ServiceType.IMAGE_DESCRIPTION)
            .describeImage(photoUrl);
    }

    private async formatThread(tweet: Tweet) {
        const thread = await buildConversationThread(tweet, this.client);

        return thread
            .map((t) => {
                const date = new Date(t.timestamp * 1000).toLocaleString();
                return `@${t.username} (${date}): ${t.text}`;
            })
            .join("\n\n");
    }

    private async processReply(tweet: Tweet, roomId: UUID) {
        try {
            const enrichedState = await this.composeStateForAction(
                tweet,
                "REPLY"
            );
            const { response: responseContent } =
                await this.generateTweetActionResponse(enrichedState);

            if (!responseContent.text) {
                elizaLogger.error(
                    "Failed to generate valid tweet content for reply"
                );
                return;
            }

            await TwitterReplyClient.cacheReplyTweet(
                this.runtime,
                tweet.id,
                enrichedState,
                responseContent.text
            );

            const responseMessages = await twitterHandlerCallback(
                this.client,
                responseContent,
                roomId,
                this.runtime,
                this.twitterUsername,
                tweet.id
            );

            if (responseMessages.length === 0) {
                elizaLogger.error("Failed to send tweet reply");
                return;
            }

            const lastResponse = responseMessages[responseMessages.length - 1];
            const responseTweetId = lastResponse?.content?.tweetId as string;
            const updatedState = (await this.runtime.updateRecentMessageState(
                enrichedState
            )) as State;

            const userId =
                tweet.userId === this.client.profile.id
                    ? this.runtime.agentId
                    : stringToUuid(tweet.userId);

            const originalMessage: Memory = {
                id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
                agentId: this.runtime.agentId,
                userId,
                roomId,
                content: {
                    text: tweet.text,
                    url: tweet.permanentUrl,
                    source: "twitter",
                },
                createdAt: tweet.timestamp * 1000,
            };

            await this.runtime.processActions(
                originalMessage,
                responseMessages,
                updatedState,
                (response: Content) =>
                    twitterHandlerCallback(
                        this.client,
                        response,
                        roomId,
                        this.runtime,
                        this.twitterUsername,
                        responseTweetId
                    ),
                {
                    tags: ["twitter", "twitter-reply", "twitter-action"],
                }
            );
        } catch (error) {
            elizaLogger.error(`Error replying to tweet ${tweet.id}:`, error);
        }
    }
}

export default TwitterActionProcessor;
