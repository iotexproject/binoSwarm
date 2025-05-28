import { describe, it, expect, beforeEach, vi } from "vitest";
import { ClientBase, extractAnswer } from "../src/base";
import { ActionTimelineType, IAgentRuntime } from "@elizaos/core";
import { TwitterConfig } from "../src/environment";
import { createMockTweet } from "./mocks";

describe("extractAnswer", () => {
    it("should extract answer between Answer: and <|endoftext|>", () => {
        const text =
            "Some text Answer: This is the answer<|endoftext|> more text";
        const result = extractAnswer(text);
        expect(result).toBe("This is the answer");
    });

    it("should handle text without proper markers", () => {
        const text = "No answer markers here";
        const result = extractAnswer(text);
        expect(result).toBe("er markers her");
    });
});

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
                name: "Test Character",
                bio: "Default character bio",
                style: {
                    all: ["Test style 1", "Test style 2"],
                    post: ["Post style 1", "Post style 2"],
                },
                twitterProfile: {
                    nicknames: [],
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

    describe("cacheTweet", () => {
        it("should cache tweet successfully", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockTweet = createMockTweet({
                id: "123456789",
                text: "Tweet to cache",
                username: "testuser",
            });

            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await client.cacheTweet(mockTweet);

            expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
                "twitter/tweets/123456789",
                mockTweet
            );
        });

        it("should skip caching when tweet is undefined", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await client.cacheTweet(undefined as any);

            expect(mockRuntime.cacheManager.set).not.toHaveBeenCalled();
        });

        it("should skip caching when tweet is null", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await client.cacheTweet(null as any);

            expect(mockRuntime.cacheManager.set).not.toHaveBeenCalled();
        });
    });

    describe("getTweet", () => {
        it("should return cached tweet when available", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockTweet = createMockTweet({
                id: "123456789",
                text: "Cached tweet",
                username: "testuser",
            });

            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(mockTweet);

            const result = await client.getTweet("123456789");

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/tweets/123456789"
            );
            expect(result).toEqual(mockTweet);
        });

        it("should fetch and cache tweet when not cached", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockTweet = createMockTweet({
                id: "123456789",
                text: "Fetched tweet",
                username: "testuser",
            });

            // Mock cache miss
            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(undefined);
            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            // Mock twitter client getTweet
            const mockGetTweet = vi.fn().mockResolvedValue(mockTweet);
            client.twitterClient.getTweet = mockGetTweet;

            const result = await client.getTweet("123456789");

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/tweets/123456789"
            );
            expect(mockGetTweet).toHaveBeenCalledWith("123456789");
            expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
                "twitter/tweets/123456789",
                mockTweet
            );
            expect(result).toEqual(mockTweet);
        });
    });

    describe("onReady", () => {
        it("should throw error indicating not implemented in base class", () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            expect(() => client.onReady()).toThrow(
                "Not implemented in base class, please call from subclass"
            );
        });
    });

    describe("loadLatestCheckedTweetId", () => {
        it("should load tweet ID from cache when available", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            client.profile = { username: "testuser" } as any;

            mockRuntime.cacheManager.get = vi
                .fn()
                .mockResolvedValue("123456789");

            await client.loadLatestCheckedTweetId();

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/testuser/latest_checked_tweet_id"
            );
            expect(client.lastCheckedTweetId).toBe(BigInt("123456789"));
        });

        it("should not set tweet ID when cache is empty", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            client.profile = { username: "testuser" } as any;

            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(undefined);

            await client.loadLatestCheckedTweetId();

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/testuser/latest_checked_tweet_id"
            );
            expect(client.lastCheckedTweetId).toBeNull();
        });
    });

    describe("cacheLatestCheckedTweetId", () => {
        it("should cache tweet ID when set", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            client.profile = { username: "testuser" } as any;
            client.lastCheckedTweetId = BigInt("123456789");

            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await client.cacheLatestCheckedTweetId();

            expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
                "twitter/testuser/latest_checked_tweet_id",
                "123456789"
            );
        });

        it("should not cache when tweet ID is null", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            client.profile = { username: "testuser" } as any;
            client.lastCheckedTweetId = null;

            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await client.cacheLatestCheckedTweetId();

            expect(mockRuntime.cacheManager.set).not.toHaveBeenCalled();
        });
    });

    describe("getCachedTimeline", () => {
        it("should return cached timeline when available", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            client.profile = { username: "testuser" } as any;
            const mockTimeline = [createMockTweet({ id: "1" })];

            mockRuntime.cacheManager.get = vi
                .fn()
                .mockResolvedValue(mockTimeline);

            const result = await client.getCachedTimeline();

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/testuser/timeline"
            );
            expect(result).toEqual(mockTimeline);
        });

        it("should return undefined when no cached timeline", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            client.profile = { username: "testuser" } as any;

            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(undefined);

            const result = await client.getCachedTimeline();

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/testuser/timeline"
            );
            expect(result).toBeUndefined();
        });
    });

    describe("cacheTimeline", () => {
        it("should cache timeline with expiration", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            client.profile = { username: "testuser" } as any;
            const mockTimeline = [createMockTweet({ id: "1" })];

            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await client.cacheTimeline(mockTimeline);

            expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
                "twitter/testuser/timeline",
                mockTimeline,
                expect.objectContaining({ expires: expect.any(Number) })
            );
        });
    });

    describe("cacheMentions", () => {
        it("should cache mentions with expiration", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            client.profile = { username: "testuser" } as any;
            const mockMentions = [createMockTweet({ id: "1" })];

            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await client.cacheMentions(mockMentions);

            expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
                "twitter/testuser/mentions",
                mockMentions,
                expect.objectContaining({ expires: expect.any(Number) })
            );
        });
    });

    describe("getCachedCookies", () => {
        it("should return cached cookies when available", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockCookies = [{ key: "session", value: "abc123" }];

            mockRuntime.cacheManager.get = vi
                .fn()
                .mockResolvedValue(mockCookies);

            const result = await client.getCachedCookies("testuser");

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/testuser/cookies"
            );
            expect(result).toEqual(mockCookies);
        });
    });

    describe("cacheCookies", () => {
        it("should cache cookies for username", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockCookies = [{ key: "session", value: "abc123" }];

            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await client.cacheCookies("testuser", mockCookies);

            expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
                "twitter/testuser/cookies",
                mockCookies
            );
        });
    });

    describe("setCookiesFromArray", () => {
        it("should format and set cookies on twitter client", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockCookies = [
                {
                    key: "session",
                    value: "abc123",
                    domain: ".twitter.com",
                    path: "/",
                    secure: true,
                    httpOnly: true,
                    sameSite: "Lax",
                },
            ];

            const mockSetCookies = vi.fn().mockResolvedValue(undefined);
            client.twitterClient.setCookies = mockSetCookies;

            await client.setCookiesFromArray(mockCookies);

            expect(mockSetCookies).toHaveBeenCalledWith([
                "session=abc123; Domain=.twitter.com; Path=/; Secure; HttpOnly; SameSite=Lax",
            ]);
        });

        it("should handle cookies without optional properties", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockCookies = [
                {
                    key: "basic",
                    value: "xyz789",
                    domain: ".twitter.com",
                    path: "/",
                    secure: false,
                    httpOnly: false,
                },
            ];

            const mockSetCookies = vi.fn().mockResolvedValue(undefined);
            client.twitterClient.setCookies = mockSetCookies;

            await client.setCookiesFromArray(mockCookies);

            expect(mockSetCookies).toHaveBeenCalledWith([
                "basic=xyz789; Domain=.twitter.com; Path=/; ; ; SameSite=Lax",
            ]);
        });
    });

    describe("fetchProfile", () => {
        it("should fetch and return twitter profile", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockProfile = {
                userId: "123",
                name: "Test User",
                biography: "Test bio",
            };

            const mockGetProfile = vi.fn().mockResolvedValue(mockProfile);
            client.twitterClient.getProfile = mockGetProfile;

            const result = await client.fetchProfile("testuser");

            expect(mockGetProfile).toHaveBeenCalledWith("testuser");
            expect(result).toEqual({
                id: "123",
                username: "testuser",
                screenName: "Test User",
                bio: "Default character bio",
                nicknames: [],
            });
        });

        it("should use character name when profile name is missing", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockProfile = {
                userId: "123",
                name: null,
                biography: "Test bio",
            };

            const mockGetProfile = vi.fn().mockResolvedValue(mockProfile);
            client.twitterClient.getProfile = mockGetProfile;

            const result = await client.fetchProfile("testuser");

            expect(result.screenName).toBe(mockRuntime.character.name);
        });

        it("should use character bio when profile bio is missing", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockProfile = {
                userId: "123",
                name: "Test User",
                biography: null,
            };

            mockRuntime.character.bio = "Character bio";

            const mockGetProfile = vi.fn().mockResolvedValue(mockProfile);
            client.twitterClient.getProfile = mockGetProfile;

            const result = await client.fetchProfile("testuser");

            expect(result.bio).toBe("Character bio");
        });

        it("should handle character bio as array", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockProfile = {
                userId: "123",
                name: "Test User",
                biography: null,
            };

            mockRuntime.character.bio = ["First bio", "Second bio"];

            const mockGetProfile = vi.fn().mockResolvedValue(mockProfile);
            client.twitterClient.getProfile = mockGetProfile;

            const result = await client.fetchProfile("testuser");

            expect(result.bio).toBe("First bio");
        });

        it("should handle empty character bio array", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const mockProfile = {
                userId: "123",
                name: "Test User",
                biography: null,
            };

            mockRuntime.character.bio = [];

            const mockGetProfile = vi.fn().mockResolvedValue(mockProfile);
            client.twitterClient.getProfile = mockGetProfile;

            const result = await client.fetchProfile("testuser");

            expect(result.bio).toBe("");
        });

        it("should handle errors and rethrow them", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            const error = new Error("Profile fetch failed");

            const mockGetProfile = vi.fn().mockRejectedValue(error);
            client.twitterClient.getProfile = mockGetProfile;

            await expect(client.fetchProfile("testuser")).rejects.toThrow(
                "Profile fetch failed"
            );
        });
    });
});
