import { TwitterApi, TwitterApiv2, TweetV2 } from "twitter-api-v2";
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
    private client: TwitterApiv2;

    constructor(config: TwitterConfig) {
        if (!config.TWITTER_BEARER_TOKEN) {
            throw new Error(
                "TWITTER_BEARER_TOKEN is required for Twitter API v2 client"
            );
        }

        try {
            this.client = new TwitterApi(config.TWITTER_BEARER_TOKEN).v2;
            elizaLogger.log("Twitter API v2 initialized with bearer token");
        } catch (error) {
            elizaLogger.error("Failed to initialize Twitter API v2:", error);
            throw error;
        }
    }

    /**
     * Fetch a single tweet by ID using Twitter API v2
     */
    async getTweet(tweetId: string): Promise<Tweet | null> {
        try {
            const response = await this.client.singleTweet(tweetId, {
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

            return this.transformTweetV2ToTweet(
                response.data,
                response.includes
            );
        } catch (error) {
            elizaLogger.error(
                "Error fetching tweet with Twitter API v2:",
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
