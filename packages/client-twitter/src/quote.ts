import type { Tweet } from "agent-twitter-client";
import { type IAgentRuntime, type State } from "@elizaos/core";

import type { ClientBase } from "./base.ts";
import { TwitterHelpers } from "./helpers.ts";

export class TwitterQuoteClient {
    static async process(
        client: ClientBase,
        runtime: IAgentRuntime,
        text: string,
        tweet: Tweet,
        state: State
    ) {
        await TwitterHelpers.handleQuoteTweet(client, text, tweet.id);
        await TwitterQuoteClient.cacheQuoteTweet(runtime, tweet, state, text);
    }

    static async cacheQuoteTweet(
        runtime: IAgentRuntime,
        tweet: Tweet,
        state: State,
        content: string
    ) {
        await runtime.cacheManager.set(
            `twitter/quote_generation_${tweet.id}.txt`,
            `Context:\n${state}\n\nGenerated Quote:\n${content}`
        );
    }
}

export default TwitterQuoteClient;
