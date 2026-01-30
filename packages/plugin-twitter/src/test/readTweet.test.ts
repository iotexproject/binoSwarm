import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractTweetId, formatTweet } from "../actions/readTweet";
import type { Tweet } from "@elizaos/client-twitter/src/types";

describe("READ_TWEET Action - URL Parsing", () => {
    describe("extractTweetId", () => {
        describe("Happy path - Standard URL formats", () => {
            it("should extract tweet ID from standard x.com URL", () => {
                const url = "https://x.com/elonmusk/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from standard twitter.com URL", () => {
                const url = "https://twitter.com/elonmusk/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from mobile x.com URL", () => {
                const url = "https://mobile.x.com/elonmusk/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from mobile twitter.com URL", () => {
                const url = "https://mobile.twitter.com/elonmusk/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract numeric tweet ID from x.com URL", () => {
                const url = "https://x.com/user/status/1847364859304837242";
                expect(extractTweetId(url)).toBe("1847364859304837242");
            });
        });

        describe("Edge cases - URL variations", () => {
            it("should extract tweet ID from URL with query parameters", () => {
                const url = "https://x.com/elonmusk/status/1234567890?s=20";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with ref_src query parameter", () => {
                const url = "https://twitter.com/user/status/1234567890?ref_src=twsrc^tfw";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with multiple query parameters", () => {
                const url = "https://x.com/user/status/1234567890?s=20&ref_src=twsrc^tfw";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with www prefix", () => {
                const url = "https://www.x.com/user/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with www prefix on twitter.com", () => {
                const url = "https://www.twitter.com/user/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with trailing slash", () => {
                const url = "https://x.com/user/status/1234567890/";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with trailing slash and query params", () => {
                const url = "https://x.com/user/status/1234567890/?s=20";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with hash fragment", () => {
                const url = "https://x.com/user/status/1234567890#m";
                expect(extractTweetId(url)).toBe("1234567890");
            });
        });

        describe("Error cases - Invalid URL formats", () => {
            it("should throw error for non-Twitter URL", () => {
                const url = "https://facebook.com/post/1234567890";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL without username", () => {
                const url = "https://x.com/status/1234567890";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL without /status/ path", () => {
                const url = "https://x.com/elonmusk/1234567890";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL without tweet ID", () => {
                const url = "https://x.com/elonmusk/status";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL with empty tweet ID", () => {
                const url = "https://x.com/elonmusk/status/";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for empty string", () => {
                expect(() => extractTweetId("")).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for malformed URL", () => {
                const url = "not-a-url";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL with just domain", () => {
                const url = "https://x.com";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL with just username", () => {
                const url = "https://x.com/elonmusk";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL with tweet ID but no status path", () => {
                const url = "https://x.com/elonmusk/1234567890";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });
        });
    });
});

describe("READ_TWEET Action - Tweet Formatting", () => {
    describe("formatTweet", () => {
        beforeEach(() => {
            // Set a fixed date for consistent timestamp testing
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
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
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
                expect(result).toContain("2 photos");
                expect(result).toContain("@user1");
                expect(result).toContain("@user2");
                expect(result).toContain("#testing");
                expect(result).toContain("#example");
                expect(result).toContain("2 hours ago");
            });

            it("should format a minimal tweet with only required fields", () => {
                const tweet: Tweet = {
                    id: "1234567890",
                    text: "Simple tweet",
                    name: "Minimal User",
                    username: "minimal",
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
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
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
                    photos: [
                        { id: "1", url: "photo1.jpg", alt_text: "Sunset" },
                        { id: "2", url: "photo2.jpg", alt_text: "Beach" },
                        { id: "3", url: "photo3.jpg", alt_text: "Mountains" }
                    ],
                    videos: [],
                    mentions: [],
                    hashtags: [],
                    urls: [],
                    conversationId: "conv123",
                    thread: []
                };

                const result = formatTweet(tweet);

                expect(result).toContain("3 photos");
            });

            it("should format tweet with videos only", () => {
                const tweet: Tweet = {
                    id: "123",
                    text: "Watch this video!",
                    name: "Video User",
                    username: "videouser",
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
                    photos: [],
                    videos: [
                        { id: "1", preview: "preview1.jpg" },
                        { id: "2", preview: "preview2.jpg" }
                    ],
                    mentions: [],
                    hashtags: [],
                    urls: [],
                    conversationId: "conv123",
                    thread: []
                };

                const result = formatTweet(tweet);

                expect(result).toContain("2 videos");
            });

            it("should format tweet with both photos and videos", () => {
                const tweet: Tweet = {
                    id: "123",
                    text: "Mixed media post",
                    name: "Mixed User",
                    username: "mixeduser",
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
                    photos: [
                        { id: "1", url: "photo1.jpg", alt_text: "Photo" }
                    ],
                    videos: [
                        { id: "1", preview: "preview1.jpg" }
                    ],
                    mentions: [],
                    hashtags: [],
                    urls: [],
                    conversationId: "conv123",
                    thread: []
                };

                const result = formatTweet(tweet);

                expect(result).toContain("1 photo");
                expect(result).toContain("1 video");
            });

            it("should handle tweet with no media", () => {
                const tweet: Tweet = {
                    id: "123",
                    text: "Text only tweet",
                    name: "Text User",
                    username: "textuser",
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
                    photos: [],
                    videos: [],
                    mentions: [],
                    hashtags: [],
                    urls: [],
                    conversationId: "conv123",
                    thread: []
                };

                const result = formatTweet(tweet);

                // Should not include media information
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
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
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
                    text: "Exploring #technology and #AI in 2025",
                    name: "Hashtag User",
                    username: "hashtaguser",
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
                    photos: [],
                    videos: [],
                    mentions: [],
                    hashtags: ["technology", "AI", "2025"],
                    urls: [],
                    conversationId: "conv123",
                    thread: []
                };

                const result = formatTweet(tweet);

                expect(result).toContain("#technology");
                expect(result).toContain("#AI");
                expect(result).toContain("#2025");
            });

            it("should format tweet with URLs", () => {
                const tweet: Tweet = {
                    id: "123",
                    text: "Read this article: https://example.com/article",
                    name: "URL User",
                    username: "urluser",
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
                    photos: [],
                    videos: [],
                    mentions: [],
                    hashtags: [],
                    urls: ["https://example.com/article", "https://another.link"],
                    conversationId: "conv123",
                    thread: []
                };

                const result = formatTweet(tweet);

                expect(result).toContain("https://example.com/article");
                expect(result).toContain("https://another.link");
            });
        });

        describe("Edge cases - Optional fields", () => {
            it("should handle tweet with null optional fields", () => {
                const tweet: Tweet = {
                    id: "123",
                    text: "Tweet with null fields",
                    name: "Null User",
                    username: "nulluser",
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
                    likes: null,
                    retweets: undefined,
                    replies: undefined,
                    views: undefined,
                    photos: [],
                    videos: [],
                    mentions: [],
                    hashtags: [],
                    urls: [],
                    conversationId: "conv123",
                    thread: []
                };

                const result = formatTweet(tweet);

                // Should still format without throwing
                expect(result).toContain("Null User");
                expect(result).toContain("@nulluser");
                expect(result).toContain("Tweet with null fields");
            });

            it("should handle tweet with empty arrays", () => {
                const tweet: Tweet = {
                    id: "123",
                    text: "Empty arrays tweet",
                    name: "Empty User",
                    username: "emptyuser",
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
                    photos: [],
                    videos: [],
                    mentions: [],
                    hashtags: [],
                    urls: [],
                    conversationId: "conv123",
                    thread: []
                };

                const result = formatTweet(tweet);

                expect(result).toContain("Empty arrays tweet");
                expect(result).toContain("Empty User");
            });

            it("should handle tweet with zero metrics", () => {
                const tweet: Tweet = {
                    id: "123",
                    text: "New tweet with no engagement yet",
                    name: "New User",
                    username: "newuser",
                    timestamp: 1738231200, // 2025-01-30T10:00:00Z (2 hours before current time, in seconds)
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
                    timestamp: 1738234800, // 1 hour before current time (2025-01-30T11:00:00Z)
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
                    timestamp: 1738152000, // 1 day before current time (2025-01-29T12:00:00Z)
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
                    timestamp: 1737979200, // 3 days before current time (2025-01-27T12:00:00Z)
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
});
