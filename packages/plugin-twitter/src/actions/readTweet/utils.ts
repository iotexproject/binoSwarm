import { extractTweetId } from "../../utils/extractTweetId";
import type { Tweet, TwitterApiResponse, Photo } from "./types";

const TWITTER_URL_PATTERN =
    /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com|mobile\.(?:x\.com|twitter\.com))\/[^\s]+/i;

/**
 * Type guard to check if an error is a Twitter API error with code or status
 */
export function isTwitterApiError(
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
export function isTwitterApiResponse(
    data: unknown
): data is TwitterApiResponse {
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
export function transformApiResponseToTweet(
    apiResponse: TwitterApiResponse
): Tweet {
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
export function extractTwitterUrl(text: string): string | null {
    if (!text) return null;

    const match = text.match(TWITTER_URL_PATTERN);
    return match ? match[0] : null;
}

/**
 * Generates cache key for a tweet
 */
export function getTweetCacheKey(tweetId: string): string {
    return `twitter/tweets/${tweetId}`;
}

/**
 * Validates Twitter URL and extracts tweet ID
 * Returns result object with success status
 * Does NOT use callback - caller handles error response
 */
export async function validateAndExtractTweetId(
    messageText: string
): Promise<{ success: true; tweetId: string } | { success: false }> {
    const twitterUrl = extractTwitterUrl(messageText);

    if (!twitterUrl) {
        return { success: false };
    }

    try {
        const tweetId = extractTweetId(twitterUrl);
        return { success: true, tweetId };
    } catch {
        return { success: false };
    }
}

/**
 * Extract image URLs from Tweet
 * Works exclusively with Tweet structure
 */
export function extractImageUrls(tweet: Tweet): string[] {
    return tweet.photos
        .map((photo) => photo.url)
        .filter((url): url is string => typeof url === "string");
}
