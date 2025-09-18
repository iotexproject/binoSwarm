import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientBase } from "../src/base";
import { IAgentRuntime } from "@elizaos/core";
import { Tweet } from "agent-twitter-client";
import { TwitterConfig } from "../src/environment";

// Mock the TwitterApiV2Client
const mockTwitterApiV2Client = {
    searchTweets: vi.fn(),
};

// Mock the other dependencies
const mockRuntime = {
    cacheManager: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
    },
    character: {
        style: {
            all: ["test style"],
            post: ["test post style"],
        },
    },
} as unknown as IAgentRuntime;

// Create mock tweets
const createMockTweet = (
    id: number,
    username: string,
    text: string
): Tweet => ({
    id: id.toString(),
    username,
    text,
    userId: `user${id}`,
    conversationId: `conv${id}`,
    timestamp: Math.floor(Date.now() / 1000),
    isReply: false,
    isRetweet: false,
    photos: [],
    videos: [],
    urls: [],
    hashtags: [],
    mentions: [],
    thread: [],
    permanentUrl: `https://twitter.com/${username}/status/${id}`,
    isQuoted: false,
});

describe("Twitter API Pagination", () => {
    let client: ClientBase;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create a minimal client instance for testing with required token
        client = new ClientBase(mockRuntime, {
            TWITTER_USERNAME: "testuser",
            TWITTER_PASSWORD: "testpass",
            TWITTER_EMAIL: "test@example.com",
            TWITTER_BEARER_TOKEN: "mock_bearer_token", // Required for TwitterApiV2Client
            TWITTER_TARGET_USERS: [],
            TWITTER_KNOWLEDGE_USERS: [],
            TWITTER_POLL_INTERVAL: 120,
            TWITTER_SEARCH_ENABLE: false,
            ACTION_INTERVAL: 0,
            POST_INTERVAL_MIN: 5,
            POST_INTERVAL_MAX: 10,
            ENABLE_ACTION_PROCESSING: false,
        } as unknown as TwitterConfig);

        // Mock the internal client
        (client as any).twitterApiV2Client = mockTwitterApiV2Client;
        (client as any).requestQueue = {
            add: vi.fn().mockImplementation((fn) => fn()),
        };
        (client as any).profile = {
            id: "123",
            username: "testuser",
        };
    });

    it("should handle single page response (no pagination needed)", async () => {
        const mockTweets = [
            createMockTweet(1, "user1", "First tweet"),
            createMockTweet(2, "user1", "Second tweet"),
        ];

        mockTwitterApiV2Client.searchTweets.mockResolvedValueOnce({
            tweets: mockTweets,
            nextToken: undefined, // No next page
        });

        const result = await client.fetchSearchTweets("from:user1", 10);

        expect(result.tweets).toHaveLength(2);
        expect(result.tweets[0].text).toBe("First tweet");
        expect(result.next).toBeUndefined();
        expect(mockTwitterApiV2Client.searchTweets).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple pages and fetch all results", async () => {
        const page1Tweets = Array.from({ length: 100 }, (_, i) =>
            createMockTweet(i + 1, "user1", `Tweet ${i + 1}`)
        );
        const page2Tweets = Array.from({ length: 50 }, (_, i) =>
            createMockTweet(i + 101, "user1", `Tweet ${i + 101}`)
        );

        // First page response with next token
        mockTwitterApiV2Client.searchTweets.mockResolvedValueOnce({
            tweets: page1Tweets,
            nextToken: "page2_token",
        });

        // Second page response (final page)
        mockTwitterApiV2Client.searchTweets.mockResolvedValueOnce({
            tweets: page2Tweets,
            nextToken: undefined,
        });

        const result = await client.fetchSearchTweets("from:user1", 200);

        expect(result.tweets).toHaveLength(150);
        expect(result.tweets[0].text).toBe("Tweet 1");
        expect(result.tweets[149].text).toBe("Tweet 150");
        expect(mockTwitterApiV2Client.searchTweets).toHaveBeenCalledTimes(2);

        // Verify pagination calls
        expect(mockTwitterApiV2Client.searchTweets).toHaveBeenNthCalledWith(
            1,
            "from:user1",
            100, // First batch size (min of remaining 200, API max 100)
            undefined, // No initial cursor
            undefined, // sinceId
            expect.any(String) // startTime
        );

        expect(mockTwitterApiV2Client.searchTweets).toHaveBeenNthCalledWith(
            2,
            "from:user1",
            100, // Second batch size (min of remaining 100, API max 100)
            "page2_token", // Next token from first page
            undefined, // sinceId
            expect.any(String) // startTime
        );
    });

    it("should respect maxTweets limit across multiple pages", async () => {
        const page1Tweets = Array.from({ length: 100 }, (_, i) =>
            createMockTweet(i + 1, "user1", `Tweet ${i + 1}`)
        );
        const page2Tweets = Array.from({ length: 100 }, (_, i) =>
            createMockTweet(i + 101, "user1", `Tweet ${i + 101}`)
        );

        mockTwitterApiV2Client.searchTweets.mockResolvedValueOnce({
            tweets: page1Tweets,
            nextToken: "page2_token",
        });

        mockTwitterApiV2Client.searchTweets.mockResolvedValueOnce({
            tweets: page2Tweets,
            nextToken: "page3_token",
        });

        // Request only 150 tweets total
        const result = await client.fetchSearchTweets("from:user1", 150);

        expect(result.tweets).toHaveLength(150);
        expect(mockTwitterApiV2Client.searchTweets).toHaveBeenCalledTimes(2);

        // Second call should only request 50 tweets (150 - 100 from first page)
        expect(mockTwitterApiV2Client.searchTweets).toHaveBeenNthCalledWith(
            2,
            "from:user1",
            50, // Remaining tweets needed
            "page2_token",
            undefined,
            expect.any(String)
        );
    });

    it("should handle empty pages gracefully", async () => {
        mockTwitterApiV2Client.searchTweets.mockResolvedValueOnce({
            tweets: [],
            nextToken: undefined,
        });

        const result = await client.fetchSearchTweets("from:nonexistent", 10);

        expect(result.tweets).toHaveLength(0);
        expect(mockTwitterApiV2Client.searchTweets).toHaveBeenCalledTimes(1);
    });

    it("should stop pagination when no more tweets in batch", async () => {
        const page1Tweets = Array.from({ length: 50 }, (_, i) =>
            createMockTweet(i + 1, "user1", `Tweet ${i + 1}`)
        );

        // First page with some tweets but next page is empty
        mockTwitterApiV2Client.searchTweets.mockResolvedValueOnce({
            tweets: page1Tweets,
            nextToken: "page2_token",
        });

        mockTwitterApiV2Client.searchTweets.mockResolvedValueOnce({
            tweets: [], // Empty batch
            nextToken: "page3_token", // Even with next token, should stop
        });

        const result = await client.fetchSearchTweets("from:user1", 200);

        expect(result.tweets).toHaveLength(50);
        expect(mockTwitterApiV2Client.searchTweets).toHaveBeenCalledTimes(2);
    });

    it("should handle rate limit errors during pagination", async () => {
        const page1Tweets = Array.from({ length: 100 }, (_, i) =>
            createMockTweet(i + 1, "user1", `Tweet ${i + 1}`)
        );

        // First page succeeds
        mockTwitterApiV2Client.searchTweets.mockResolvedValueOnce({
            tweets: page1Tweets,
            nextToken: "page2_token",
        });

        // Second page hits rate limit
        mockTwitterApiV2Client.searchTweets.mockRejectedValueOnce({
            code: 429,
            rateLimit: { reset: Date.now() + 900000 },
        });

        const result = await client.fetchSearchTweets("from:user1", 200);

        // Should return partial results from first page
        expect(result.tweets).toHaveLength(100);
        expect(mockTwitterApiV2Client.searchTweets).toHaveBeenCalledTimes(2);
    });

    it("should work with since_id parameter in pagination", async () => {
        const mockTweets = Array.from({ length: 50 }, (_, i) =>
            createMockTweet(i + 1000, "user1", `Recent tweet ${i + 1}`)
        );

        mockTwitterApiV2Client.searchTweets.mockResolvedValueOnce({
            tweets: mockTweets,
            nextToken: undefined,
        });

        const result = await client.fetchSearchTweets(
            "from:user1",
            100,
            undefined,
            "999" // since_id
        );

        expect(result.tweets).toHaveLength(50);
        expect(mockTwitterApiV2Client.searchTweets).toHaveBeenCalledWith(
            "from:user1",
            100,
            undefined, // cursor
            "999", // since_id
            undefined // startTime (should be undefined when since_id is provided)
        );
    });
});
