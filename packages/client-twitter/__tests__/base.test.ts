import { describe, it, expect, beforeEach, vi } from "vitest";
import { ClientBase } from "../src/base";
import { ActionTimelineType, IAgentRuntime } from "@elizaos/core";
import { TwitterConfig } from "../src/environment";
import { createMockTweet } from "./mocks";

describe("Twitter Client Base", () => {
    let mockRuntime: IAgentRuntime;
    let mockConfig: TwitterConfig;

    beforeEach(() => {
        mockRuntime = {
            env: {
                TWITTER_USERNAME: "testuser",
                TWITTER_POST_INTERVAL_MIN: "5",
                TWITTER_POST_INTERVAL_MAX: "10",
                TWITTER_ACTION_INTERVAL: "5",
                TWITTER_ENABLE_ACTION_PROCESSING: "true",
                TWITTER_POST_IMMEDIATELY: "false",
                TWITTER_SEARCH_ENABLE: "false",
            },
            getEnv: function (key: string) {
                return this.env[key] || null;
            },
            getSetting: function (key: string) {
                return this.env[key] || null;
            },
            character: {
                style: {
                    all: ["Test style 1", "Test style 2"],
                    post: ["Post style 1", "Post style 2"],
                },
            },
            cacheManager: {
                get: vi.fn(),
                set: vi.fn(),
                delete: vi.fn(),
            },
        } as unknown as IAgentRuntime;

        mockConfig = {
            TWITTER_USERNAME: "testuser",
            TWITTER_SEARCH_ENABLE: false,
            TWITTER_TARGET_USERS: [],
            MAX_TWEET_LENGTH: 280,
            POST_INTERVAL_MIN: 5,
            POST_INTERVAL_MAX: 10,
            ACTION_INTERVAL: 5,
            ENABLE_ACTION_PROCESSING: true,
            POST_IMMEDIATELY: false,
            TWITTER_PASSWORD: "testpassword",
            TWITTER_EMAIL: "test@example.com",
            TWITTER_2FA_SECRET: "test2fasecret",
            TWITTER_RETRY_LIMIT: 3,
            TWITTER_POLL_INTERVAL: 1000,
            TWITTER_KNOWLEDGE_USERS: [],
            TWITTER_SEARCH_TERMS: [],
            MAX_ACTIONS_PROCESSING: 10,
            ACTION_TIMELINE_TYPE: ActionTimelineType.ForYou,
        };
    });

    it("should create instance with correct configuration", () => {
        const client = new ClientBase(mockRuntime, mockConfig);
        expect(client).toBeDefined();
        expect(client.twitterConfig).toBeDefined();
        expect(client.twitterConfig.TWITTER_USERNAME).toBe("testuser");
    });

    it("should initialize with correct tweet length limit", () => {
        const client = new ClientBase(mockRuntime, mockConfig);
        expect(client.twitterConfig.MAX_TWEET_LENGTH).toBe(280);
    });

    it("should initialize with correct post intervals", () => {
        const client = new ClientBase(mockRuntime, mockConfig);
        expect(client.twitterConfig.POST_INTERVAL_MIN).toBe(5);
        expect(client.twitterConfig.POST_INTERVAL_MAX).toBe(10);
    });

    it("should initialize with correct action settings", () => {
        const client = new ClientBase(mockRuntime, mockConfig);
        expect(client.twitterConfig.ACTION_INTERVAL).toBe(5);
        expect(client.twitterConfig.ENABLE_ACTION_PROCESSING).toBe(true);
    });

    describe("getCachedTweet", () => {
        it("should return cached tweet when it exists", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockTweet = createMockTweet({
                id: "123456789",
                text: "This is a cached tweet",
                username: "testuser",
            });

            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(mockTweet);

            const result = await client.getCachedTweet("123456789");

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/tweets/123456789"
            );
            expect(result).toEqual(mockTweet);
        });

        it("should return undefined when tweet is not cached", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(undefined);

            const result = await client.getCachedTweet("nonexistent");

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/tweets/nonexistent"
            );
            expect(result).toBeUndefined();
        });

        it("should return undefined when cache manager returns null", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(null);

            const result = await client.getCachedTweet("123456789");

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/tweets/123456789"
            );
            expect(result).toBeNull();
        });

        it("should handle cache manager errors gracefully", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            mockRuntime.cacheManager.get = vi
                .fn()
                .mockRejectedValue(new Error("Cache error"));

            await expect(client.getCachedTweet("123456789")).rejects.toThrow(
                "Cache error"
            );

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/tweets/123456789"
            );
        });
    });
});
