import { truncateToCompleteSentence } from "@elizaos/core";

import { ClientBase } from "./base";

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
            return await TwitterHelpers.sendStandardTweet(
                client,
                truncateContent,
                tweetId
            );
        } else if (!noteTweetResult.data?.notetweet_create?.tweet_results) {
            throw new Error(`Note Tweet failed`);
        }

        return noteTweetResult.data.notetweet_create.tweet_results.result;
    }

    static async sendStandardTweet(
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
}
