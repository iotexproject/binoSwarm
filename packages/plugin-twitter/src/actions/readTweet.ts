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
 * Tweet type - matches client-twitter structure for cache compatibility
 */
export interface Photo {
    id: string;
    url: string;
    alt_text?: string;
}

export interface Video {
    id: string;
    preview: string;
    url?: string;
}

export interface Mention {
    id: string;
    username?: string;
    name?: string;
}

export interface Tweet {
    id: string;
    text: string;
    conversationId: string;
    authorId?: string;
    createdAt?: string;
    inReplyToStatusId?: string;
    quotedTweetId?: string;
    name?: string;
    username?: string;
    userId?: string;
    timestamp?: number;
    permanentUrl?: string;
    hashtags: string[];
    mentions: Mention[];
    photos: Photo[];
    videos: Video[];
    urls: string[];
    thread: Tweet[];
    likes?: number;
    retweets?: number;
    replies?: number;
    bookmarkCount?: number;
    views?: number;
    isQuoted?: boolean;
    isPin?: boolean;
    isReply?: boolean;
    isRetweet?: boolean;
    isSelfThread?: boolean;
    sensitiveContent?: boolean;
}

// Twitter API v2 response types
type TwitterMedia = {
    media_key: string;
    type: string;
    url?: string;
};

type TwitterUser = {
    id: string;
    username: string;
    name: string;
};

type TwitterTweetData = {
    id: string;
    text: string;
    attachments?: {
        media_keys: string[];
    };
    photos?: Array<{ url: string; id?: string; alt_text?: string }>;
    author_id?: string;
    created_at?: string;
    conversation_id?: string;
};

type TwitterApiResponse = {
    data: TwitterTweetData;
    includes?: {
        media: TwitterMedia[];
        users?: TwitterUser[];
    };
};

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
 * Type guard for Twitter API v2 response (for backward compatibility with old cache)
 */
function isTwitterApiResponse(data: unknown): data is TwitterApiResponse {
    return (
        typeof data === "object" &&
        data !== null &&
        "data" in data &&
        typeof (data as Record<string, unknown>).data === "object"
    );
}

/**
 * Transforms Twitter API v2 response to Tweet structure
 * This ensures compatibility with client-twitter's cache format
 */
function transformApiResponseToTweet(apiResponse: TwitterApiResponse): Tweet {
    const tweetData = apiResponse.data;
    const mediaKeys = tweetData.attachments?.media_keys;
    const media = apiResponse.includes?.media;
    const users = apiResponse.includes?.users;

    // Build photos array from media
    const photos: Photo[] = [];
    if (mediaKeys && media) {
        for (const mediaKey of mediaKeys) {
            const mediaItem = media.find((m) => m.media_key === mediaKey);
            if (mediaItem?.type === "photo" && mediaItem.url) {
                photos.push({
                    id: mediaItem.media_key,
                    url: mediaItem.url,
                    alt_text: undefined,
                });
            }
        }
    }

    // Also check for photos in data.photos (some API responses include this)
    if (tweetData.photos) {
        for (const photo of tweetData.photos) {
            if (photo.url && !photos.some((p) => p.url === photo.url)) {
                photos.push({
                    id: photo.id || photo.url,
                    url: photo.url,
                    alt_text: photo.alt_text,
                });
            }
        }
    }

    // Extract user info if available
    let authorId: string | undefined;
    let name: string | undefined;
    let username: string | undefined;
    let userId: string | undefined;

    if (users && users.length > 0) {
        const user = users[0];
        authorId = user.id;
        name = user.name;
        username = user.username;
        userId = user.id;
    } else if (tweetData.author_id) {
        authorId = tweetData.author_id;
        userId = tweetData.author_id;
    }

    return {
        id: tweetData.id,
        text: tweetData.text,
        conversationId: tweetData.conversation_id || tweetData.id,
        authorId,
        createdAt: tweetData.created_at,
        name,
        username,
        userId,
        hashtags: [], // Could be extracted from entities
        mentions: [], // Could be extracted from entities
        photos,
        videos: [],
        urls: [], // Could be extracted from entities
        thread: [],
        permanentUrl: `https://x.com/i/web/status/${tweetData.id}`,
    };
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
 * Generates cache key for a tweet
 */
function getTweetCacheKey(tweetId: string): string {
    return `twitter/tweets/${tweetId}`;
}

/**
 * Validates Twitter URL and extracts tweet ID
 * Returns null if URL is invalid or tweet ID cannot be extracted
 */
async function validateAndExtractTweetId(
    messageText: string,
    callback?: HandlerCallback
): Promise<string | null> {
    const twitterUrl = extractTwitterUrl(messageText);

    if (!twitterUrl) {
        if (callback) {
            callback({
                text: INVALID_URL_MESSAGE,
            });
        }
        return null;
    }

    try {
        return extractTweetId(twitterUrl);
    } catch {
        if (callback) {
            callback({
                text: INVALID_URL_MESSAGE,
            });
        }
        return null;
    }
}

/**
 * Twitter client interface for fetching tweets
 */
type TwitterClient = {
    v2: {
        getTweet: (tweetId: string) => Promise<unknown>;
    };
};

/**
 * Gets or creates a Twitter client for fetching tweets
 * Returns null if client cannot be created
 */
async function getTwitterClient(
    runtime: IAgentRuntime
): Promise<TwitterClient | null> {
    // Try to get Twitter client from runtime first (for full client support)
    const runtimeClient = runtime.clients["twitter"] as TwitterClient | undefined;

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

/**
 * Extract image URLs from tweet data
 * Handles both Tweet structures (flat photos array) and Twitter API v2 responses (nested structure)
 */
/**
 * Extract image URLs from Tweet
 * Works exclusively with Tweet structure
 */
function extractImageUrls(tweet: Tweet): string[] {
    return tweet.photos
        .map((photo) => photo.url)
        .filter((url): url is string => typeof url === "string");
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

// Export the handler function as the default export for use in tests
export { readTweetHandler as readTweet };
