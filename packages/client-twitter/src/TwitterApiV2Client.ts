import { TwitterApi, TweetV2, TwitterApiReadOnly } from "twitter-api-v2";
import { Tweet } from "agent-twitter-client";
import { elizaLogger } from "@elizaos/core";
import { TwitterConfig } from "./environment.ts";
import { formatRateLimitInfo, getErrorCode } from "./twitterApiErrors.ts";

// Local type definitions (not exported from agent-twitter-client)
interface Photo {
    id: string;
    url: string;
    alt_text: string | undefined;
}

interface Video {
    id: string;
    preview: string;
    url?: string;
}

interface Mention {
    id: string;
    username?: string;
    name?: string;
}

export class TwitterApiV2Client {
    private readOnlyClient: TwitterApiReadOnly;
    private userContextClient?: TwitterApiReadOnly;
    private writableClient?: TwitterApi;

    constructor(config: TwitterConfig) {
        if (!config.TWITTER_BEARER_TOKEN) {
            throw new Error(
                "TWITTER_BEARER_TOKEN is required for Twitter API v2 client"
            );
        }

        try {
            // Initialize Bearer Token client for app-only authentication
            const twitterApi = new TwitterApi(config.TWITTER_BEARER_TOKEN);
            this.readOnlyClient = twitterApi.readOnly;
            elizaLogger.log("Twitter API v2 initialized with bearer token");

            // Initialize OAuth 1.0a client for user context authentication if credentials provided
            if (
                config.TWITTER_API_KEY &&
                config.TWITTER_API_SECRET &&
                config.TWITTER_ACCESS_TOKEN &&
                config.TWITTER_ACCESS_TOKEN_SECRET
            ) {
                const userContextApi = new TwitterApi({
                    appKey: config.TWITTER_API_KEY,
                    appSecret: config.TWITTER_API_SECRET,
                    accessToken: config.TWITTER_ACCESS_TOKEN,
                    accessSecret: config.TWITTER_ACCESS_TOKEN_SECRET,
                });
                this.userContextClient = userContextApi.readOnly;
                this.writableClient = userContextApi;
                elizaLogger.log(
                    "Twitter API v2 initialized with user context authentication"
                );
            } else {
                elizaLogger.log(
                    "OAuth 1.0a credentials not provided - timeline operations will be limited"
                );
            }
        } catch (error) {
            elizaLogger.error("Failed to initialize Twitter API v2:", error);
            throw error;
        }
    }

    /**
     * Check if user context authentication is available
     */
    hasUserContext(): boolean {
        return !!this.userContextClient;
    }

    /**
     * Check if write operations are available (requires OAuth 1.0a credentials)
     */
    hasWriteAccess(): boolean {
        return !!this.writableClient;
    }

    /**
     * Ensure write access is available, throwing an error if not
     */
    private ensureWriteAccess(operation: string): void {
        if (!this.writableClient) {
            throw new Error(
                `OAuth 1.0a credentials required for ${operation}. Please provide TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET.`
            );
        }
    }

