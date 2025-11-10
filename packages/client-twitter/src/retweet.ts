import { elizaLogger } from "@elizaos/core";

import type { ClientBase } from "./base.ts";

export class TwitterRetweetClient {
    static async process(client: ClientBase, tweetId: string) {
        try {
            await client.twitterApiV2Client.retweet(tweetId);
            elizaLogger.log(`Retweeted tweet ${tweetId}`);
        } catch (error) {
            elizaLogger.error(`Error retweeting tweet ${tweetId}:`, error);
        }
    }
}

export default TwitterRetweetClient;
