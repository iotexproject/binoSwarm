import {
    composeContext,
    IAgentRuntime,
    ModelClass,
    stringToUuid,
    UUID,
    elizaLogger,
    generateMessageResponse,
    State,
    Memory,
    HandlerCallback,
    Content,
} from "@elizaos/core";

import { ClientBase } from "./base.ts";
import { twitterPostTemplate } from "./templates.ts";
import { TwitterHelpers } from "./helpers.ts";

export class TwitterPostClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;

    private postTimeout: NodeJS.Timeout | null = null;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;

        this.logConfigOnInitialization();
    }

    async stop() {
        if (this.postTimeout) {
            clearTimeout(this.postTimeout);
            this.postTimeout = null;
        }
    }

    private logConfigOnInitialization() {
        elizaLogger.log("Twitter Client Configuration:");
        elizaLogger.log(`- Username: ${this.twitterUsername}`);
        elizaLogger.log(
            `- Post Interval: ${this.client.twitterConfig.POST_INTERVAL_MIN}-${this.client.twitterConfig.POST_INTERVAL_MAX} minutes`
        );
        elizaLogger.log(
            `- Post Immediately: ${this.client.twitterConfig.POST_IMMEDIATELY ? "enabled" : "disabled"}`
        );
        elizaLogger.log(
            `- Search Enabled: ${this.client.twitterConfig.TWITTER_SEARCH_ENABLE ? "enabled" : "disabled"}`
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
    }

    private async generateNewTweetLoop() {
        elizaLogger.log("Starting generate new tweet loop");

        const delayMs = this.getPostDelay();
        await this.postTweetInCurrentIteration(delayMs);
        this.setupNextTweetIteration(delayMs);
    }

    private setupNextTweetIteration(delayMs: number) {
        this.postTimeout = setTimeout(() => {
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

    private async generateNewTweet() {
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

            await this.genNewTweet(roomId);
        } catch (error) {
            elizaLogger.error("Error generating new tweet:", error);
        }
    }

    private async genNewTweet(roomId: UUID): Promise<void> {
        const maxTweetLength = this.client.twitterConfig.MAX_TWEET_LENGTH;
        const newTweetContent = await this.generateNewTweetContent(
            roomId,
            maxTweetLength
        );
        elizaLogger.debug("generate new tweet content:\n" + newTweetContent);
    }

    private async generateNewTweetContent(
        roomId: UUID,
        maxTweetLength: number
    ): Promise<void> {
        const state = await this.composeNewTweetState(roomId, maxTweetLength);
        const postContext = this.composeContextAndAction(state);
        const responseMemory = await this.prepareContextAndAction(
            postContext,
            roomId
        );
        this.runtime.messageManager.createMemory({
            memory: responseMemory,
            isUnique: true,
        });

        // Generate a unique ID for this scheduled post attempt
        const scheduledPostId = stringToUuid(
            `scheduled_post_${Date.now()}_${Math.random()}`
        );

        const callback: HandlerCallback = async (response: Content) => {
            const memory: Memory = {
                id: scheduledPostId,
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                roomId,
                content: response,
            };

            await this.runtime.messageManager.createMemory({
                memory,
                isUnique: true,
            });

            await TwitterHelpers.postTweet(
                this.runtime,
                this.client,
                {
                    text: responseMemory.content.text,
                    attachments: response.attachments,
                },
                roomId
            );

            return [memory];
        };

        if (responseMemory.content.action === "NONE") {
            await TwitterHelpers.postTweet(
                this.runtime,
                this.client,
                responseMemory.content,
                roomId
            );
            return;
        }

        const updatedState = await this.runtime.updateRecentMessageState(state);

        await this.runtime.processActions(
            responseMemory,
            [responseMemory],
            updatedState,
            callback,
            {
                tags: ["twitter", "twitter-post"],
            }
        );
    }

    private async prepareContextAndAction(context: string, roomId: UUID) {
        const message: Memory = {
            id: stringToUuid(Date.now().toString()),
            userId: this.runtime.agentId,
            agentId: this.runtime.agentId,
            roomId,
            content: {
                text: new Date().toISOString(),
            },
        };

        const content = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
            tags: ["twitter", "twitter-prepare-context-and-action"],
            message,
        });

        const responseMemory: Memory = {
            id: stringToUuid(Date.now().toString()),
            userId: this.runtime.agentId,
            agentId: this.runtime.agentId,
            roomId,
            content,
        };

        return responseMemory;
    }

    private composeContextAndAction(state: State) {
        const expertContext = composeContext({
            state,
            template:
                this.runtime.character.templates?.twitterPostTemplate ||
                twitterPostTemplate,
        });

        return expertContext;
    }

    private async composeNewTweetState(roomId: UUID, maxTweetLength: number) {
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

        return state;
    }
}
