import {
    Action,
    ActionExample,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
    composeContext,
    generateMessageResponse,
    ModelClass,
    ServiceType,
    type IImageDescriptionService,
} from "@elizaos/core";
import { extractTweetId } from "../utils/extractTweetId";
import { createTwitterReadClient } from "../client";
import { tweetResponseTemplate } from "../template";

const INVALID_URL_MESSAGE =
    "I couldn't read that URL. Please make sure it's a valid Twitter/X link.";
const TWEET_NOT_AVAILABLE_MESSAGE = "This tweet is not available";
const TWEET_READ_ERROR_MESSAGE = "I couldn't read this tweet";
const RATE_LIMIT_MESSAGE = "Rate limit reached. Please try again later.";

// URL regex pattern for extracting Twitter/X URLs from text
const TWITTER_URL_PATTERN =
    /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com|mobile\.(?:x\.com|twitter\.com))\/[^\s]+/i;

/**
 * Type guard to check if an error is a Twitter API error with code or status
 */
function isTwitterApiError(
    error: unknown
): error is { code?: number; status?: number } {
    return (
        typeof error === "object" &&
        error !== null &&
        ("code" in error || "status" in error)
    );
}

/**
 * Extracts the first Twitter/X URL from message text
 */
function extractTwitterUrl(text: string): string | null {
    if (!text) return null;

    const match = text.match(TWITTER_URL_PATTERN);
    return match ? match[0] : null;
}

/**
 * Extract image URLs from tweet data
 */
function extractImageUrls(tweetData: any): string[] {
    const photos = tweetData.data?.photos;

    if (!photos || photos.length === 0) {
        return [];
    }

    return photos.map((photo: any) => photo.url).filter((url: string) => url);
}

/**
 * Describe images using the image description service
 */
async function describeImages(
    runtime: IAgentRuntime,
    imageUrls: string[]
): Promise<Array<{ title: string; description: string }>> {
    if (imageUrls.length === 0) {
        return [];
    }

    const imageDescriptionService = runtime.getService<IImageDescriptionService>(
        ServiceType.IMAGE_DESCRIPTION
    );

    if (!imageDescriptionService) {
        elizaLogger.error(
            "Image description service not available. Cannot describe tweet images."
        );
        return [];
    }

    try {
        const descriptions = await Promise.all(
            imageUrls.map(async (url) => {
                try {
                    return await imageDescriptionService.describeImage(url);
                } catch (error) {
                    elizaLogger.error(`Failed to describe image ${url}:`, error);
                    return null;
                }
            })
        );

        return descriptions.filter(
            (desc): desc is { title: string; description: string } => desc !== null
        );
    } catch (error) {
        elizaLogger.error("Error processing tweet images:", error);
        return [];
    }
}

/**
 * READ_TWEET action handler function
 * Reads a tweet from a Twitter/X URL and uses LLM to generate a response
 *
 * This handler follows the lightweight LLM-driven pattern:
 * 1. Validates URL and extracts tweet ID
 * 2. Fetches raw tweet data from Twitter API
 * 3. Passes data to LLM via template context
 * 4. LLM generates persona-aware, contextual response
 */
