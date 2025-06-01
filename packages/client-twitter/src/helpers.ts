import {
    elizaLogger,
    IAgentRuntime,
    truncateToCompleteSentence,
    UUID,
    stringToUuid,
} from "@elizaos/core";
import { Tweet } from "agent-twitter-client";

import { ClientBase } from "./base";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment.ts";

export class TwitterHelpers {
    static async handleNoteTweet(
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
                newTweetContent
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
}

export default TwitterHelpers;
