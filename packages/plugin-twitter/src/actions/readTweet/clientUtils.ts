import { elizaLogger } from "@elizaos/core";
import { createTwitterReadClient } from "../../client";
import type { IAgentRuntime } from "@elizaos/core";
import type { TwitterClient } from "./types";

/**
 * Gets or creates a Twitter client for fetching tweets
 * Returns null if client cannot be created
 */
export async function getTwitterClient(
    runtime: IAgentRuntime
): Promise<TwitterClient | null> {
    // Try to get Twitter client from runtime first (for full client support)
    const runtimeClient = runtime.clients["twitter"] as
        | TwitterClient
        | undefined;

    if (runtimeClient?.v2) {
        return runtimeClient;
    }

    // Create a lightweight read client
    elizaLogger.debug(
        "Twitter client not loaded in runtime, creating lightweight read client"
    );
    const readClient = await createTwitterReadClient(runtime);

    if (!readClient) {
        elizaLogger.error(
            "Failed to create Twitter read client - TWITTER_BEARER_TOKEN may be missing"
        );
        return null;
    }

    // Wrap the read client to match the expected interface
    return {
        v2: {
            getTweet: (tweetId: string) => readClient.getTweet(tweetId),
        },
    };
}
