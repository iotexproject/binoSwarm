import { Tweet } from "agent-twitter-client";
import {
    composeContext,
    getEmbeddingZeroVector,
    IAgentRuntime,
    ModelClass,
    stringToUuid,
    UUID,
    truncateToCompleteSentence,
    elizaLogger,
    generateMessageResponse,
} from "@elizaos/core";
import {
    Client,
    Events,
    GatewayIntentBits,
    TextChannel,
    Partials,
} from "discord.js";

import { ClientBase } from "./base.ts";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment.ts";
import { PendingTweet, PendingTweetApprovalStatus } from "./types.ts";
import { twitterPostTemplate } from "./templates.ts";
import { TwitterHelpers } from "./helpers.ts";

export class TwitterPostClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
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
            `- Post Immediately: ${this.client.twitterConfig.POST_IMMEDIATELY ? "enabled" : "disabled"}`
        );
        elizaLogger.log(
            `- Search Enabled: ${this.client.twitterConfig.TWITTER_SEARCH_ENABLE ? "enabled" : "disabled"}`
        );
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
                result = await TwitterHelpers.handleNoteTweet(
                    client,
                    cleanedContent
                );
            } else {
                result = await TwitterHelpers.handleStandardTweet(
                    client,
                    cleanedContent
                );
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

        let cleanedContent = this.truncateNewTweet(
            maxTweetLength,
            newTweetContent
        );
        cleanedContent = this.fixNewLines(cleanedContent);
        cleanedContent = this.removeQuotes(cleanedContent);

        return cleanedContent;
    }

    private async generateNewTweetContent(
        roomId: UUID,
        maxTweetLength: number
    ) {
        const context = await this.composeNewTweetContext(
            roomId,
            maxTweetLength
        );

        const { text } = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        return text;
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
