import { TwitterApi } from "twitter-api-v2";
import { elizaLogger } from "@elizaos/core";

/**
 * Lightweight Twitter API client for read-only operations in the plugin.
 * This client can be initialized independently of the main Twitter client,
 * allowing plugins to read tweets even when the Twitter client is not loaded.
 *
 * Returns raw Twitter API v2 responses - no transformation, letting the LLM process the data.
 */
export class TwitterReadClient {
    private client: TwitterApi;

    constructor(bearerToken: string) {
        if (!bearerToken) {
            throw new Error(
                "TWITTER_BEARER_TOKEN is required for Twitter read client"
            );
        }

        this.client = new TwitterApi(bearerToken);
        elizaLogger.log("Twitter read client initialized");
    }

    /**
     * Fetch a single tweet by ID
     * Returns raw Twitter API v2 response for LLM processing
     */
    async getTweet(tweetId: string): Promise<any> {
        try {
            const response = await this.client.v2.singleTweet(tweetId, {
                expansions: [
                    "author_id",
                    "referenced_tweets.id",
                    "referenced_tweets.id.author_id",
                    "attachments.media_keys",
                    "in_reply_to_user_id",
                ],
                "tweet.fields": [
                    "created_at",
                    "conversation_id",
                    "in_reply_to_user_id",
                    "referenced_tweets",
                    "author_id",
                    "public_metrics",
                    "context_annotations",
                    "entities",
                    "attachments",
                ],
                "user.fields": ["username", "name", "id"],
                "media.fields": [
                    "type",
                    "url",
                    "preview_image_url",
                    "alt_text",
                ],
            });

            if (!response.data) {
                return null;
            }

            // Return the full response including data and includes
            return {
                data: response.data,
                includes: response.includes,
            };
        } catch (error) {
            const errorCode = this.getErrorCode(error);
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            elizaLogger.error("Error fetching tweet:", {
                tweetId,
                errorCode,
                errorMessage,
            });

            // Re-throw with error code for handler to process
            const typedError: Error & { code?: number } = new Error(
                errorMessage
            );
            typedError.code = errorCode;
            throw typedError;
        }
    }

    /**
     * Extract error code from API error
     */
    private getErrorCode(error: unknown): number | undefined {
        if (typeof error === "object" && error !== null) {
            if ("code" in error) {
                return typeof error.code === "number" ? error.code : undefined;
            }
            if ("status" in error) {
                return typeof error.status === "number" ? error.status : undefined;
            }
        }
        return undefined;
    }
}

/**
 * Create and initialize a Twitter read client from runtime settings
 */
export async function createTwitterReadClient(
    runtime: any
): Promise<TwitterReadClient | null> {
    try {
        const bearerToken = runtime.getSetting("TWITTER_BEARER_TOKEN");

        if (!bearerToken) {
            elizaLogger.warn(
                "TWITTER_BEARER_TOKEN not found in runtime settings. Twitter read functionality will not be available."
            );
            return null;
        }

        return new TwitterReadClient(bearerToken);
    } catch (error) {
        elizaLogger.error("Failed to initialize Twitter read client:", error);
        return null;
    }
}
