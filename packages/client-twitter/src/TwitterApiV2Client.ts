import { TwitterApi, TweetV2, TwitterApiReadOnly } from "twitter-api-v2";
import { Tweet } from "agent-twitter-client";
import { elizaLogger } from "@elizaos/core";
import { TwitterConfig } from "./environment.ts";

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
            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "fetchHomeTimeline",
                endpoint: "v2.homeTimeline",
                success: false,
                error: error.message,
            });
            elizaLogger.error(
                "Error fetching home timeline with Twitter API v2:",
                error
            );
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
            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "fetchFollowingTimeline",
                endpoint: "v2.homeTimeline",
                success: false,
                error: error.message,
            });
            elizaLogger.error(
                "Error fetching following timeline with Twitter API v2:",
                error
            );
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
            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "getTweet",
                endpoint: "v2.singleTweet",
                success: false,
                tweetId: tweetId,
                error: error.message,
            });
            elizaLogger.error(
                "Error fetching tweet with Twitter API v2:",
                error
            );
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
            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "getProfile",
                endpoint: "v2.userByUsername",
                success: false,
                username: username,
                error: error.message,
            });
            elizaLogger.error(
                `Error fetching profile for ${username} with Twitter API v2:`,
                error
            );
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
        elizaLogger.log("TWITTER_API_CALL_STARTED", {
            method: "searchTweets",
            endpoint: "v2.search",
            query: query,
            maxResults: Math.min(maxResults, 100),
            nextToken: nextToken,
            sinceId: sinceId,
            startTime: startTime,
        });

        try {
            const searchParams: any = {
                max_results: Math.min(maxResults, 100), // API v2 max is 100
                next_token: nextToken,
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

            // Add optional parameters - Twitter API v2 doesn't allow both since_id and start_time
            // Prefer since_id if available, otherwise use start_time
            if (sinceId) {
                searchParams.since_id = sinceId;
            } else if (startTime) {
                searchParams.start_time = startTime;
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
            elizaLogger.log("TWITTER_API_CALL_COMPLETED", {
                method: "searchTweets",
                endpoint: "v2.search",
                success: false,
                query: query,
                error: error.message,
            });
            elizaLogger.error(
                "Error searching tweets with Twitter API v2:",
                error
            );
            throw error;
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
}
