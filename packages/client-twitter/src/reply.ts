import { type IAgentRuntime, State } from "@elizaos/core";

import type { ClientBase } from "./base";
import { TwitterHelpers } from "./helpers";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment.ts";

export class TwitterReplyClient {
    static async process(
        client: ClientBase,
        runtime: IAgentRuntime,
        state: State,
        tweetId: string,
        text: string
    ) {
        if (text.length > DEFAULT_MAX_TWEET_LENGTH) {
            await TwitterHelpers.handleNoteTweet(client, text, tweetId);
        } else {
            await TwitterHelpers.handleStandardTweet(client, text, tweetId);
        }
        
        await TwitterReplyClient.cacheReplyTweet(runtime, tweetId, state, text);
    }

    static async cacheReplyTweet(
        runtime: IAgentRuntime,
        tweetId: string,
        state: State,
        text: string
    ) {
        await runtime.cacheManager.set(
            `twitter/reply_generation_${tweetId}.txt`,
            `Context:\n${state}\n\nGenerated Reply:\n${text}`
        );
    }
}

export default TwitterReplyClient;
