import { elizaLogger } from "@elizaos/core";

import type { ClientBase } from "./base.ts";

export class TwitterLikeClient {
    static async process(client: ClientBase, tweetId: string) {
        try {
            await client.twitterApiV2Client.likeTweet(tweetId);
            elizaLogger.log(`Liked tweet ${tweetId}`);
        } catch (error) {
            elizaLogger.error(`Error liking tweet ${tweetId}:`, error);
        }
    }
}

export default TwitterLikeClient;
