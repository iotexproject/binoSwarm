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
import { tweetResponseTemplate, tweetErrorResponseTemplate } from "../template";
import type { Tweet } from "./readTweet/types";
import {
    isTwitterApiError,
    isTwitterApiResponse,
    transformApiResponseToTweet,
    validateAndExtractTweetId,
    getTweetCacheKey,
    extractImageUrls,
    extractTwitterUrl,
} from "./readTweet/utils";
import { getTwitterClient } from "./readTweet/clientUtils";

/**
 * Safe error types that can be exposed to the LLM
 * These types abstract away raw API error codes and messages
 */
const SAFE_ERROR_TYPES = {
    INVALID_URL: "invalid_url",
    TWEET_NOT_FOUND: "tweet_not_found",
    TWEET_PROTECTED: "tweet_protected",
    TWEET_FORBIDDEN: "tweet_forbidden",
    RATE_LIMITED: "rate_limited",
    CLIENT_ERROR: "client_error",
    DATA_UNAVAILABLE: "data_unavailable",
    API_ERROR: "api_error",
} as const;

type SafeErrorType = (typeof SAFE_ERROR_TYPES)[keyof typeof SAFE_ERROR_TYPES];

/**
 * Maps API errors to safe error types that can be exposed to the LLM
 * This function ensures raw API codes and messages never reach the LLM
 */
function mapApiErrorToSafeType(
    error: unknown,
    _tweetUrl?: string
): SafeErrorType {
    // Check for Twitter API error with code/status
    if (isTwitterApiError(error)) {
        const errorCode = error.code ?? error.status;

        // 404 → tweet_not_found
        if (errorCode === 404) {
            return SAFE_ERROR_TYPES.TWEET_NOT_FOUND;
        }

        // 403 with protected/suspended message → tweet_protected
        if (errorCode === 403) {
            const errorMessage =
                (error as Record<string, unknown>).errors?.[0]?.message;
            if (
                typeof errorMessage === "string" &&
                (errorMessage.toLowerCase().includes("protected") ||
                    errorMessage.toLowerCase().includes("suspended"))
            ) {
                return SAFE_ERROR_TYPES.TWEET_PROTECTED;
            }
            // 403 without specific message → tweet_forbidden
            return SAFE_ERROR_TYPES.TWEET_FORBIDDEN;
        }

        // 429 → rate_limited
        if (errorCode === 429) {
            return SAFE_ERROR_TYPES.RATE_LIMITED;
        }
    }

    // For all other errors, default to api_error
    return SAFE_ERROR_TYPES.API_ERROR;
}

/**
 * Processes tweet errors using safe error types
 * Sets state.errorType (safe type) and generates LLM response
 * Never exposes raw API codes or messages to the LLM
 */
async function processTweetError(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    safeErrorType: SafeErrorType,
    tweetUrl: string | undefined,
    callback?: HandlerCallback
): Promise<boolean> {
    // Set safe error type in state (NOT errorCode or raw error details)
    (state as Record<string, unknown>).errorType = safeErrorType;
    (state as Record<string, unknown>).userIntent = "read tweet";

    // Optionally set tweetUrl if available (user-provided, safe)
    if (tweetUrl) {
        (state as Record<string, unknown>).tweetUrl = tweetUrl;
    }

    // Compose context with error template
    const context = composeContext({
        state,
        template: tweetErrorResponseTemplate,
        templatingEngine: "handlebars",
    });

    // Generate LLM response with read-tweet-error tag
    const response = await generateMessageResponse({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
        tags: ["read-tweet-error"],
        message: message,
    });

    if (callback) {
        callback({ ...response, inReplyTo: message.id });
    }

    return false; // Error cases always return false
}

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
 * Maps API errors to safe error types and processes with LLM
 */
async function handleTwitterApiError(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    error: unknown,
    tweetUrl: string | undefined,
    callback?: HandlerCallback
): Promise<boolean> {
    const safeErrorType = mapApiErrorToSafeType(error, tweetUrl);

    elizaLogger.error(
        `Twitter API error (${safeErrorType}):`,
        error
    );

    return processTweetError(
        runtime,
        message,
        state,
        safeErrorType,
        tweetUrl,
        callback
    );
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
        const validationResult = await validateAndExtractTweetId(
            message.content.text
        );

        if (!validationResult.success) {
            // Invalid URL - use safe error type
            return processTweetError(
                runtime,
                message,
                state,
                SAFE_ERROR_TYPES.INVALID_URL,
                undefined,
                callback
            );
        }

        const tweetId = validationResult.tweetId;

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
            // Twitter client unavailable - use safe error type
            const tweetUrl = extractTwitterUrl(message.content.text);
            return processTweetError(
                runtime,
                message,
                state,
                SAFE_ERROR_TYPES.CLIENT_ERROR,
                tweetUrl ?? undefined,
                callback
            );
        }

        let tweetData;
        try {
            tweetData = await twitterClient.v2.getTweet(tweetId);
        } catch (error) {
            // API error - map to safe type and process with LLM
            const tweetUrl = extractTwitterUrl(message.content.text);
            return handleTwitterApiError(
                runtime,
                message,
                state,
                error,
                tweetUrl ?? undefined,
                callback
            );
        }

        if (!tweetData) {
            // Tweet data is null/undefined - use safe error type
            const tweetUrl = extractTwitterUrl(message.content.text);
            return processTweetError(
                runtime,
                message,
                state,
                SAFE_ERROR_TYPES.DATA_UNAVAILABLE,
                tweetUrl ?? undefined,
                callback
            );
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
        const tweetUrl = extractTwitterUrl(message.content.text);
        // If state is null, create a minimal state object for error processing
        const errorState = state || ({} as State);
        return processTweetError(
            runtime,
            message,
            errorState,
            SAFE_ERROR_TYPES.API_ERROR,
            tweetUrl ?? undefined,
            callback
        );
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
