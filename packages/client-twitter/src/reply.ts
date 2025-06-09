import { type IAgentRuntime, State } from "@elizaos/core";

export class TwitterReplyClient {
    static async cacheReplyTweet(
        runtime: IAgentRuntime,
        tweetId: string,
        state: State,
        text: string
    ) {
        await runtime.cacheManager.set(
            `twitter/reply_generation_${tweetId}.txt`,
            `Context:\n${JSON.stringify(
                state,
                null,
                2
            )}\n\nGenerated Reply:\n${text}`
        );
    }
}

export default TwitterReplyClient;
