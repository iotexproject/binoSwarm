import { IAgentRuntime, UUID, elizaLogger } from "@elizaos/core";
import {
    Client,
    Events,
    GatewayIntentBits,
    TextChannel,
    Partials,
} from "discord.js";

import { PendingTweet, PendingTweetApprovalStatus } from "./types.ts";
import { TwitterHelpers } from "./helpers.ts";
import { ClientBase } from "./base.ts";

export class DiscordApprover {
    private discordClientForApproval: Client;
    private client: ClientBase;
    private discordApprovalChannelId: string;
    private approvalCheckInterval: number;
    private runtime: IAgentRuntime;

    private twitterUsername: string;

    constructor(
        runtime: IAgentRuntime,
        client: ClientBase,
        twitterUsername: string
    ) {
        this.runtime = runtime;
        this.twitterUsername = twitterUsername;
        this.client = client;
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

        this.discordApprovalChannelId = approvalChannelId;

        // Set up Discord client event handlers
        this.setupDiscordClient();
    }

    runPendingTweetCheckLoop() {
        setInterval(async () => {
            await this.handlePendingTweet();
        }, this.approvalCheckInterval);
    }

    async sendForApproval(
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
                        value: this.twitterUsername,
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

            const validatedChannel = this.validateChannel(channel);

            const message = await validatedChannel.send({ embeds: [embed] });

            // Store the pending tweet
            const pendingTweetsKey = `twitter/${this.twitterUsername}/pendingTweet`;
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

    private validateChannel(channel: any): TextChannel {
        if (!channel || !(channel instanceof TextChannel)) {
            throw new Error("Invalid approval channel");
        }
        return channel;
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
        const pendingTweetsKey = `twitter/${this.twitterUsername}/pendingTweet`;
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
        const pendingTweetsKey = `twitter/${this.twitterUsername}/pendingTweet`;
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

            elizaLogger.debug("Checking approval status...");
            const approvalStatus: PendingTweetApprovalStatus =
                await this.checkApprovalStatus(pendingTweet.discordMessageId);

            if (approvalStatus === "APPROVED") {
                elizaLogger.log("Tweet Approved, Posting");
                await TwitterHelpers.postTweet(
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
}
