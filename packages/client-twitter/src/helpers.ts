import {
    elizaLogger,
    IAgentRuntime,
    truncateToCompleteSentence,
    UUID,
    stringToUuid,
    Content,
} from "@elizaos/core";
import { Tweet } from "agent-twitter-client";

import { ClientBase } from "./base";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment.ts";
import { processAttachments } from "./utils";

export class TwitterHelpers {
    static async handleNoteTweet(
        client: ClientBase,
        content: string,
        tweetId?: string,
        mediaData?: { data: Buffer; mediaType: string }[]
    ) {
        const noteTweetResult = await client.requestQueue.add(
            async () =>
                await client.twitterClient.sendNoteTweet(
                    content,
                    tweetId,
                    mediaData
                )
        );

        if (noteTweetResult.errors && noteTweetResult.errors.length > 0) {
            // Note Tweet failed due to authorization. Falling back to standard Tweet.
            const truncateContent = truncateToCompleteSentence(
                content,
                client.twitterConfig.MAX_TWEET_LENGTH
            );
            return await TwitterHelpers.handleStandardTweet(
                client,
                truncateContent,
                tweetId
            );
        } else if (!noteTweetResult.data?.notetweet_create?.tweet_results) {
            throw new Error(`Note Tweet failed`);
        }

        return noteTweetResult.data.notetweet_create.tweet_results.result;
    }

    static async handleStandardTweet(
        client: ClientBase,
        content: string,
        tweetId?: string,
        mediaData?: { data: Buffer; mediaType: string }[]
    ) {
        const standardTweetResult = await client.requestQueue.add(
            async () =>
                await client.twitterClient.sendTweet(
                    content,
                    tweetId,
                    mediaData
                )
        );

        const body = await standardTweetResult.json();
        if (!body?.data?.create_tweet?.tweet_results?.result) {
            throw new Error("Error sending tweet; Bad response");
        }

        return body.data.create_tweet.tweet_results.result;
    }

    static async handleQuoteTweet(
        client: ClientBase,
        content: string,
        tweetId?: string
    ) {
        const result = await client.requestQueue.add(
            async () =>
                await client.twitterClient.sendQuoteTweet(content, tweetId)
        );

        const body = await result.json();

        if (body?.data?.create_tweet?.tweet_results?.result) {
            elizaLogger.log("Successfully posted quote tweet");
        } else {
            elizaLogger.error("Quote tweet creation failed:", body);
            throw new Error("Quote tweet creation failed");
        }
    }

    static async postTweet(
        runtime: IAgentRuntime,
        client: ClientBase,
        content: Content,
        roomId: UUID,
        twitterUsername: string
    ) {
        try {
            if (!content || !content.text) {
                elizaLogger.error(
                    "Cannot send tweet: content or content.text is null"
                );
                return;
            }

            elizaLogger.log(`Posting new tweet:\n ${content.text}`);
            elizaLogger.debug("Content attachments:", content.attachments);

            let mediaData: { data: Buffer; mediaType: string }[] | undefined;

            // Process attachments if present
            if (content.attachments && content.attachments.length > 0) {
                mediaData = await processAttachments(content.attachments);
            }

            let result;

            if (content.text.length > DEFAULT_MAX_TWEET_LENGTH) {
                result = await TwitterHelpers.handleNoteTweet(
                    client,
                    content.text,
                    undefined,
                    mediaData
                );
            } else {
                result = await TwitterHelpers.handleStandardTweet(
                    client,
                    content.text,
                    undefined,
                    mediaData
                );
            }

            const tweet = TwitterHelpers.createTweetObject(
                result,
                client,
                twitterUsername
            );

            await TwitterHelpers.processAndCacheTweet(
                runtime,
                client,
                tweet,
                roomId,
                content.text
            );
        } catch (error) {
            elizaLogger.error("Error sending tweet:", error);
        }
    }

    static async processAndCacheTweet(
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
            memory: {
                id: stringToUuid(tweet.id + "-" + runtime.agentId),
                userId: runtime.agentId,
                agentId: runtime.agentId,
                content: {
                    text: newTweetContent.trim(),
                    url: tweet.permanentUrl,
                    source: "twitter",
                },
                roomId,
                createdAt: tweet.timestamp,
            },
            isUnique: true,
        });
    }

    static createTweetObject(
        tweetResult: {
            rest_id: string;
            legacy: {
                full_text: string;
                conversation_id_str: string;
                created_at: string;
                in_reply_to_status_id_str?: string;
            };
        },
        client: ClientBase,
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

    static buildFromUsersQuery(usernames: string[]): string {
        if (usernames.length === 0) {
            throw new Error("Cannot build query for empty usernames array");
        }
        return usernames.map((username) => `from:${username}`).join(" OR ");
    }

    static async getMaxTweetId(client: any): Promise<string | undefined> {
        const lastCheckedTweetId = client.lastCheckedTweetId;
        const lastKnowledgeCheckedTweetId =
            await client.loadLatestKnowledgeCheckedTweetId();

        // If both exist, return the maximum (most recent)
        if (lastCheckedTweetId && lastKnowledgeCheckedTweetId) {
            return BigInt(lastCheckedTweetId) >
                BigInt(lastKnowledgeCheckedTweetId)
                ? lastCheckedTweetId.toString()
                : lastKnowledgeCheckedTweetId.toString();
        }

        // Return whichever one exists, or undefined if neither
        return (
            lastCheckedTweetId?.toString() ||
            lastKnowledgeCheckedTweetId?.toString()
        );
    }
}

export default TwitterHelpers;
