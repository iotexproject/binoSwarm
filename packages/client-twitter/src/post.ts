import { Tweet } from "agent-twitter-client";
import {
    composeContext,
    generateText,
    getEmbeddingZeroVector,
    IAgentRuntime,
    ModelClass,
    stringToUuid,
    TemplateType,
    UUID,
    truncateToCompleteSentence,
    parseTagContent,
    elizaLogger,
    generateTweetActions,
    IImageDescriptionService,
    ServiceType,
    State,
    ActionResponse,
} from "@elizaos/core";
import {
    Client,
    Events,
    GatewayIntentBits,
    TextChannel,
    Partials,
} from "discord.js";

import { ClientBase } from "./base.ts";
import { buildConversationThread } from "./utils.ts";
import { twitterMessageHandlerTemplate } from "./interactions.ts";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment.ts";
import { PendingTweet, PendingTweetApprovalStatus } from "./types.ts";
import { twitterActionTemplate, twitterPostTemplate } from "./templates.ts";

const MAX_TIMELINES_TO_FETCH = 15;

export class TwitterPostClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
    private isProcessing: boolean = false;
    private stopProcessingActions: boolean = false;
    private discordClientForApproval: Client;
    private approvalRequired: boolean = false;
    private discordApprovalChannelId: string;
    private approvalCheckInterval: number;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;

        this.logConfigOnInitialization();
        this.configureApprovals();
    }

    private configureApprovals() {
        const approvalRequired: boolean =
            this.runtime
                .getSetting("TWITTER_APPROVAL_ENABLED")
                ?.toLocaleLowerCase() === "true";
        if (approvalRequired) {
            const discordToken = this.runtime.getSetting(
                "TWITTER_APPROVAL_DISCORD_BOT_TOKEN"
            );
            const approvalChannelId = this.runtime.getSetting(
                "TWITTER_APPROVAL_DISCORD_CHANNEL_ID"
            );

            const APPROVAL_CHECK_INTERVAL =
                parseInt(
                    this.runtime.getSetting("TWITTER_APPROVAL_CHECK_INTERVAL")
                ) || 5 * 60 * 1000; // 5 minutes

            this.approvalCheckInterval = APPROVAL_CHECK_INTERVAL;

            if (!discordToken || !approvalChannelId) {
                throw new Error(
                    "TWITTER_APPROVAL_DISCORD_BOT_TOKEN and TWITTER_APPROVAL_DISCORD_CHANNEL_ID are required for approval workflow"
                );
            }

            this.approvalRequired = true;
            this.discordApprovalChannelId = approvalChannelId;

            // Set up Discord client event handlers
            this.setupDiscordClient();
        }
    }

    private logConfigOnInitialization() {
        elizaLogger.log("Twitter Client Configuration:");
        elizaLogger.log(`- Username: ${this.twitterUsername}`);
        elizaLogger.log(
            `- Post Interval: ${this.client.twitterConfig.POST_INTERVAL_MIN}-${this.client.twitterConfig.POST_INTERVAL_MAX} minutes`
        );
        elizaLogger.log(
            `- Action Processing: ${this.client.twitterConfig.ENABLE_ACTION_PROCESSING ? "enabled" : "disabled"}`
        );
        elizaLogger.log(
            `- Action Interval: ${this.client.twitterConfig.ACTION_INTERVAL} minutes`
        );
        elizaLogger.log(
            `- Post Immediately: ${this.client.twitterConfig.POST_IMMEDIATELY ? "enabled" : "disabled"}`
        );
        elizaLogger.log(
            `- Search Enabled: ${this.client.twitterConfig.TWITTER_SEARCH_ENABLE ? "enabled" : "disabled"}`
        );

        const targetUsers = this.client.twitterConfig.TWITTER_TARGET_USERS;
        if (targetUsers) {
            elizaLogger.log(`- Target Users: ${targetUsers}`);
        }

        const knowledgeUsers =
            this.client.twitterConfig.TWITTER_KNOWLEDGE_USERS;
        if (knowledgeUsers) {
            elizaLogger.log(`- Knowledge Users: ${knowledgeUsers}`);
        }
    }

    private setupDiscordClient() {
        this.discordClientForApproval = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMessageReactions,
            ],
            partials: [Partials.Channel, Partials.Message, Partials.Reaction],
        });
        this.discordClientForApproval.once(
            Events.ClientReady,
            (readyClient) => {
                elizaLogger.log(
                    `Discord bot is ready as ${readyClient.user.tag}!`
                );

                // Generate invite link with required permissions
                const invite = `https://discord.com/api/oauth2/authorize?client_id=${readyClient.user.id}&permissions=274877991936&scope=bot`;
                // 274877991936 includes permissions for:
                // - Send Messages
                // - Read Messages/View Channels
                // - Read Message History

                elizaLogger.log(
                    `Use this link to properly invite the Twitter Post Approval Discord bot: ${invite}`
                );
            }
        );
        // Login to Discord
        this.discordClientForApproval.login(
            this.runtime.getSetting("TWITTER_APPROVAL_DISCORD_BOT_TOKEN")
        );
    }

    async start() {
        if (!this.client.profile) {
            await this.client.init();
        }

        if (this.client.twitterConfig.POST_IMMEDIATELY) {
            await this.generateNewTweet();
        }
        await this.generateNewTweetLoop();

        if (this.client.twitterConfig.ENABLE_ACTION_PROCESSING) {
            this.processActionsLoop();
        }
        if (this.approvalRequired) {
            this.runPendingTweetCheckLoop();
        }
    }

    private async generateNewTweetLoop() {
        elizaLogger.log("Starting generate new tweet loop");

        const delayMs = this.getPostDelay();
        await this.postTweetInCurrentIteration(delayMs);
        this.setupNextTweetIteration(delayMs);
    }

    private setupNextTweetIteration(delayMs: number) {
        setTimeout(() => {
            this.generateNewTweetLoop();
        }, delayMs);

        const delayMinutes = delayMs / 60000;
        elizaLogger.log(`Next tweet scheduled in ${delayMinutes} minutes`);
    }

    private async postTweetInCurrentIteration(delayMs: number) {
        const isTimeToPost = await this.isTimeToPost(delayMs);
        if (isTimeToPost) {
            await this.generateNewTweet();
        }
    }

    private async isTimeToPost(delayMs: number) {
        const lastPostTimestamp = await this.getLastPostTimestamp();
        return Date.now() > lastPostTimestamp + delayMs;
    }

    private getPostDelay() {
        const minMinutes = this.client.twitterConfig.POST_INTERVAL_MIN;
        const maxMinutes = this.client.twitterConfig.POST_INTERVAL_MAX;
        // Calculate random number of minutes between min and max
        const range = maxMinutes - minMinutes + 1;
        const randomMinutes = Math.floor(Math.random() * range);
        const delayMinutes = randomMinutes + minMinutes;

        // Convert to milliseconds and return
        return delayMinutes * 60 * 1000;
    }

    private async getLastPostTimestamp() {
        const lastPost = await this.runtime.cacheManager.get<{
            timestamp: number;
        }>("twitter/" + this.twitterUsername + "/lastPost");

        return lastPost?.timestamp ?? 0;
    }

    private async processActionsLoop() {
        const actionIntervalMin = this.client.twitterConfig.ACTION_INTERVAL;
        const notStopped = !this.stopProcessingActions;

        while (notStopped) {
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
            await this.waitMinutes(actionIntervalMin);
        }
    }

    private async waitMinutes(minutes: number) {
        await new Promise((resolve) =>
            setTimeout(resolve, minutes * 60 * 1000)
        );
    }

    private runPendingTweetCheckLoop() {
        setInterval(async () => {
            await this.handlePendingTweet();
        }, this.approvalCheckInterval);
    }

    createTweetObject(
        tweetResult: any,
        client: any,
        twitterUsername: string
    ): Tweet {
        return {
            id: tweetResult.rest_id,
            name: client.profile.screenName,
            username: client.profile.username,
            text: tweetResult.legacy.full_text,
            conversationId: tweetResult.legacy.conversation_id_str,
            createdAt: tweetResult.legacy.created_at,
            timestamp: new Date(tweetResult.legacy.created_at).getTime(),
            userId: client.profile.id,
            inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
            permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
            hashtags: [],
            mentions: [],
            photos: [],
            thread: [],
            urls: [],
            videos: [],
        } as Tweet;
    }

    async processAndCacheTweet(
        runtime: IAgentRuntime,
        client: ClientBase,
        tweet: Tweet,
        roomId: UUID,
        newTweetContent: string
    ) {
        // Cache the last post details
        await runtime.cacheManager.set(
            `twitter/${client.profile.username}/lastPost`,
            {
                id: tweet.id,
                timestamp: Date.now(),
            }
        );

        // Cache the tweet
        await client.cacheTweet(tweet);

        // Log the posted tweet
        elizaLogger.log(`Tweet posted:\n ${tweet.permanentUrl}`);

        // Ensure the room and participant exist
        await runtime.ensureRoomExists(roomId);
        await runtime.ensureParticipantInRoom(runtime.agentId, roomId);

        // Create a memory for the tweet
        await runtime.messageManager.createMemory({
            id: stringToUuid(tweet.id + "-" + runtime.agentId),
            userId: runtime.agentId,
            agentId: runtime.agentId,
            content: {
                text: newTweetContent.trim(),
                url: tweet.permanentUrl,
                source: "twitter",
            },
            roomId,
            embedding: getEmbeddingZeroVector(),
            createdAt: tweet.timestamp,
        });
    }

    async handleNoteTweet(
        client: ClientBase,
        content: string,
        tweetId?: string
    ) {
        const noteTweetResult = await client.requestQueue.add(
            async () =>
                await client.twitterClient.sendNoteTweet(content, tweetId)
        );

        if (noteTweetResult.errors && noteTweetResult.errors.length > 0) {
            // Note Tweet failed due to authorization. Falling back to standard Tweet.
            const truncateContent = truncateToCompleteSentence(
                content,
                this.client.twitterConfig.MAX_TWEET_LENGTH
            );
            return await this.sendStandardTweet(
                client,
                truncateContent,
                tweetId
            );
        } else if (!noteTweetResult.data?.notetweet_create?.tweet_results) {
            throw new Error(`Note Tweet failed`);
        }

        return noteTweetResult.data.notetweet_create.tweet_results.result;
    }

    async sendStandardTweet(
        client: ClientBase,
        content: string,
        tweetId?: string
    ) {
        const standardTweetResult = await client.requestQueue.add(
            async () => await client.twitterClient.sendTweet(content, tweetId)
        );

        const body = await standardTweetResult.json();
        if (!body?.data?.create_tweet?.tweet_results?.result) {
            throw new Error("Error sending tweet; Bad response");
        }

        return body.data.create_tweet.tweet_results.result;
    }

    async postTweet(
        runtime: IAgentRuntime,
        client: ClientBase,
        cleanedContent: string,
        roomId: UUID,
        newTweetContent: string,
        twitterUsername: string
    ) {
        try {
            elizaLogger.log(`Posting new tweet:\n ${newTweetContent}`);

            let result;

            if (cleanedContent.length > DEFAULT_MAX_TWEET_LENGTH) {
                result = await this.handleNoteTweet(client, cleanedContent);
            } else {
                result = await this.sendStandardTweet(client, cleanedContent);
            }

            const tweet = this.createTweetObject(
                result,
                client,
                twitterUsername
            );

            await this.processAndCacheTweet(
                runtime,
                client,
                tweet,
                roomId,
                newTweetContent
            );
        } catch (error) {
            elizaLogger.error("Error sending tweet:", error);
        }
    }

    /**
     * Generates and posts a new tweet.
     */
    async generateNewTweet() {
        elizaLogger.log("Generating new tweet");

        try {
            const username = this.client.profile.username;
            const roomId = stringToUuid("twitter_generate_room-" + username);

            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                username,
                this.runtime.character.name,
                "twitter"
            );

            const newTweetContent = await this.genAndCleanNewTweet(roomId);

            if (this.approvalRequired) {
                await this.sendForApproval(
                    newTweetContent,
                    roomId,
                    newTweetContent
                );
            } else {
                await this.postTweet(
                    this.runtime,
                    this.client,
                    newTweetContent,
                    roomId,
                    newTweetContent,
                    this.twitterUsername
                );
            }
        } catch (error) {
            elizaLogger.error("Error generating new tweet:", error);
        }
    }

    private truncateNewTweet(maxTweetLength: number, newTweetContent: string) {
        if (maxTweetLength) {
            newTweetContent = truncateToCompleteSentence(
                newTweetContent,
                maxTweetLength
            );
        }
        return newTweetContent;
    }

    private async genAndCleanNewTweet(roomId: UUID) {
        const maxTweetLength = this.client.twitterConfig.MAX_TWEET_LENGTH;
        const newTweetContent = await this.generateNewTweetContent(
            roomId,
            maxTweetLength
        );
        elizaLogger.debug("generate new tweet content:\n" + newTweetContent);

        let cleanedContent = this.extractResponse(newTweetContent);
        cleanedContent = this.truncateNewTweet(maxTweetLength, cleanedContent);
        cleanedContent = this.fixNewLines(cleanedContent);
        cleanedContent = this.removeQuotes(cleanedContent);

        return cleanedContent;
    }

    private extractResponse(rawResponse: string) {
        const extractedResponse = parseTagContent(rawResponse, "response");

        if (!extractedResponse) {
            elizaLogger.error(
                "Failed to extract valid content from response:",
                {
                    rawResponse,
                }
            );
            throw new Error("Failed to extract valid content from response");
        }

        return extractedResponse;
    }

    private async generateNewTweetContent(
        roomId: UUID,
        maxTweetLength: number
    ) {
        const context = await this.composeNewTweetContext(
            roomId,
            maxTweetLength
        );

        return generateText({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
        });
    }

    private async composeNewTweetContext(roomId: UUID, maxTweetLength: number) {
        const topics = this.runtime.character.topics.join(", ");
        const agentId = this.runtime.agentId;

        const state = await this.runtime.composeState(
            {
                userId: agentId,
                roomId,
                agentId,
                content: {
                    text: topics || "",
                    action: "TWEET",
                },
            },
            {
                twitterUserName: this.client.profile.username,
                maxTweetLength,
            }
        );

        return composeContext({
            state,
            template:
                this.runtime.character.templates?.twitterPostTemplate ||
                twitterPostTemplate,
        });
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

        elizaLogger.info("generate post prompt:\n" + context);

        const response = await generateText({
            runtime: this.runtime,
            context: options?.context || context,
            modelClass: ModelClass.LARGE,
        });
        elizaLogger.info("generate tweet content response:\n" + response);
        const cleanedResponse = parseTagContent(response, "response");

        elizaLogger.info(
            "generate tweet content response cleaned:\n" + cleanedResponse
        );
        // Try to parse as JSON first
        try {
            const jsonResponse = JSON.parse(cleanedResponse);
            elizaLogger.info(
                "generate tweet content response text:\n" + jsonResponse.text
            );
            if (jsonResponse.text || jsonResponse.text === "") {
                return this.trimTweetLength(jsonResponse.text);
            }
            if (typeof jsonResponse === "object") {
                const possibleContent =
                    jsonResponse.content ||
                    jsonResponse.message ||
                    jsonResponse.response;
                if (possibleContent) {
                    return this.trimTweetLength(possibleContent);
                }
            }
        } catch (error) {
            error.linted = true; // make linter happy since catch needs a variable

            // If JSON parsing fails, treat as plain text
            elizaLogger.debug("Response is not JSON, treating as plain text");
        }

        // If not JSON or no valid content found, clean the raw text
        return this.trimTweetLength(cleanedResponse);
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
        });

        if (!actionResponse) {
            throw new Error(`No valid actions generated for tweet`);
        }

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
                await this.processLike(tweet);
                executedActions.push("like");
            }

            if (actionResponse.retweet) {
                await this.processRetweet(tweet);
                executedActions.push("retweet");
            }

            if (actionResponse.quote) {
                await this.processQuote(tweet);
                executedActions.push("quote");
            }

            if (actionResponse.reply) {
                await this.processReply(tweet);
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
            embedding: getEmbeddingZeroVector(),
            createdAt: tweet.timestamp * 1000,
        });
    }

    private async processQuote(tweet: Tweet) {
        try {
            const enrichedState = await this.composeStateForAction(
                tweet,
                "QUOTE"
            );
            const quoteContent = await this.genActionContent(enrichedState);
            await this.sendAndCacheQuote(quoteContent, tweet, enrichedState);
        } catch (error) {
            elizaLogger.error("Error in quote tweet generation:", error);
        }
    }

    private async sendAndCacheQuote(
        quoteContent: string,
        tweet: Tweet,
        enrichedState: State
    ) {
        const result = await this.client.requestQueue.add(
            async () =>
                await this.client.twitterClient.sendQuoteTweet(
                    quoteContent,
                    tweet.id
                )
        );

        const body = await result.json();

        if (body?.data?.create_tweet?.tweet_results?.result) {
            elizaLogger.log("Successfully posted quote tweet");

            // Cache generation context for debugging
            await this.runtime.cacheManager.set(
                `twitter/quote_generation_${tweet.id}.txt`,
                `Context:\n${enrichedState}\n\nGenerated Quote:\n${quoteContent}`
            );
        } else {
            elizaLogger.error("Quote tweet creation failed:", body);
            throw new Error("Quote tweet creation failed");
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

    private async processRetweet(tweet: Tweet) {
        try {
            await this.client.twitterClient.retweet(tweet.id);
            elizaLogger.log(`Retweeted tweet ${tweet.id}`);
        } catch (error) {
            elizaLogger.error(`Error retweeting tweet ${tweet.id}:`, error);
        }
    }

    private async processLike(tweet: Tweet) {
        try {
            await this.client.twitterClient.likeTweet(tweet.id);
            elizaLogger.log(`Liked tweet ${tweet.id}`);
        } catch (error) {
            elizaLogger.error(`Error liking tweet ${tweet.id}:`, error);
        }
    }

    private async processReply(tweet: Tweet) {
        try {
            const enrichedState = await this.composeStateForAction(tweet, "");
            const cleanedReplyText = await this.genActionContent(enrichedState);

            if (cleanedReplyText.length > DEFAULT_MAX_TWEET_LENGTH) {
                await this.handleNoteTweet(
                    this.client,
                    cleanedReplyText,
                    tweet.id
                );
            } else {
                await this.sendStandardTweet(
                    this.client,
                    cleanedReplyText,
                    tweet.id
                );
            }

            await this.cacheReplyTweet(tweet, enrichedState, cleanedReplyText);
        } catch (error) {
            elizaLogger.error(`Error replying to tweet ${tweet.id}:`, error);
        }
    }

    private async cacheReplyTweet(
        tweet: Tweet,
        enrichedState: State,
        cleanedReplyText: string
    ) {
        await this.runtime.cacheManager.set(
            `twitter/reply_generation_${tweet.id}.txt`,
            `Context:\n${enrichedState}\n\nGenerated Reply:\n${cleanedReplyText}`
        );
    }

    async stop() {
        this.stopProcessingActions = true;
    }

    private async sendForApproval(
        cleanedContent: string,
        roomId: UUID,
        newTweetContent: string
    ): Promise<string | null> {
        elizaLogger.log(`Sending Tweet For Approval:\n ${newTweetContent}`);
        try {
            const embed = {
                title: "New Tweet Pending Approval",
                description: cleanedContent,
                fields: [
                    {
                        name: "Character",
                        value: this.client.profile.username,
                        inline: true,
                    },
                    {
                        name: "Length",
                        value: cleanedContent.length.toString(),
                        inline: true,
                    },
                ],
                footer: {
                    text: "Reply with '👍' to post or '❌' to discard, This will automatically expire and remove after 24 hours if no response received",
                },
                timestamp: new Date().toISOString(),
            };

            const channel = await this.discordClientForApproval.channels.fetch(
                this.discordApprovalChannelId
            );

            if (!channel || !(channel instanceof TextChannel)) {
                throw new Error("Invalid approval channel");
            }

            const message = await channel.send({ embeds: [embed] });

            // Store the pending tweet
            const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweet`;
            const currentPendingTweets =
                (await this.runtime.cacheManager.get<PendingTweet[]>(
                    pendingTweetsKey
                )) || [];
            // Add new pending tweet
            currentPendingTweets.push({
                cleanedContent,
                roomId,
                newTweetContent,
                discordMessageId: message.id,
                channelId: this.discordApprovalChannelId,
                timestamp: Date.now(),
            });

            // Store updated array
            await this.runtime.cacheManager.set(
                pendingTweetsKey,
                currentPendingTweets
            );

            return message.id;
        } catch (error) {
            elizaLogger.error(
                "Error Sending Twitter Post Approval Request:",
                error
            );
            return null;
        }
    }

    private async checkApprovalStatus(
        discordMessageId: string
    ): Promise<PendingTweetApprovalStatus> {
        try {
            // Fetch message and its replies from Discord
            const channel = await this.discordClientForApproval.channels.fetch(
                this.discordApprovalChannelId
            );

            if (!(channel instanceof TextChannel)) {
                elizaLogger.error("Invalid approval channel");
                return "PENDING";
            }

            // Fetch the original message and its replies
            const message = await channel.messages.fetch(discordMessageId);

            // Look for thumbs up reaction ('👍')
            const thumbsUpReaction = message.reactions.cache.find(
                (reaction) => reaction.emoji.name === "👍"
            );

            // Look for reject reaction ('❌')
            const rejectReaction = message.reactions.cache.find(
                (reaction) => reaction.emoji.name === "❌"
            );

            // Check if the reaction exists and has reactions
            if (rejectReaction) {
                const count = rejectReaction.count;
                if (count > 0) {
                    return "REJECTED";
                }
            }

            // Check if the reaction exists and has reactions
            if (thumbsUpReaction) {
                // You might want to check for specific users who can approve
                // For now, we'll return true if anyone used thumbs up
                const count = thumbsUpReaction.count;
                if (count > 0) {
                    return "APPROVED";
                }
            }

            return "PENDING";
        } catch (error) {
            elizaLogger.error("Error checking approval status:", error);
            return "PENDING";
        }
    }

    private async cleanupPendingTweet(discordMessageId: string) {
        const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweet`;
        const currentPendingTweets =
            (await this.runtime.cacheManager.get<PendingTweet[]>(
                pendingTweetsKey
            )) || [];

        // Remove the specific tweet
        const updatedPendingTweets = currentPendingTweets.filter(
            (tweet) => tweet.discordMessageId !== discordMessageId
        );

        if (updatedPendingTweets.length === 0) {
            await this.runtime.cacheManager.delete(pendingTweetsKey);
        } else {
            await this.runtime.cacheManager.set(
                pendingTweetsKey,
                updatedPendingTweets
            );
        }
    }

    private async handlePendingTweet() {
        elizaLogger.log("Checking Pending Tweets...");
        const pendingTweetsKey = `twitter/${this.client.profile.username}/pendingTweet`;
        const pendingTweets =
            (await this.runtime.cacheManager.get<PendingTweet[]>(
                pendingTweetsKey
            )) || [];

        for (const pendingTweet of pendingTweets) {
            // Check if tweet is older than 24 hours
            const isExpired =
                Date.now() - pendingTweet.timestamp > 24 * 60 * 60 * 1000;

            if (isExpired) {
                elizaLogger.log("Pending tweet expired, cleaning up");

                // Notify on Discord about expiration
                try {
                    const channel =
                        await this.discordClientForApproval.channels.fetch(
                            pendingTweet.channelId
                        );
                    if (channel instanceof TextChannel) {
                        const originalMessage = await channel.messages.fetch(
                            pendingTweet.discordMessageId
                        );
                        await originalMessage.reply(
                            "This tweet approval request has expired (24h timeout)."
                        );
                    }
                } catch (error) {
                    elizaLogger.error(
                        "Error sending expiration notification:",
                        error
                    );
                }

                await this.cleanupPendingTweet(pendingTweet.discordMessageId);
                return;
            }

            // Check approval status
            elizaLogger.log("Checking approval status...");
            const approvalStatus: PendingTweetApprovalStatus =
                await this.checkApprovalStatus(pendingTweet.discordMessageId);

            if (approvalStatus === "APPROVED") {
                elizaLogger.log("Tweet Approved, Posting");
                await this.postTweet(
                    this.runtime,
                    this.client,
                    pendingTweet.cleanedContent,
                    pendingTweet.roomId,
                    pendingTweet.newTweetContent,
                    this.twitterUsername
                );

                // Notify on Discord about posting
                try {
                    const channel =
                        await this.discordClientForApproval.channels.fetch(
                            pendingTweet.channelId
                        );
                    if (channel instanceof TextChannel) {
                        const originalMessage = await channel.messages.fetch(
                            pendingTweet.discordMessageId
                        );
                        await originalMessage.reply(
                            "Tweet has been posted successfully! ✅"
                        );
                    }
                } catch (error) {
                    elizaLogger.error(
                        "Error sending post notification:",
                        error
                    );
                }

                await this.cleanupPendingTweet(pendingTweet.discordMessageId);
            } else if (approvalStatus === "REJECTED") {
                elizaLogger.log("Tweet Rejected, Cleaning Up");
                await this.cleanupPendingTweet(pendingTweet.discordMessageId);
                // Notify about Rejection of Tweet
                try {
                    const channel =
                        await this.discordClientForApproval.channels.fetch(
                            pendingTweet.channelId
                        );
                    if (channel instanceof TextChannel) {
                        const originalMessage = await channel.messages.fetch(
                            pendingTweet.discordMessageId
                        );
                        await originalMessage.reply(
                            "Tweet has been rejected! ❌"
                        );
                    }
                } catch (error) {
                    elizaLogger.error(
                        "Error sending rejection notification:",
                        error
                    );
                }
            }
        }
    }

    private removeQuotes(str: string) {
        return str.replace(/^['"](.*)['"]$/, "$1");
    }

    private fixNewLines(str: string) {
        return str.replaceAll(/\\n/g, "\n\n"); //ensures double spaces
    }
}