    /**
     * Fetch home timeline using Twitter API v2 with user context authentication
     */
    async fetchHomeTimeline(count: number = 10): Promise<Tweet[]> {
        if (!this.userContextClient) {
            throw new Error(
                "OAuth 1.0a credentials required for home timeline access. Please provide TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET."
            );
        }

        elizaLogger.log("TWITTER_API_CALL_STARTED", {
            method: "fetchHomeTimeline",
            endpoint: "v2.homeTimeline",
            maxResults: Math.min(count, 100),
        });

        try {
            const response = await this.userContextClient.v2.homeTimeline({
                max_results: Math.min(count, 100), // API v2 max is 100
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

            if (!response.tweets || response.tweets.length === 0) {
                return [];
            }

            const tweets = response.tweets.map((tweet) =>
                this.transformTweetV2ToTweet(tweet, response.includes)
            );

            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "fetchHomeTimeline",
                endpoint: "v2.homeTimeline",
                success: true,
                tweetsReturned: tweets.length,
            });

            return tweets;
        } catch (error) {
            if (getErrorCode(error) === 429) {
                const rateLimitInfo = formatRateLimitInfo(error);
                elizaLogger.warn(
                    `Twitter API rate limit triggered during fetchHomeTimeline${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                );
            }
            elizaLogger.error("TWITTER_API_CALL_COMPLETED", {
                method: "fetchHomeTimeline",
                endpoint: "v2.homeTimeline",
                success: false,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Fetch following timeline using Twitter API v2 with user context authentication
     */
    async fetchFollowingTimeline(count: number = 10): Promise<Tweet[]> {
        if (!this.userContextClient) {
            throw new Error(
                "OAuth 1.0a credentials required for following timeline access. Please provide TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET."
            );
        }

        elizaLogger.log("TWITTER_API_CALL_STARTED", {
            method: "fetchFollowingTimeline",
            endpoint: "v2.homeTimeline",
            maxResults: Math.min(count, 100),
        });

        try {
            // Note: Twitter API v2 doesn't have a separate "following timeline" endpoint
            // The home timeline (reverse chronological) is equivalent to the following timeline
            const response = await this.userContextClient.v2.homeTimeline({
                max_results: Math.min(count, 100), // API v2 max is 100
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

            if (!response.tweets || response.tweets.length === 0) {
                return [];
            }

            const tweets = response.tweets.map((tweet) =>
                this.transformTweetV2ToTweet(tweet, response.includes)
            );

            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "fetchFollowingTimeline",
                endpoint: "v2.homeTimeline",
                success: true,
                tweetsReturned: tweets.length,
            });

            return tweets;
        } catch (error) {
            if (getErrorCode(error) === 429) {
                const rateLimitInfo = formatRateLimitInfo(error);
                elizaLogger.warn(
                    `Twitter API rate limit triggered during fetchFollowingTimeline${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                );
            }
            elizaLogger.error("TWITTER_API_CALL_COMPLETED", {
                method: "fetchFollowingTimeline",
                endpoint: "v2.homeTimeline",
                success: false,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Fetch a single tweet by ID using Twitter API v2
     */
    async getTweet(tweetId: string): Promise<Tweet | null> {
        elizaLogger.log("TWITTER_API_CALL_STARTED", {
            method: "getTweet",
            endpoint: "v2.singleTweet",
            tweetId: tweetId,
        });

        try {
            const response = await this.readOnlyClient.v2.singleTweet(tweetId, {
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
                elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                    method: "getTweet",
                    endpoint: "v2.singleTweet",
                    success: true,
                    tweetId: tweetId,
                    tweetFound: false,
                });
                return null;
            }

            const tweet = this.transformTweetV2ToTweet(
                response.data,
                response.includes
            );

            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "getTweet",
                endpoint: "v2.singleTweet",
                success: true,
                tweetId: tweetId,
                tweetFound: true,
            });

            return tweet;
        } catch (error) {
            if (getErrorCode(error) === 429) {
                const rateLimitInfo = formatRateLimitInfo(error);
                elizaLogger.warn(
                    `Twitter API rate limit triggered during getTweet${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                );
            }
            elizaLogger.error("TWITTER_API_CALL_COMPLETED", {
                method: "getTweet",
                endpoint: "v2.singleTweet",
                success: false,
                tweetId: tweetId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Fetch user profile by username using Twitter API v2
     */
    async getProfile(username: string): Promise<{
        userId: string;
        name: string;
        biography: string;
    }> {
        elizaLogger.log("TWITTER_API_CALL_STARTED", {
            method: "getProfile",
            endpoint: "v2.userByUsername",
            username: username,
        });

        try {
            const response = await this.readOnlyClient.v2.userByUsername(
                username,
                {
                    "user.fields": [
                        "id",
                        "name",
                        "username",
                        "description",
                        "profile_image_url",
                        "verified",
                        "public_metrics",
                    ],
                }
            );

            if (!response.data) {
                throw new Error(`User ${username} not found`);
            }

            const user = response.data;

            const profile = {
                userId: user.id,
                name: user.name || "",
                biography: user.description || "",
            };

            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "getProfile",
                endpoint: "v2.userByUsername",
                success: true,
                username: username,
                userId: user.id,
            });

            return profile;
        } catch (error) {
            if (getErrorCode(error) === 429) {
                const rateLimitInfo = formatRateLimitInfo(error);
                elizaLogger.warn(
                    `Twitter API rate limit triggered during getProfile${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                );
            }
            elizaLogger.error("TWITTER_API_CALL_COMPLETED", {
                method: "getProfile",
                endpoint: "v2.userByUsername",
                success: false,
                username: username,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Search for tweets using Twitter API v2
     */
    async searchTweets(
        query: string,
        maxResults: number = 10,
        nextToken?: string,
        sinceId?: string,
        startTime?: string
    ): Promise<{ tweets: Tweet[]; nextToken?: string }> {
        if (!query || query.trim().length === 0) {
            throw new Error("Search query cannot be empty");
        }

        elizaLogger.log("TWITTER_API_CALL_STARTED", {
            method: "searchTweets",
            endpoint: "v2.search",
            query: query,
            maxResults: Math.min(maxResults, 100),
            nextToken: nextToken,
            sinceId: sinceId,
            startTime: startTime,
        });

        let searchParams: any = {};

        try {
            searchParams = {
                max_results: Math.min(maxResults, 100), // API v2 max is 100
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
            };

            if (nextToken) {
                searchParams.next_token = nextToken;
            }

            if (sinceId) {
                searchParams.since_id = sinceId;
            } else if (startTime) {
                const validatedStartTime = this.validateStartTime(startTime);
                if (validatedStartTime) {
                    searchParams.start_time = validatedStartTime;
                } else {
                    elizaLogger.warn(
                        `Invalid start_time format: ${startTime}, skipping time constraint`
                    );
                }
            }

            // Add timeout to prevent hanging requests
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(
                        new Error(
                            "Twitter API search request timed out after 30 seconds"
                        )
                    );
                }, 30000);
            });

            const searchPromise = this.readOnlyClient.v2.search(
                query,
                searchParams
            );

            const response = await Promise.race([
                searchPromise,
                timeoutPromise,
            ]);

            const tweets =
                response.tweets?.map((tweet) =>
                    this.transformTweetV2ToTweet(tweet, response.includes)
                ) || [];

            const result = {
                tweets,
                nextToken: response.meta?.next_token,
            };

            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "searchTweets",
                endpoint: "v2.search",
                success: true,
                query: query,
                tweetsReturned: tweets.length,
                hasNextToken: !!response.meta?.next_token,
            });

            return result;
        } catch (error) {
            if (getErrorCode(error) === 429) {
                const rateLimitInfo = formatRateLimitInfo(error);
                elizaLogger.warn(
                    `Twitter API rate limit triggered during searchTweets${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                );
            }
            elizaLogger.error("TWITTER_API_CALL_COMPLETED", {
                method: "searchTweets",
                endpoint: "v2.search",
                success: false,
                query: query,
                error: error.message,
            });
            throw error;
        }
    }

    private validateStartTime(startTime: string): string | null {
        try {
            const date = new Date(startTime);

            // Check if the date is valid
            if (isNaN(date.getTime())) {
                elizaLogger.error(`Invalid date format: ${startTime}`);
                return null;
            }

            // Check if the date is not too far in the past (Twitter has 7-day limit)
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            if (date < sevenDaysAgo) {
                elizaLogger.warn(
                    `start_time ${startTime} is older than 7 days, using 7 days ago instead`
                );
                // Return a timestamp that's exactly 7 days ago minus 1 hour for safety
                const safeDate = new Date(
                    Date.now() - 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000
                );
                return safeDate.toISOString();
            }

            // Check if the date is in the future
            const now = new Date();
            if (date > now) {
                elizaLogger.warn(
                    `start_time ${startTime} is in the future, using current time instead`
                );
                return now.toISOString();
            }

            // Return the original timestamp if it's valid
            return date.toISOString();
        } catch (error) {
            elizaLogger.error(
                `Error validating start_time ${startTime}:`,
                error
            );
            return null;
        }
    }

    /**
     * Transform Twitter API v2 TweetV2 format to the expected Tweet interface
     */
    private transformTweetV2ToTweet(tweetV2: TweetV2, includes?: any): Tweet {
        const authorId = tweetV2.author_id;
        const author = includes?.users?.find(
            (user: any) => user.id === authorId
        );

        // Extract media
        const mediaKeys = tweetV2.attachments?.media_keys || [];
        const media =
            includes?.media?.filter((m: any) =>
                mediaKeys.includes(m.media_key)
            ) || [];

        // Separate photos and videos
        const photos: Photo[] = media
            .filter((m: any) => m.type === "photo")
            .map((m: any) => ({
                id: m.media_key,
                url: m.url || "",
                alt_text: m.alt_text || undefined,
            }));

        const videos: Video[] = media
            .filter((m: any) => m.type === "video")
            .map((m: any) => ({
                id: m.media_key,
                preview: m.preview_image_url || "",
                url: m.url,
            }));

        // Extract mentions from entities
        const mentions: Mention[] =
            tweetV2.entities?.mentions?.map((mention: any) => ({
                id: mention.id,
                username: mention.username,
                name: undefined, // Not provided in entities
            })) || [];

        // Extract hashtags
        const hashtags: string[] =
            tweetV2.entities?.hashtags?.map((hashtag: any) => hashtag.tag) ||
            [];

        // Extract URLs
        const urls: string[] =
            tweetV2.entities?.urls?.map(
                (url: any) => url.expanded_url || url.url
            ) || [];

        // Create permanent URL
        const permanentUrl = author?.username
            ? `https://twitter.com/${author.username}/status/${tweetV2.id}`
            : `https://twitter.com/i/web/status/${tweetV2.id}`;

        const tweet: Tweet = {
            id: tweetV2.id,
            text: tweetV2.text,
            conversationId: tweetV2.conversation_id,
            inReplyToStatusId: tweetV2.in_reply_to_user_id, // Note: this is user_id, not status_id in v2 API
            name: author?.name,
            username: author?.username,
            userId: authorId,
            timestamp: tweetV2.created_at
                ? new Date(tweetV2.created_at).getTime() / 1000
                : undefined,
            permanentUrl,
            hashtags,
            mentions,
            photos,
            videos,
            urls,
            thread: [], // Will be populated separately if needed
            likes: tweetV2.public_metrics?.like_count,
            retweets: tweetV2.public_metrics?.retweet_count,
            replies: tweetV2.public_metrics?.reply_count,
            // Optional fields with defaults
            bookmarkCount: tweetV2.public_metrics?.bookmark_count,
            views: tweetV2.public_metrics?.impression_count,
            isQuoted: false,
            isPin: false,
            isReply: !!tweetV2.in_reply_to_user_id,
            isRetweet: false,
            isSelfThread: false,
            sensitiveContent: false,
        };

        return tweet;
    }

    private async createTweetInternal(
        text: string,
        methodName: string,
        replyToTweetId?: string,
        mediaIds?: string[],
        additionalParams?: Record<string, any>
    ): Promise<Tweet> {
        this.ensureWriteAccess(methodName);

        if (!text || text.trim().length === 0) {
            throw new Error("Tweet text cannot be empty");
        }

        elizaLogger.log("TWITTER_API_CALL_STARTED", {
            method: methodName,
            endpoint: "v2.tweet",
            textLength: text.length,
            replyToTweetId: replyToTweetId,
            hasMedia: !!mediaIds && mediaIds.length > 0,
        });

        try {
            const tweetParams: any = {
                text: text.trim(),
                ...additionalParams,
            };

            if (replyToTweetId) {
                tweetParams.reply = {
                    in_reply_to_tweet_id: replyToTweetId,
                };
            }

            if (mediaIds && mediaIds.length > 0) {
                tweetParams.media = {
                    media_ids: mediaIds,
                };
            }

            const response = await this.writableClient!.v2.tweet(tweetParams);

            if (!response.data) {
                throw new Error("Tweet creation failed: no data returned");
            }

            const createdTweet = await this.getTweet(response.data.id);

            if (!createdTweet) {
                throw new Error("Failed to fetch created tweet");
            }

            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: methodName,
                endpoint: "v2.tweet",
                success: true,
                tweetId: response.data.id,
            });

            return createdTweet;
        } catch (error) {
            if (getErrorCode(error) === 429) {
                const rateLimitInfo = formatRateLimitInfo(error);
                elizaLogger.warn(
                    `Twitter API rate limit triggered during ${methodName}${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                );
            }
            elizaLogger.error("TWITTER_API_CALL_COMPLETED", {
                method: methodName,
                endpoint: "v2.tweet",
                success: false,
                error: error.message,
            });
            throw error;
        }
    }

    async createTweet(
        text: string,
        replyToTweetId?: string,
        mediaIds?: string[]
    ): Promise<Tweet> {
        return this.createTweetInternal(
            text,
            "createTweet",
            replyToTweetId,
            mediaIds
        );
    }

    /**
     * Create a note tweet (long-form tweet) using Twitter API v2
     * Note: Twitter API v2 doesn't have a separate endpoint for note tweets.
     * Long tweets are automatically handled as note tweets when text exceeds 280 characters.
     */
    async createNoteTweet(
        text: string,
        replyToTweetId?: string,
        mediaIds?: string[]
    ): Promise<Tweet> {
        return this.createTweetInternal(
            text,
            "createNoteTweet",
            replyToTweetId,
            mediaIds
        );
    }

    async likeTweet(tweetId: string): Promise<void> {
        this.ensureWriteAccess("liking tweets");

        if (!tweetId || tweetId.trim().length === 0) {
            throw new Error("Tweet ID cannot be empty");
        }

        elizaLogger.log("TWITTER_API_CALL_STARTED", {
            method: "likeTweet",
            endpoint: "v2.like",
            tweetId: tweetId,
        });

        try {
            // Get current user ID from the authenticated user
            const me = await this.writableClient.v2.me();
            if (!me.data?.id) {
                throw new Error("Failed to get authenticated user ID");
            }

            await this.writableClient.v2.like(me.data.id, tweetId);

            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "likeTweet",
                endpoint: "v2.like",
                success: true,
                tweetId: tweetId,
            });
        } catch (error) {
            if (getErrorCode(error) === 429) {
                const rateLimitInfo = formatRateLimitInfo(error);
                elizaLogger.warn(
                    `Twitter API rate limit triggered during likeTweet${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                );
            }
            elizaLogger.error("TWITTER_API_CALL_COMPLETED", {
                method: "likeTweet",
                endpoint: "v2.like",
                success: false,
                tweetId: tweetId,
                error: error.message,
            });
            throw error;
        }
    }

    async retweet(tweetId: string): Promise<void> {
        this.ensureWriteAccess("retweeting");

        if (!tweetId || tweetId.trim().length === 0) {
            throw new Error("Tweet ID cannot be empty");
        }

        elizaLogger.log("TWITTER_API_CALL_STARTED", {
            method: "retweet",
            endpoint: "v2.retweet",
            tweetId: tweetId,
        });

        try {
            // Get current user ID from the authenticated user
            const me = await this.writableClient.v2.me();
            if (!me.data?.id) {
                throw new Error("Failed to get authenticated user ID");
            }

            await this.writableClient.v2.retweet(me.data.id, tweetId);

            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "retweet",
                endpoint: "v2.retweet",
                success: true,
                tweetId: tweetId,
            });
        } catch (error) {
            if (getErrorCode(error) === 429) {
                const rateLimitInfo = formatRateLimitInfo(error);
                elizaLogger.warn(
                    `Twitter API rate limit triggered during retweet${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                );
            }
            elizaLogger.error("TWITTER_API_CALL_COMPLETED", {
                method: "retweet",
                endpoint: "v2.retweet",
                success: false,
                tweetId: tweetId,
                error: error.message,
            });
            throw error;
        }
    }

    async quoteTweet(
        text: string,
        quotedTweetId: string,
        mediaIds?: string[]
    ): Promise<Tweet> {
        if (!text || text.trim().length === 0) {
            throw new Error("Quote tweet text cannot be empty");
        }

        if (!quotedTweetId || quotedTweetId.trim().length === 0) {
            throw new Error("Quoted tweet ID cannot be empty");
        }

        return this.createTweetInternal(
            text,
            "quoteTweet",
            undefined,
            mediaIds,
            { quote_tweet_id: quotedTweetId }
        );
    }

    /**
     * Upload media file using Twitter API v1 (required for media attachments)
     * Videos and animated GIFs require chunked upload with specific parameters
     */
    async uploadMedia(mediaData: Buffer, mediaType: string): Promise<string> {
        this.ensureWriteAccess("media upload");

        if (!mediaData || mediaData.length === 0) {
            throw new Error("Media data cannot be empty");
        }

        const isVideoOrAnimatedGif =
            mediaType.startsWith("video/") || mediaType === "image/gif";

        elizaLogger.log("TWITTER_API_CALL_STARTED", {
            method: "uploadMedia",
            endpoint: "v1.uploadMedia",
            mediaType: mediaType,
            size: mediaData.length,
            isChunked: isVideoOrAnimatedGif,
        });

        try {
            let mediaId: string;

            if (isVideoOrAnimatedGif) {
                // Videos and animated GIFs require chunked upload
                mediaId = await this.writableClient.v1.uploadMedia(mediaData, {
                    mimeType: mediaType,
                    target: "tweet",
                    chunkLength: 5 * 1024 * 1024, // 5MB chunks
                });
            } else {
                // Images and other media use simple upload
                mediaId = await this.writableClient.v1.uploadMedia(mediaData, {
                    mimeType: mediaType,
                });
            }

            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "uploadMedia",
                endpoint: "v1.uploadMedia",
                success: true,
                mediaId: mediaId,
            });

            return mediaId;
        } catch (error) {
            if (getErrorCode(error) === 429) {
                const rateLimitInfo = formatRateLimitInfo(error);
                elizaLogger.warn(
                    `Twitter API rate limit triggered during uploadMedia${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                );
            }
            elizaLogger.error("TWITTER_API_CALL_COMPLETED", {
                method: "uploadMedia",
                endpoint: "v1.uploadMedia",
                success: false,
                error: error.message,
            });
            throw error;
        }
    }
}
