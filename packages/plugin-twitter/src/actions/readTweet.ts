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
import { tweetResponseTemplate } from "../template";
import type { Tweet } from "./readTweet/types";
import {
    isTwitterApiError,
    isTwitterApiResponse,
    transformApiResponseToTweet,
    validateAndExtractTweetId,
    getTweetCacheKey,
    extractImageUrls,
} from "./readTweet/utils";
import { getTwitterClient } from "./readTweet/clientUtils";

const TWEET_NOT_AVAILABLE_MESSAGE = "This tweet is not available";
const TWEET_READ_ERROR_MESSAGE = "I couldn't read this tweet";
const RATE_LIMIT_MESSAGE = "Rate limit reached. Please try again later.";

/**
 * Caches tweet data with graceful error handling
 * Cache failures do not prevent handler success
 */
async function cacheTweetData(
    cacheManager: IAgentRuntime["cacheManager"],
    cacheKey: string,
    tweetData: unknown
): Promise<void> {
    if (!cacheManager) return;

    try {
        await cacheManager.set(cacheKey, tweetData);
    } catch (error) {
        elizaLogger.error("Failed to cache tweet:", error);
    }
}

/**
 * Handles Twitter API errors and returns appropriate user messages
 */
function handleTwitterApiError(
    error: unknown,
    callback?: HandlerCallback
): boolean {
    let errorCode: number | undefined;
    if (isTwitterApiError(error)) {
        errorCode = error.code ?? error.status;
    }

    if (errorCode === 429) {
        if (callback) {
            callback({ text: RATE_LIMIT_MESSAGE });
        }
        return false;
    }

    if (errorCode === 404) {
        if (callback) {
            callback({ text: TWEET_NOT_AVAILABLE_MESSAGE });
        }
        return false;
    }

    if (errorCode === 403) {
        if (callback) {
            callback({ text: TWEET_READ_ERROR_MESSAGE });
        }
        return false;
    }

    elizaLogger.error("Error fetching tweet:", error);
    if (callback) {
        callback({ text: TWEET_READ_ERROR_MESSAGE });
    }
    return false;
}

async function processTweetWithLLM(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    tweet: Tweet,
    callback?: HandlerCallback
): Promise<boolean> {
    const imageUrls = extractImageUrls(tweet);
    const imageDescriptions = await describeImages(runtime, imageUrls);

    state.tweetData = JSON.stringify(tweet, null, 2);
    state.imageUrls = imageUrls;
    state.imageDescriptions = imageDescriptions;

    const context = composeContext({
        state,
        template: tweetResponseTemplate,
        templatingEngine: "handlebars",
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
}

async function describeImages(
    runtime: IAgentRuntime,
    imageUrls: string[]
): Promise<Array<{ title: string; description: string }>> {
    if (imageUrls.length === 0) {
        return [];
    }

    const imageDescriptionService =
        runtime.getService<IImageDescriptionService>(
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
                    elizaLogger.error(
                        `Failed to describe image ${url}:`,
                        error
                    );
                    return null;
                }
            })
        );

        return descriptions.filter(
            (desc): desc is { title: string; description: string } =>
                desc !== null
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

        // Validate URL and extract tweet ID
        const tweetId = await validateAndExtractTweetId(
            message.content.text,
            callback
        );

        if (!tweetId) {
            return false;
        }

        // AC1: Check cache first - return cached tweet without API call if available
        const cacheKey = getTweetCacheKey(tweetId);
        let cachedTweet;
        try {
            cachedTweet = await runtime.cacheManager?.get(cacheKey);
        } catch (error) {
            // Cache errors should not prevent the handler from succeeding
            // Treat cache.get errors as cache miss and fall through to API fetch
            elizaLogger.debug("Cache get error, falling back to API:", error);
            cachedTweet = null;
        }

        if (cachedTweet) {
            elizaLogger.debug(`Cache hit for tweet ${tweetId}`);
            // Transform cached data if it's in old API format
            const tweet = isTwitterApiResponse(cachedTweet)
                ? transformApiResponseToTweet(cachedTweet)
                : (cachedTweet as Tweet);
            return processTweetWithLLM(
                runtime,
                message,
                state,
                tweet,
                callback
            );
        }

        // Cache miss - proceed to fetch from API
        const twitterClient = await getTwitterClient(runtime);

        if (!twitterClient) {
            if (callback) {
                callback({
                    text: TWEET_READ_ERROR_MESSAGE,
                });
            }
            return false;
        }

        let tweetData;
        try {
            tweetData = await twitterClient.v2.getTweet(tweetId);
        } catch (error) {
            return handleTwitterApiError(error, callback);
        }

        if (!tweetData) {
            if (callback) {
                callback({ text: TWEET_NOT_AVAILABLE_MESSAGE });
            }
            return false;
        }

        // Transform API response to Tweet structure
        const tweet = isTwitterApiResponse(tweetData)
            ? transformApiResponseToTweet(tweetData)
            : (tweetData as Tweet);

        // AC3: Cache the tweet after successful API fetch
        await cacheTweetData(runtime.cacheManager, cacheKey, tweet);

        return processTweetWithLLM(
            runtime,
            message,
            state,
            tweet,
            callback
        );
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

// Re-export types for backward compatibility
export type {
    Photo,
    Video,
    Mention,
    Tweet,
    TwitterMedia,
    TwitterUser,
    TwitterTweetData,
    TwitterApiResponse,
    TwitterClient,
} from "./readTweet/types";

// Export the handler function as the default export for use in tests
export { readTweetHandler as readTweet };
