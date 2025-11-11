import { describe, it, expect, beforeEach, vi } from "vitest";
import { TwitterApiV2Client } from "../src/TwitterApiV2Client";
import { TwitterConfig } from "../src/environment";
import { ActionTimelineType } from "@elizaos/core";
import { createMockTweet } from "./mocks";

// Mock twitter-api-v2 module
const mockWritableClient = {
    v2: {
        tweet: vi.fn(),
        like: vi.fn(),
        retweet: vi.fn(),
        me: vi.fn(),
    },
    v1: {
        uploadMedia: vi.fn(),
    },
};

const mockReadOnlyClient = {
    v2: {
        singleTweet: vi.fn(),
    },
};

const mockTwitterApi = {
    readOnly: mockReadOnlyClient,
};

vi.mock("twitter-api-v2", () => {
    return {
        TwitterApi: vi.fn().mockImplementation((config: any) => {
            if (typeof config === "string") {
                // Bearer token initialization
                return mockTwitterApi;
            } else {
                // OAuth initialization
                return mockWritableClient;
            }
        }),
    };
});

describe("TwitterApiV2Client Write Operations", () => {
    let mockConfig: TwitterConfig;

    beforeEach(() => {
        vi.clearAllMocks();

        mockConfig = {
            TWITTER_USERNAME: "testuser",
            TWITTER_PASSWORD: "testpassword",
            TWITTER_EMAIL: "test@example.com",
            TWITTER_2FA_SECRET: "test2fasecret",
            TWITTER_RETRY_LIMIT: 3,
            TWITTER_POLL_INTERVAL: 1000,
            TWITTER_KNOWLEDGE_USERS: [],
            TWITTER_SEARCH_TERMS: [],
            MAX_ACTIONS_PROCESSING: 10,
            ACTION_TIMELINE_TYPE: ActionTimelineType.ForYou,
            TWITTER_SEARCH_ENABLE: false,
            TWITTER_TARGET_USERS: [],
            POST_INTERVAL_MIN: 5,
            POST_INTERVAL_MAX: 10,
            ACTION_INTERVAL: 5,
            ENABLE_ACTION_PROCESSING: true,
            POST_IMMEDIATELY: false,
            MAX_TWEET_LENGTH: 280,
            TWITTER_BEARER_TOKEN: "test-bearer-token",
            TWITTER_API_KEY: "test-api-key",
            TWITTER_API_SECRET: "test-api-secret",
            TWITTER_ACCESS_TOKEN: "test-access-token",
            TWITTER_ACCESS_TOKEN_SECRET: "test-access-token-secret",
            TWITTER_POST_ENABLED: true,
        };
    });

    describe("hasWriteAccess", () => {
        it("returns true when OAuth credentials are provided", () => {
            const client = new TwitterApiV2Client(mockConfig);
            expect(client.hasWriteAccess()).toBe(true);
        });

        it("returns false when OAuth credentials are missing", () => {
            const configWithoutOAuth = {
                ...mockConfig,
                TWITTER_API_KEY: undefined,
                TWITTER_API_SECRET: undefined,
                TWITTER_ACCESS_TOKEN: undefined,
                TWITTER_ACCESS_TOKEN_SECRET: undefined,
            };
            const client = new TwitterApiV2Client(configWithoutOAuth);
            expect(client.hasWriteAccess()).toBe(false);
        });
    });

    describe("createTweet", () => {
        it("creates a tweet successfully", async () => {
            const client = new TwitterApiV2Client(mockConfig);
            const tweetText = "Test tweet content";
            const tweetId = "123456789";

            mockWritableClient.v2.tweet.mockResolvedValue({
                data: { id: tweetId },
            });

            mockReadOnlyClient.v2.singleTweet.mockResolvedValue({
                data: {
                    id: tweetId,
                    text: tweetText,
                    created_at: new Date().toISOString(),
                    conversation_id: tweetId,
                    author_id: "user123",
                },
                includes: {
                    users: [
                        {
                            id: "user123",
                            username: "testuser",
                            name: "Test User",
                        },
                    ],
                },
            });

            const result = await client.createTweet(tweetText);

            expect(mockWritableClient.v2.tweet).toHaveBeenCalledWith({
                text: tweetText,
            });
            expect(result.text).toBe(tweetText);
            expect(result.id).toBe(tweetId);
        });

        it("creates a reply tweet", async () => {
            const client = new TwitterApiV2Client(mockConfig);
            const tweetText = "Reply tweet";
            const replyToId = "987654321";
            const tweetId = "123456789";

            mockWritableClient.v2.tweet.mockResolvedValue({
                data: { id: tweetId },
            });

            mockReadOnlyClient.v2.singleTweet.mockResolvedValue({
                data: {
                    id: tweetId,
                    text: tweetText,
                    created_at: new Date().toISOString(),
                    conversation_id: replyToId,
                    author_id: "user123",
                    in_reply_to_user_id: "user456",
                },
                includes: {
                    users: [
                        {
                            id: "user123",
                            username: "testuser",
                            name: "Test User",
                        },
                    ],
                },
            });

            await client.createTweet(tweetText, replyToId);

            expect(mockWritableClient.v2.tweet).toHaveBeenCalledWith({
                text: tweetText,
                reply: {
                    in_reply_to_tweet_id: replyToId,
                },
            });
        });

        it("creates a tweet with media", async () => {
            const client = new TwitterApiV2Client(mockConfig);
            const tweetText = "Tweet with media";
            const mediaIds = ["media1", "media2"];
            const tweetId = "123456789";

            mockWritableClient.v2.tweet.mockResolvedValue({
                data: { id: tweetId },
            });

            mockReadOnlyClient.v2.singleTweet.mockResolvedValue({
                data: {
                    id: tweetId,
                    text: tweetText,
                    created_at: new Date().toISOString(),
                    conversation_id: tweetId,
                    author_id: "user123",
                },
                includes: {
                    users: [
                        {
                            id: "user123",
                            username: "testuser",
                            name: "Test User",
                        },
                    ],
                },
            });

            await client.createTweet(tweetText, undefined, mediaIds);

            expect(mockWritableClient.v2.tweet).toHaveBeenCalledWith({
                text: tweetText,
                media: {
                    media_ids: mediaIds,
                },
            });
        });

        it("throws error when OAuth credentials are missing", async () => {
            const configWithoutOAuth = {
                ...mockConfig,
                TWITTER_API_KEY: undefined,
                TWITTER_API_SECRET: undefined,
                TWITTER_ACCESS_TOKEN: undefined,
                TWITTER_ACCESS_TOKEN_SECRET: undefined,
            };
            const client = new TwitterApiV2Client(configWithoutOAuth);

            await expect(client.createTweet("Test")).rejects.toThrow(
                "OAuth 1.0a credentials required"
            );
        });

        it("throws error when text is empty", async () => {
            const client = new TwitterApiV2Client(mockConfig);

            await expect(client.createTweet("")).rejects.toThrow(
                "Tweet text cannot be empty"
            );
        });
    });

    describe("createTweet with long text", () => {
        it("creates a tweet with long text successfully (Twitter handles as note tweet)", async () => {
            const client = new TwitterApiV2Client(mockConfig);
            const tweetText =
                "This is a long tweet that exceeds 280 characters. ".repeat(5);
            const tweetId = "123456789";

            mockWritableClient.v2.tweet.mockResolvedValue({
                data: { id: tweetId },
            });

            mockReadOnlyClient.v2.singleTweet.mockResolvedValue({
                data: {
                    id: tweetId,
                    text: tweetText,
                    created_at: new Date().toISOString(),
                    conversation_id: tweetId,
                    author_id: "user123",
                },
                includes: {
                    users: [
                        {
                            id: "user123",
                            username: "testuser",
                            name: "Test User",
                        },
                    ],
                },
            });

            const result = await client.createTweet(tweetText);

            expect(mockWritableClient.v2.tweet).toHaveBeenCalledWith({
                text: tweetText.trim(),
            });
            expect(result).toBeDefined();
            expect(result.id).toBe(tweetId);
        });
    });

    describe("likeTweet", () => {
        it("likes a tweet successfully", async () => {
            const client = new TwitterApiV2Client(mockConfig);
            const tweetId = "123456789";
            const userId = "user123";

            mockWritableClient.v2.me.mockResolvedValue({
                data: { id: userId },
            });
            mockWritableClient.v2.like.mockResolvedValue({});

            await client.likeTweet(tweetId);

            expect(mockWritableClient.v2.me).toHaveBeenCalled();
            expect(mockWritableClient.v2.like).toHaveBeenCalledWith(
                userId,
                tweetId
            );
        });

        it("throws error when OAuth credentials are missing", async () => {
            const configWithoutOAuth = {
                ...mockConfig,
                TWITTER_API_KEY: undefined,
                TWITTER_API_SECRET: undefined,
                TWITTER_ACCESS_TOKEN: undefined,
                TWITTER_ACCESS_TOKEN_SECRET: undefined,
            };
            const client = new TwitterApiV2Client(configWithoutOAuth);

            await expect(client.likeTweet("123")).rejects.toThrow(
                "OAuth 1.0a credentials required"
            );
        });

        it("throws error when tweet ID is empty", async () => {
            const client = new TwitterApiV2Client(mockConfig);

            await expect(client.likeTweet("")).rejects.toThrow(
                "Tweet ID cannot be empty"
            );
        });
    });

    describe("retweet", () => {
        it("retweets successfully", async () => {
            const client = new TwitterApiV2Client(mockConfig);
            const tweetId = "123456789";
            const userId = "user123";

            mockWritableClient.v2.me.mockResolvedValue({
                data: { id: userId },
            });
            mockWritableClient.v2.retweet.mockResolvedValue({});

            await client.retweet(tweetId);

            expect(mockWritableClient.v2.me).toHaveBeenCalled();
            expect(mockWritableClient.v2.retweet).toHaveBeenCalledWith(
                userId,
                tweetId
            );
        });

        it("throws error when OAuth credentials are missing", async () => {
            const configWithoutOAuth = {
                ...mockConfig,
                TWITTER_API_KEY: undefined,
                TWITTER_API_SECRET: undefined,
                TWITTER_ACCESS_TOKEN: undefined,
                TWITTER_ACCESS_TOKEN_SECRET: undefined,
            };
            const client = new TwitterApiV2Client(configWithoutOAuth);

            await expect(client.retweet("123")).rejects.toThrow(
                "OAuth 1.0a credentials required"
            );
        });

        it("throws error when tweet ID is empty", async () => {
            const client = new TwitterApiV2Client(mockConfig);

            await expect(client.retweet("")).rejects.toThrow(
                "Tweet ID cannot be empty"
            );
        });
    });

    describe("quoteTweet", () => {
        it("creates a quote tweet successfully", async () => {
            const client = new TwitterApiV2Client(mockConfig);
            const tweetText = "This is a quote tweet";
            const quotedTweetId = "987654321";
            const tweetId = "123456789";

            mockWritableClient.v2.tweet.mockResolvedValue({
                data: { id: tweetId },
            });

            mockReadOnlyClient.v2.singleTweet.mockResolvedValue({
                data: {
                    id: tweetId,
                    text: tweetText,
                    created_at: new Date().toISOString(),
                    conversation_id: tweetId,
                    author_id: "user123",
                },
                includes: {
                    users: [
                        {
                            id: "user123",
                            username: "testuser",
                            name: "Test User",
                        },
                    ],
                },
            });

            const result = await client.quoteTweet(tweetText, quotedTweetId);

            expect(mockWritableClient.v2.tweet).toHaveBeenCalledWith({
                text: tweetText,
                quote_tweet_id: quotedTweetId,
            });
            expect(result).toBeDefined();
            expect(result.id).toBe(tweetId);
        });

        it("creates a quote tweet with media", async () => {
            const client = new TwitterApiV2Client(mockConfig);
            const tweetText = "Quote tweet with media";
            const quotedTweetId = "987654321";
            const mediaIds = ["media1"];
            const tweetId = "123456789";

            mockWritableClient.v2.tweet.mockResolvedValue({
                data: { id: tweetId },
            });

            mockReadOnlyClient.v2.singleTweet.mockResolvedValue({
                data: {
                    id: tweetId,
                    text: tweetText,
                    created_at: new Date().toISOString(),
                    conversation_id: tweetId,
                    author_id: "user123",
                },
                includes: {
                    users: [
                        {
                            id: "user123",
                            username: "testuser",
                            name: "Test User",
                        },
                    ],
                },
            });

            await client.quoteTweet(tweetText, quotedTweetId, mediaIds);

            expect(mockWritableClient.v2.tweet).toHaveBeenCalledWith({
                text: tweetText,
                quote_tweet_id: quotedTweetId,
                media: {
                    media_ids: mediaIds,
                },
            });
        });

        it("throws error when OAuth credentials are missing", async () => {
            const configWithoutOAuth = {
                ...mockConfig,
                TWITTER_API_KEY: undefined,
                TWITTER_API_SECRET: undefined,
                TWITTER_ACCESS_TOKEN: undefined,
                TWITTER_ACCESS_TOKEN_SECRET: undefined,
            };
            const client = new TwitterApiV2Client(configWithoutOAuth);

            await expect(client.quoteTweet("Test", "123")).rejects.toThrow(
                "OAuth 1.0a credentials required"
            );
        });

        it("throws error when text is empty", async () => {
            const client = new TwitterApiV2Client(mockConfig);

            await expect(client.quoteTweet("", "123")).rejects.toThrow(
                "Quote tweet text cannot be empty"
            );
        });

        it("throws error when quoted tweet ID is empty", async () => {
            const client = new TwitterApiV2Client(mockConfig);

            await expect(client.quoteTweet("Test", "")).rejects.toThrow(
                "Quoted tweet ID cannot be empty"
            );
        });
    });

    describe("uploadMedia", () => {
        it("uploads media successfully", async () => {
            const client = new TwitterApiV2Client(mockConfig);
            const mediaData = Buffer.from("test image data");
            const mediaType = "image/jpeg";
            const mediaId = "media123";

            mockWritableClient.v1.uploadMedia.mockResolvedValue(mediaId);

            const result = await client.uploadMedia(mediaData, mediaType);

            expect(mockWritableClient.v1.uploadMedia).toHaveBeenCalledWith(
                mediaData,
                {
                    mimeType: mediaType,
                }
            );
            expect(result).toBe(mediaId);
        });

        it("throws error when OAuth credentials are missing", async () => {
            const configWithoutOAuth = {
                ...mockConfig,
                TWITTER_API_KEY: undefined,
                TWITTER_API_SECRET: undefined,
                TWITTER_ACCESS_TOKEN: undefined,
                TWITTER_ACCESS_TOKEN_SECRET: undefined,
            };
            const client = new TwitterApiV2Client(configWithoutOAuth);

            await expect(
                client.uploadMedia(Buffer.from("test"), "image/jpeg")
            ).rejects.toThrow("OAuth 1.0a credentials required");
        });

        it("throws error when media data is empty", async () => {
            const client = new TwitterApiV2Client(mockConfig);

            await expect(
                client.uploadMedia(Buffer.alloc(0), "image/jpeg")
            ).rejects.toThrow("Media data cannot be empty");
        });
    });
});
