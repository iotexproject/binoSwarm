import {
    Action,
    ActionExample,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
} from "@elizaos/core";
import { extractTweetId } from "../utils/extractTweetId";
import { formatTweet } from "../utils/formatTweet";

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
 * Type guard to validate tweet structure before formatting
 */
function isValidTweet(tweet: unknown): tweet is {
    text?: string;
    name?: string;
    username?: string;
    [key: string]: unknown;
} {
    return typeof tweet === "object" && tweet !== null;
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
 * READ_TWEET action handler function
 * Reads a tweet from a Twitter/X URL and returns formatted content
 *
 * This handler can be called as readTweet(runtime, message, state, options, callback)
 */
async function readTweetHandler(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: { [key: string]: unknown },
    callback?: HandlerCallback
): Promise<boolean> {
    try {
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

        // Get Twitter client from runtime
        const twitterClient = runtime.clients["twitter"] as unknown as {
            v2: {
                getTweet: (tweetId: string) => Promise<any>;
            };
        };

        if (!twitterClient || !twitterClient.v2) {
            elizaLogger.error("Twitter client not available in runtime");
            if (callback) {
                callback({
                    text: TWEET_READ_ERROR_MESSAGE,
                });
            }
            return false;
        }

        // Fetch tweet
        let tweet;
        try {
            tweet = await twitterClient.v2.getTweet(tweetId);
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
        if (!tweet) {
            if (callback) {
                callback({
                    text: TWEET_NOT_AVAILABLE_MESSAGE,
                });
            }
            return false;
        }

        // Validate tweet structure before formatting
        if (!isValidTweet(tweet)) {
            elizaLogger.error("Invalid tweet structure received from API");
            if (callback) {
                callback({
                    text: TWEET_READ_ERROR_MESSAGE,
                });
            }
            return false;
        }

        // Format tweet for display with defensive error handling
        let formattedTweet: string;
        try {
            formattedTweet = formatTweet(tweet as any);
        } catch (error) {
            elizaLogger.error("Error formatting tweet:", error);
            if (callback) {
                callback({
                    text: TWEET_READ_ERROR_MESSAGE,
                });
            }
            return false;
        }

        // Send formatted tweet as response
        if (callback) {
            callback({
                text: formattedTweet,
            });
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
 * Reads a tweet from a Twitter/X URL and returns formatted content
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
        "Reads a tweet from a Twitter/X URL and returns its content including text, author, metrics, and media information. Use this when the user provides a tweet URL or asks about a specific tweet.",
    suppressInitialMessage: true,
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
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
