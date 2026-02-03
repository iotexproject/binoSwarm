import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatTweet } from "../utils/formatTweet";
import type { Tweet } from "../types";

describe("formatTweet", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-01-30T12:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("Happy path - Complete tweet", () => {
        it("should format a complete tweet with all fields populated", () => {
            const tweet: Tweet = {
                id: "1234567890",
                text: "This is a test tweet with lots of engagement! #testing #example",
                name: "Test User",
                username: "testuser",
                timestamp: 1738231200, // 2 hours before current time, in seconds
                likes: 150,
                retweets: 25,
                replies: 10,
                views: 5000,
                photos: [
                    { id: "1", url: "https://example.com/photo1.jpg", alt_text: "Test photo" },
                    { id: "2", url: "https://example.com/photo2.jpg", alt_text: "Another photo" }
                ],
                videos: [],
                mentions: [
                    { id: "111", username: "user1", name: "User One" },
                    { id: "222", username: "user2", name: "User Two" }
                ],
                hashtags: ["testing", "example"],
                urls: ["https://example.com/article"],
                conversationId: "conv123",
                inReplyToStatusId: undefined,
                quotedTweetId: undefined,
                userId: "user123",
                permanentUrl: "https://x.com/testuser/status/1234567890",
                thread: []
            };

            const result = formatTweet(tweet);

            expect(result).toContain("Test User");
            expect(result).toContain("@testuser");
            expect(result).toContain("This is a test tweet with lots of engagement! #testing #example");
            expect(result).toContain("150 likes");
            expect(result).toContain("25 retweets");
            expect(result).toContain("10 replies");
            expect(result).toContain("5000 views");
            expect(result).toContain("2 photos attached");
            expect(result).toContain("@user1");
            expect(result).toContain("@user2");
            expect(result).toContain("#testing");
            expect(result).toContain("#example");
            expect(result).toContain("https://example.com/article");
            expect(result).toContain("2 hours ago");
        });

        it("should format a minimal tweet with only required fields", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Simple tweet",
                name: "Minimal User",
                username: "minimal",
                timestamp: 1738231200, // 2 hours before current time, in seconds
                photos: [],
                videos: [],
                mentions: [],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);

            expect(result).toContain("Minimal User");
            expect(result).toContain("@minimal");
            expect(result).toContain("Simple tweet");
            expect(result).toContain("2 hours ago");
        });
    });

    describe("Media formatting", () => {
        it("should format tweet with photos only", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Check out these photos!",
                name: "Photo User",
                username: "photouser",
                timestamp: 1738231200,
                photos: [
                    { id: "1", url: "photo1.jpg", alt_text: "Pic 1" },
                    { id: "2", url: "photo2.jpg", alt_text: "Pic 2" },
                    { id: "3", url: "photo3.jpg", alt_text: "Pic 3" }
                ],
                videos: [],
                mentions: [],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("3 photos attached");
        });

        it("should format tweet with videos only", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Watch this video!",
                name: "Video User",
                username: "videouser",
                timestamp: 1738231200,
                photos: [],
                videos: [
                    { id: "1", preview: "thumb1.jpg" },
                    { id: "2", preview: "thumb2.jpg" }
                ],
                mentions: [],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("2 videos attached");
        });

        it("should format tweet with both photos and videos", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Media rich tweet",
                name: "Media User",
                username: "mediauser",
                timestamp: 1738231200,
                photos: [{ id: "1", url: "photo.jpg", alt_text: "Photo" }],
                videos: [{ id: "2", preview: "video.jpg" }],
                mentions: [],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("1 photo attached");
            expect(result).toContain("1 video attached");
        });

        it("should handle tweet with no media", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Text only tweet",
                name: "Text User",
                username: "textuser",
                timestamp: 1738231200,
                photos: [],
                videos: [],
                mentions: [],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).not.toContain("photo");
            expect(result).not.toContain("video");
        });
    });

    describe("Mentions, hashtags, and URLs", () => {
        it("should format tweet with mentions", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Hey @alice and @bob check this out!",
                name: "Mention User",
                username: "mentionuser",
                timestamp: 1738231200,
                photos: [],
                videos: [],
                mentions: [
                    { id: "1", username: "alice", name: "Alice" },
                    { id: "2", username: "bob", name: "Bob" }
                ],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("@alice");
            expect(result).toContain("@bob");
        });

        it("should format tweet with hashtags", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Love #coding and #opensource",
                name: "Hashtag User",
                username: "hashtaguser",
                timestamp: 1738231200,
                photos: [],
                videos: [],
                mentions: [],
                hashtags: ["coding", "opensource", "tech"],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("#coding");
            expect(result).toContain("#opensource");
            expect(result).toContain("#tech");
        });

        it("should format tweet with URLs", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Check these links",
                name: "URL User",
                username: "urluser",
                timestamp: 1738231200,
                photos: [],
                videos: [],
                mentions: [],
                hashtags: [],
                urls: ["https://example.com/article1", "https://example.com/article2"],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("https://example.com/article1");
            expect(result).toContain("https://example.com/article2");
        });
    });

    describe("Edge cases", () => {
        it("should handle tweet with null optional fields", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Tweet with nulls",
                name: "Null User",
                username: "nulluser",
                timestamp: 1738231200,
                likes: null,
                retweets: undefined,
                replies: 0,
                photos: null,
                videos: undefined,
                mentions: [],
                hashtags: null,
                urls: undefined,
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("Null User");
            expect(result).toContain("Tweet with nulls");
        });

        it("should handle tweet with empty arrays", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Empty collections",
                name: "Empty User",
                username: "emptyuser",
                timestamp: 1738231200,
                photos: [],
                videos: [],
                mentions: [],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("Empty User");
            expect(result).toContain("Empty collections");
        });

        it("should handle tweet with zero metrics", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Unpopular tweet",
                name: "Zero User",
                username: "zerouser",
                timestamp: 1738231200,
                likes: 0,
                retweets: 0,
                replies: 0,
                views: 0,
                photos: [],
                videos: [],
                mentions: [],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("0 likes");
            expect(result).toContain("0 retweets");
            expect(result).toContain("0 replies");
            expect(result).toContain("0 views");
        });
    });

    describe("Timestamp formatting", () => {
        it("should convert timestamp to relative time - 1 hour ago", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Recent tweet",
                name: "User",
                username: "user",
                timestamp: 1738234800, // 1 hour before current time
                photos: [],
                videos: [],
                mentions: [],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("1 hour ago");
        });

        it("should convert timestamp to relative time - 1 day ago", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Yesterday's tweet",
                name: "User",
                username: "user",
                timestamp: 1738152000, // 1 day before current time
                photos: [],
                videos: [],
                mentions: [],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("1 day ago");
        });

        it("should convert timestamp to relative time - multiple days", () => {
            const tweet: Tweet = {
                id: "123",
                text: "Old tweet",
                name: "User",
                username: "user",
                timestamp: 1737979200, // 3 days before current time
                photos: [],
                videos: [],
                mentions: [],
                hashtags: [],
                urls: [],
                conversationId: "conv123",
                thread: []
            };

            const result = formatTweet(tweet);
            expect(result).toContain("3 days ago");
        });
    });
});