async function readTweetHandler(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: { [key: string]: unknown },
    callback?: HandlerCallback
): Promise<boolean> {
    try {
        // Initialize state if needed
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else if (typeof runtime.updateRecentMessageState === "function") {
            state = await runtime.updateRecentMessageState(state);
        }

        // Extract Twitter URL from message text
        const twitterUrl = extractTwitterUrl(message.content.text);

        if (!twitterUrl) {
            if (callback) {
                callback({
                    text: INVALID_URL_MESSAGE,
                });
            }
            return false;
        }

        // Extract tweet ID from URL
        let tweetId: string;
        try {
            tweetId = extractTweetId(twitterUrl);
        } catch {
            if (callback) {
                callback({
                    text: INVALID_URL_MESSAGE,
                });
            }
            return false;
        }

        // Try to get Twitter client from runtime first (for full client support)
        let twitterClient = runtime.clients["twitter"] as unknown as {
            v2: {
                getTweet: (tweetId: string) => Promise<any>;
            };
        };

        // If Twitter client not loaded, create a lightweight read client
        if (!twitterClient || !twitterClient.v2) {
            elizaLogger.debug(
                "Twitter client not loaded in runtime, creating lightweight read client"
            );
            const readClient = await createTwitterReadClient(runtime);

            if (!readClient) {
                elizaLogger.error(
                    "Failed to create Twitter read client - TWITTER_BEARER_TOKEN may be missing"
                );
                if (callback) {
                    callback({
                        text: TWEET_READ_ERROR_MESSAGE,
                    });
                }
                return false;
            }

            // Wrap the read client to match the expected interface
            twitterClient = {
                v2: {
                    getTweet: (tweetId: string) => readClient.getTweet(tweetId),
                },
            };
        }

        // Fetch tweet data
        let tweetData;
        try {
            tweetData = await twitterClient.v2.getTweet(tweetId);
        } catch (error) {
            // Safely extract error code using type guard
            let errorCode: number | undefined;
            if (isTwitterApiError(error)) {
                errorCode = error.code ?? error.status;
            }

            // Handle rate limit errors (429)
            if (errorCode === 429) {
                if (callback) {
                    callback({
                        text: RATE_LIMIT_MESSAGE,
                    });
                }
                return false;
            }

            // Handle not found errors (404)
            if (errorCode === 404) {
                if (callback) {
                    callback({
                        text: TWEET_NOT_AVAILABLE_MESSAGE,
                    });
                }
                return false;
            }

            // Handle forbidden errors (403) - protected accounts, suspended accounts
            if (errorCode === 403) {
                if (callback) {
                    callback({
                        text: TWEET_READ_ERROR_MESSAGE,
                    });
                }
                return false;
            }

            // Handle other API errors (including no code/status)
            elizaLogger.error("Error fetching tweet:", error);
            if (callback) {
                callback({
                    text: TWEET_READ_ERROR_MESSAGE,
                });
            }
            return false;
        }

        // Check if tweet was found
        if (!tweetData) {
            if (callback) {
                callback({
                    text: TWEET_NOT_AVAILABLE_MESSAGE,
                });
            }
            return false;
        }

        // Extract image URLs from tweet
        const imageUrls = extractImageUrls(tweetData);

        // Describe images using image description service
        const imageDescriptions = await describeImages(runtime, imageUrls);

        // Pass tweet data to LLM for processing
        state.tweetData = JSON.stringify(tweetData, null, 2);
        state.imageUrls = imageUrls;
        state.imageDescriptions = imageDescriptions;

        // Generate LLM response
        const context = composeContext({
            state,
            template: tweetResponseTemplate,
        });

        const response = await generateMessageResponse({
            runtime,
            context,
            modelClass: ModelClass.LARGE,
            tags: ["read-tweet"],
            message: message,
        });

        if (callback) {
            callback({ ...response, inReplyTo: message.id });
        }

        return true;
    } catch (error) {
        elizaLogger.error("Unexpected error in READ_TWEET handler:", error);
        if (callback) {
            callback({
                text: TWEET_READ_ERROR_MESSAGE,
            });
        }
        return false;
    }
}

/**
 * READ_TWEET action
 * Reads a tweet from a Twitter/X URL and uses LLM to generate a contextual response
 */
export const readTweetAction: Action = {
    name: "READ_TWEET",
    similes: [
        "READ_TWEET",
        "READ_POST",
        "READ_TWEET_URL",
        "FETCH_TWEET",
        "GET_TWEET",
        "READ_X_POST",
        "READ_X_TWEET",
        "READ_STATUS",
    ],
    description:
        "Reads a tweet from a Twitter/X URL and provides a contextual analysis. Use this when the user provides a tweet URL or asks about a specific tweet. The action fetches the tweet data and generates a persona-aware response based on the user's question.",
    suppressInitialMessage: true,
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        const bearerToken = runtime.getSetting("TWITTER_BEARER_TOKEN");
        return Boolean(bearerToken && bearerToken.trim().length > 0);
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What do you think about this? https://x.com/user/status/1234567890",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "",
                    action: "READ_TWEET",
                },
            },
        ],
    ] as ActionExample[][],
    handler: readTweetHandler,
};

// Export the handler function as the default export for use in tests
export { readTweetHandler as readTweet };
