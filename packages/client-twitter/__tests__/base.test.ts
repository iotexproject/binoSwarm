import { describe, it, expect, beforeEach, vi } from "vitest";
import { ClientBase, extractAnswer } from "../src/base";
import { ActionTimelineType, IAgentRuntime, stringToUuid } from "@elizaos/core";
import { TwitterConfig } from "../src/environment";
import { createMockTweet } from "./mocks";
import { SearchMode } from "agent-twitter-client";

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

    describe("fetchOwnPosts", () => {
        it("should fetch own posts successfully", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            client.profile = { id: "123", username: "testuser" } as any;

            const mockTweets = [createMockTweet({ id: "1" })];
            const mockUserTweets = vi
                .fn()
                .mockResolvedValue({ tweets: mockTweets });
            client.twitterClient.getUserTweets = mockUserTweets;

            const result = await client.fetchOwnPosts(10);

            expect(mockUserTweets).toHaveBeenCalledWith("123", 10);
            expect(result).toEqual(mockTweets);
        });
    });

    describe("fetchHomeTimeline", () => {
        it("should fetch home timeline when not following", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockRawTweets = [
                {
                    id: "123",
                    __typename: "Tweet",
                    name: "Test User",
                    username: "testuser",
                    text: "Test tweet",
                    legacy: {
                        created_at: "Mon Jan 01 00:00:00 +0000 2024",
                        user_id_str: "456",
                        conversation_id_str: "789",
                        full_text: "Test tweet",
                        entities: {
                            hashtags: [],
                            user_mentions: [],
                            urls: [],
                            media: [],
                        },
                    },
                    core: {
                        user_results: {
                            result: {
                                legacy: {
                                    screen_name: "testuser",
                                },
                            },
                        },
                    },
                    rest_id: "123",
                    thread: [],
                },
            ];

            const mockFetchHomeTimeline = vi
                .fn()
                .mockResolvedValue(mockRawTweets);
            client.twitterClient.fetchHomeTimeline = mockFetchHomeTimeline;

            const result = await client.fetchHomeTimeline(10, false);

            expect(mockFetchHomeTimeline).toHaveBeenCalledWith(10, []);
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                id: "123",
                username: "testuser",
                text: "Test tweet",
                permanentUrl: expect.stringContaining("status/123"),
            });
        });

        it("should fetch following timeline when following is true", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockFetchFollowingTimeline = vi.fn().mockResolvedValue([]);
            client.twitterClient.fetchFollowingTimeline =
                mockFetchFollowingTimeline;

            await client.fetchHomeTimeline(10, true);

            expect(mockFetchFollowingTimeline).toHaveBeenCalledWith(10, []);
        });

        it("should filter out TweetWithVisibilityResults", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockRawTweets = [
                {
                    __typename: "TweetWithVisibilityResults",
                    id: "filtered",
                },
                {
                    id: "kept",
                    __typename: "Tweet",
                    legacy: {
                        created_at: "Mon Jan 01 00:00:00 +0000 2024",
                        entities: {},
                    },
                    core: {},
                    rest_id: "kept",
                },
            ];

            const mockFetchHomeTimeline = vi
                .fn()
                .mockResolvedValue(mockRawTweets);
            client.twitterClient.fetchHomeTimeline = mockFetchHomeTimeline;

            const result = await client.fetchHomeTimeline(10, false);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("kept");
        });

        it("should handle media processing correctly", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockRawTweets = [
                {
                    id: "123",
                    __typename: "Tweet",
                    legacy: {
                        created_at: "Mon Jan 01 00:00:00 +0000 2024",
                        entities: {
                            media: [
                                {
                                    type: "photo",
                                    id_str: "photo1",
                                    media_url_https:
                                        "https://example.com/photo1.jpg",
                                    alt_text: "Photo description",
                                },
                                {
                                    type: "video",
                                    id_str: "video1",
                                },
                            ],
                        },
                    },
                    core: {},
                    rest_id: "123",
                },
            ];

            const mockFetchHomeTimeline = vi
                .fn()
                .mockResolvedValue(mockRawTweets);
            client.twitterClient.fetchHomeTimeline = mockFetchHomeTimeline;

            const result = await client.fetchHomeTimeline(10, false);

            expect(result[0].photos).toEqual([
                {
                    id: "photo1",
                    url: "https://example.com/photo1.jpg",
                    alt_text: "Photo description",
                },
            ]);
            expect(result[0].videos).toHaveLength(1);
        });
    });

    describe("fetchTimelineForActions", () => {
        it("should fetch home timeline for actions with ForYou type", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            mockConfig.ACTION_TIMELINE_TYPE = ActionTimelineType.ForYou;

            const mockRawTweets = [
                {
                    rest_id: "123",
                    core: {
                        user_results: {
                            result: {
                                legacy: {
                                    name: "Test User",
                                    screen_name: "differentuser",
                                },
                            },
                        },
                    },
                    legacy: {
                        full_text: "Test tweet",
                        created_at: "Mon Jan 01 00:00:00 +0000 2024",
                        user_id_str: "456",
                        conversation_id_str: "789",
                        entities: {
                            hashtags: [],
                            user_mentions: [],
                            urls: [],
                        },
                    },
                },
            ];

            const mockFetchHomeTimeline = vi
                .fn()
                .mockResolvedValue(mockRawTweets);
            client.twitterClient.fetchHomeTimeline = mockFetchHomeTimeline;

            const result = await client.fetchTimelineForActions(10);

            expect(mockFetchHomeTimeline).toHaveBeenCalledWith(10, []);
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                id: "123",
                username: "differentuser",
                text: "Test tweet",
            });
        });

        it("should fetch following timeline for actions with Following type", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            mockConfig.ACTION_TIMELINE_TYPE = ActionTimelineType.Following;

            const mockFetchFollowingTimeline = vi.fn().mockResolvedValue([]);
            client.twitterClient.fetchFollowingTimeline =
                mockFetchFollowingTimeline;

            await client.fetchTimelineForActions(10);

            expect(mockFetchFollowingTimeline).toHaveBeenCalledWith(10, []);
        });

        it("should filter out agent's own tweets", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);
            mockConfig.TWITTER_USERNAME = "agentuser";

            const mockRawTweets = [
                {
                    rest_id: "123",
                    core: {
                        user_results: {
                            result: {
                                legacy: {
                                    screen_name: "agentuser", // This should be filtered
                                },
                            },
                        },
                    },
                    legacy: {
                        created_at: "Mon Jan 01 00:00:00 +0000 2024",
                        entities: {},
                    },
                },
                {
                    rest_id: "456",
                    core: {
                        user_results: {
                            result: {
                                legacy: {
                                    screen_name: "otheruser", // This should be kept
                                },
                            },
                        },
                    },
                    legacy: {
                        created_at: "Mon Jan 01 00:00:00 +0000 2024",
                        entities: {},
                    },
                },
            ];

            const mockFetchHomeTimeline = vi
                .fn()
                .mockResolvedValue(mockRawTweets);
            client.twitterClient.fetchHomeTimeline = mockFetchHomeTimeline;

            const result = await client.fetchTimelineForActions(10);

            expect(result).toHaveLength(1);
            expect(result[0].username).toBe("otheruser");
        });

        it("should limit results to requested count", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockRawTweets = Array.from({ length: 20 }, (_, i) => ({
                rest_id: `${i}`,
                core: {
                    user_results: {
                        result: {
                            legacy: {
                                screen_name: `user${i}`,
                            },
                        },
                    },
                },
                legacy: {
                    created_at: "Mon Jan 01 00:00:00 +0000 2024",
                    entities: {},
                },
            }));

            const mockFetchHomeTimeline = vi
                .fn()
                .mockResolvedValue(mockRawTweets);
            client.twitterClient.fetchHomeTimeline = mockFetchHomeTimeline;

            const result = await client.fetchTimelineForActions(5);

            expect(result).toHaveLength(5);
        });
    });

    describe("fetchSearchTweets", () => {
        it("should fetch search tweets successfully", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockSearchResult = {
                tweets: [createMockTweet({ id: "1" })],
            };

            const mockFetchSearchTweets = vi
                .fn()
                .mockResolvedValue(mockSearchResult);
            client.twitterClient.fetchSearchTweets = mockFetchSearchTweets;

            const result = await client.fetchSearchTweets(
                "test query",
                10,
                SearchMode.Latest
            );

            expect(mockFetchSearchTweets).toHaveBeenCalledWith(
                "test query",
                10,
                SearchMode.Latest,
                undefined
            );
            expect(result).toEqual(mockSearchResult);
        });

        it("should handle search tweets with cursor", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockFetchSearchTweets = vi
                .fn()
                .mockResolvedValue({ tweets: [] });
            client.twitterClient.fetchSearchTweets = mockFetchSearchTweets;

            await client.fetchSearchTweets(
                "test query",
                10,
                SearchMode.Latest,
                "cursor123"
            );

            expect(mockFetchSearchTweets).toHaveBeenCalledWith(
                "test query",
                10,
                SearchMode.Latest,
                "cursor123"
            );
        });

        it("should handle search tweets timeout", async () => {
            vi.useFakeTimers();

            const client = new ClientBase(mockRuntime, mockConfig);

            // Mock a request that doesn't resolve quickly
            const mockFetchSearchTweets = vi.fn().mockImplementation(
                () => new Promise(() => {}) // Never resolves
            );
            client.twitterClient.fetchSearchTweets = mockFetchSearchTweets;

            // Start the async operation
            const resultPromise = client.fetchSearchTweets(
                "test query",
                10,
                SearchMode.Latest
            );

            // Fast-forward time past the 15 second timeout
            vi.advanceTimersByTime(15001);

            const result = await resultPromise;

            expect(result).toEqual({ tweets: [] });

            vi.useRealTimers();
        });

        it("should handle search tweets error", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockFetchSearchTweets = vi
                .fn()
                .mockRejectedValue(new Error("Search failed"));
            client.twitterClient.fetchSearchTweets = mockFetchSearchTweets;

            const result = await client.fetchSearchTweets(
                "test query",
                10,
                SearchMode.Latest
            );

            expect(result).toEqual({ tweets: [] });
        });

        it("should handle null search result", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockFetchSearchTweets = vi.fn().mockResolvedValue(null);
            client.twitterClient.fetchSearchTweets = mockFetchSearchTweets;

            const result = await client.fetchSearchTweets(
                "test query",
                10,
                SearchMode.Latest
            );

            expect(result).toEqual({ tweets: [] });
        });
    });

    describe("saveRequestMessage", () => {
        it("should save new message when no recent message exists", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockMessage = {
                id: "msg123" as any,
                roomId: "room123" as any,
                content: { text: "Test message" },
                userId: "user123" as any,
                agentId: "agent123" as any,
                createdAt: Date.now(),
            };

            const mockState = { test: "state" } as any;

            mockRuntime.messageManager = {
                getMemories: vi.fn().mockResolvedValue([]),
                createMemory: vi.fn().mockResolvedValue(undefined),
            } as any;

            mockRuntime.evaluate = vi.fn().mockResolvedValue(undefined);

            await client.saveRequestMessage(mockMessage, mockState);

            expect(mockRuntime.messageManager.getMemories).toHaveBeenCalledWith(
                {
                    roomId: mockMessage.roomId,
                    count: 1,
                    unique: false,
                }
            );

            expect(
                mockRuntime.messageManager.createMemory
            ).toHaveBeenCalledWith(mockMessage, "twitter", true, true);

            expect(mockRuntime.evaluate).toHaveBeenCalledWith(mockMessage, {
                ...mockState,
                twitterClient: client.twitterClient,
            });
        });

        it("should skip saving when recent message with same content exists", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockMessage = {
                id: "msg123" as any,
                roomId: "room123" as any,
                content: { text: "Test message" },
                userId: "user123" as any,
                agentId: "agent123" as any,
                createdAt: Date.now(),
            };

            const mockState = { test: "state" } as any;

            const recentMessage = {
                id: "recent123",
                content: mockMessage.content, // Same content
            };

            mockRuntime.messageManager = {
                getMemories: vi.fn().mockResolvedValue([recentMessage]),
                createMemory: vi.fn().mockResolvedValue(undefined),
            } as any;

            mockRuntime.evaluate = vi.fn().mockResolvedValue(undefined);

            await client.saveRequestMessage(mockMessage, mockState);

            expect(
                mockRuntime.messageManager.createMemory
            ).not.toHaveBeenCalled();
            expect(mockRuntime.evaluate).toHaveBeenCalled();
        });

        it("should not process message without text content", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockMessage = {
                id: "msg123" as any,
                roomId: "room123" as any,
                content: {}, // No text
                userId: "user123" as any,
                agentId: "agent123" as any,
                createdAt: Date.now(),
            } as any; // Cast entire object to bypass type checking for test

            const mockState = { test: "state" } as any;

            mockRuntime.messageManager = {
                getMemories: vi.fn(),
                createMemory: vi.fn(),
            } as any;

            mockRuntime.evaluate = vi.fn();

            await client.saveRequestMessage(mockMessage, mockState);

            expect(
                mockRuntime.messageManager.getMemories
            ).not.toHaveBeenCalled();
            expect(
                mockRuntime.messageManager.createMemory
            ).not.toHaveBeenCalled();
            expect(mockRuntime.evaluate).not.toHaveBeenCalled();
        });
    });

    describe("init", () => {
        beforeEach(() => {
            // Mock all the methods that init() calls
            vi.spyOn(
                ClientBase.prototype,
                "getCachedCookies"
            ).mockResolvedValue(undefined);
            vi.spyOn(
                ClientBase.prototype,
                "setCookiesFromArray"
            ).mockResolvedValue(undefined);
            vi.spyOn(ClientBase.prototype, "cacheCookies").mockResolvedValue(
                undefined
            );
            vi.spyOn(ClientBase.prototype, "fetchProfile").mockResolvedValue({
                id: "123",
                username: "testuser",
                screenName: "Test User",
                bio: "Test bio",
                nicknames: [],
            });
            vi.spyOn(
                ClientBase.prototype,
                "loadLatestCheckedTweetId"
            ).mockResolvedValue(undefined);
            // Use any to access private method for testing
            vi.spyOn(
                ClientBase.prototype as any,
                "populateTimeline"
            ).mockResolvedValue(undefined);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it("should throw error when username is not configured", async () => {
            const client = new ClientBase(mockRuntime, {
                ...mockConfig,
                TWITTER_USERNAME: undefined as any,
            });

            await expect(client.init()).rejects.toThrow(
                "Twitter username not configured"
            );
        });

        it("should initialize successfully with cached cookies and already logged in", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockCookies = [{ key: "session", value: "abc123" }];
            vi.spyOn(client, "getCachedCookies").mockResolvedValue(mockCookies);

            // Mock twitter client methods
            client.twitterClient.isLoggedIn = vi.fn().mockResolvedValue(true);
            client.twitterClient.login = vi.fn().mockResolvedValue(undefined);
            client.twitterClient.getCookies = vi
                .fn()
                .mockResolvedValue(mockCookies);

            await client.init();

            expect(client.getCachedCookies).toHaveBeenCalledWith("testuser");
            expect(client.setCookiesFromArray).toHaveBeenCalledWith(
                mockCookies
            );
            expect(client.twitterClient.isLoggedIn).toHaveBeenCalled();
            expect(client.twitterClient.login).not.toHaveBeenCalled();
            expect(client.fetchProfile).toHaveBeenCalledWith("testuser");
            expect(client.loadLatestCheckedTweetId).toHaveBeenCalled();
            expect((client as any).populateTimeline).toHaveBeenCalled();
        });

        it("should login and cache cookies when not logged in initially", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockCookies = [{ key: "session", value: "abc123" }];

            // Mock login flow
            client.twitterClient.isLoggedIn = vi
                .fn()
                .mockResolvedValueOnce(false) // First check - not logged in
                .mockResolvedValueOnce(true); // After login - logged in

            client.twitterClient.login = vi.fn().mockResolvedValue(undefined);
            client.twitterClient.getCookies = vi
                .fn()
                .mockResolvedValue(mockCookies);

            await client.init();

            expect(client.twitterClient.login).toHaveBeenCalledWith(
                "testuser",
                "testpassword",
                "test@example.com",
                "test2fasecret"
            );
            expect(client.cacheCookies).toHaveBeenCalledWith(
                "testuser",
                mockCookies
            );
        });

        it("should retry login on failure and eventually succeed", async () => {
            vi.useFakeTimers();

            const client = new ClientBase(mockRuntime, {
                ...mockConfig,
                TWITTER_RETRY_LIMIT: 3,
            });

            const mockCookies = [{ key: "session", value: "abc123" }];

            // Mock login flow - fail twice, then succeed
            client.twitterClient.isLoggedIn = vi
                .fn()
                .mockResolvedValueOnce(false) // Initial check
                .mockResolvedValueOnce(false) // After first login attempt
                .mockResolvedValueOnce(false) // After second login attempt
                .mockResolvedValueOnce(true); // After third login attempt

            client.twitterClient.login = vi
                .fn()
                .mockRejectedValueOnce(new Error("Login failed"))
                .mockRejectedValueOnce(new Error("Login failed"))
                .mockResolvedValueOnce(undefined);

            client.twitterClient.getCookies = vi
                .fn()
                .mockResolvedValue(mockCookies);

            // Start the async operation
            const initPromise = client.init();

            // Fast-forward through the retry delays
            vi.advanceTimersByTime(10000); // First retry delay
            await vi.runOnlyPendingTimersAsync();
            vi.advanceTimersByTime(10000); // Second retry delay
            await vi.runOnlyPendingTimersAsync();

            await initPromise;

            expect(client.twitterClient.login).toHaveBeenCalledTimes(3);

            vi.useRealTimers();
        });

        it("should throw error after max retries exceeded", async () => {
            const client = new ClientBase(mockRuntime, {
                ...mockConfig,
                TWITTER_RETRY_LIMIT: 1, // Reduce retries for faster test
            });

            // Mock login always failing
            client.twitterClient.isLoggedIn = vi.fn().mockResolvedValue(false);
            client.twitterClient.login = vi
                .fn()
                .mockRejectedValue(new Error("Login failed"));

            // Mock setTimeout to execute immediately for faster testing
            const originalSetTimeout = global.setTimeout;
            global.setTimeout = ((callback: any) => {
                callback();
                return 1 as any;
            }) as any;

            try {
                await expect(client.init()).rejects.toThrow(
                    "Twitter login failed after maximum retries."
                );
            } finally {
                // Restore original setTimeout
                global.setTimeout = originalSetTimeout;
            }
        });

        it("should initialize without cached cookies", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            vi.spyOn(client, "getCachedCookies").mockResolvedValue(undefined);

            // Mock successful login flow
            client.twitterClient.isLoggedIn = vi.fn().mockResolvedValue(true);

            await client.init();

            expect(client.getCachedCookies).toHaveBeenCalledWith("testuser");
            expect(client.setCookiesFromArray).not.toHaveBeenCalled();
            expect(client.twitterClient.isLoggedIn).toHaveBeenCalled();
        });

        it("should set up runtime character twitter profile correctly", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockProfile = {
                id: "123456789",
                username: "testuser",
                screenName: "Test User",
                bio: "Test bio for user",
                nicknames: ["test", "user"],
            };

            vi.spyOn(client, "fetchProfile").mockResolvedValue(mockProfile);
            client.twitterClient.isLoggedIn = vi.fn().mockResolvedValue(true);

            await client.init();

            expect(client.profile).toEqual(mockProfile);
            expect(mockRuntime.character.twitterProfile).toEqual(mockProfile);
        });

        it("should throw error when profile fetch fails", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            vi.spyOn(client, "fetchProfile").mockResolvedValue(null as any);
            client.twitterClient.isLoggedIn = vi.fn().mockResolvedValue(true);

            await expect(client.init()).rejects.toThrow(
                "Failed to load profile"
            );
        });

        it("should handle login success on second isLoggedIn check after login", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            const mockCookies = [{ key: "session", value: "new123" }];

            // Mock flow: not logged in initially, login succeeds, then logged in
            client.twitterClient.isLoggedIn = vi
                .fn()
                .mockResolvedValueOnce(false) // Initial check
                .mockResolvedValueOnce(true); // After login call

            client.twitterClient.login = vi.fn().mockResolvedValue(undefined);
            client.twitterClient.getCookies = vi
                .fn()
                .mockResolvedValue(mockCookies);

            await client.init();

            expect(client.twitterClient.login).toHaveBeenCalledTimes(1);
            expect(client.cacheCookies).toHaveBeenCalledWith(
                "testuser",
                mockCookies
            );
        });

        it("should call all initialization steps in correct order", async () => {
            const client = new ClientBase(mockRuntime, mockConfig);

            client.twitterClient.isLoggedIn = vi.fn().mockResolvedValue(true);

            const callOrder: string[] = [];

            vi.spyOn(client, "getCachedCookies").mockImplementation(
                async () => {
                    callOrder.push("getCachedCookies");
                    return undefined;
                }
            );

            vi.spyOn(client, "fetchProfile").mockImplementation(async () => {
                callOrder.push("fetchProfile");
                return {
                    id: "123",
                    username: "testuser",
                    screenName: "Test",
                    bio: "Bio",
                    nicknames: [],
                };
            });

            vi.spyOn(client, "loadLatestCheckedTweetId").mockImplementation(
                async () => {
                    callOrder.push("loadLatestCheckedTweetId");
                    return undefined;
                }
            );

            vi.spyOn(client as any, "populateTimeline").mockImplementation(
                async () => {
                    callOrder.push("populateTimeline");
                    return undefined;
                }
            );

            await client.init();

            expect(callOrder).toEqual([
                "getCachedCookies",
                "fetchProfile",
                "loadLatestCheckedTweetId",
                "populateTimeline",
            ]);
        });
    });

    describe("populateTimeline", () => {
        let client: ClientBase;

        beforeEach(() => {
            client = new ClientBase(mockRuntime, mockConfig);
            client.profile = {
                id: "123",
                username: "testuser",
                screenName: "Test User",
                bio: "Test bio",
                nicknames: [],
            };

            // Mock runtime dependencies
            mockRuntime.messageManager = {
                getMemoriesByRoomIds: vi.fn().mockResolvedValue([]),
                getMemoryById: vi.fn().mockResolvedValue(undefined),
                createMemory: vi.fn().mockResolvedValue(undefined),
            } as any;

            mockRuntime.ensureUserExists = vi.fn().mockResolvedValue(undefined);
            mockRuntime.ensureConnection = vi.fn().mockResolvedValue(undefined);
        });

        it("should handle empty cached timeline", async () => {
            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "fetchHomeTimeline").mockResolvedValue([]);
            vi.spyOn(client, "fetchSearchTweets").mockResolvedValue({
                tweets: [],
            });
            vi.spyOn(client, "cacheTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheMentions").mockResolvedValue(undefined);

            await (client as any).populateTimeline();

            expect(client.fetchHomeTimeline).toHaveBeenCalledWith(50); // No cache, so 50
            expect(client.fetchSearchTweets).toHaveBeenCalledWith(
                "@testuser",
                20,
                SearchMode.Latest
            );
            expect(client.cacheTimeline).toHaveBeenCalledWith([]);
            expect(client.cacheMentions).toHaveBeenCalledWith([]);
        });

        it("should process cached timeline with some tweets needing save", async () => {
            const cachedTweets = [
                createMockTweet({
                    id: "tweet1",
                    conversationId: "conv1",
                    userId: "user1",
                    username: "user1",
                    name: "User One",
                    text: "Cached tweet 1",
                    permanentUrl: "https://x.com/user1/status/tweet1",
                    timestamp: Date.now() / 1000,
                }),
                createMockTweet({
                    id: "tweet2",
                    conversationId: "conv2",
                    userId: "user2",
                    username: "user2",
                    name: "User Two",
                    text: "Cached tweet 2",
                    permanentUrl: "https://x.com/user2/status/tweet2",
                    timestamp: Date.now() / 1000,
                }),
            ];

            // Only include one tweet in existing memories, so tweet2 needs to be saved
            const existingMemories = [
                { id: stringToUuid("tweet1" + "-" + mockRuntime.agentId) },
            ];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(
                cachedTweets
            );
            vi.spyOn(client, "cacheTweet").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue(existingMemories);

            await (client as any).populateTimeline();

            // Since some cached tweets exist in memory (tweet1), someCachedTweetsExist is true
            // So it processes cached tweets and returns early without calling fetchHomeTimeline
            expect(
                mockRuntime.messageManager.getMemoriesByRoomIds
            ).toHaveBeenCalled();
            expect(
                mockRuntime.messageManager.createMemory
            ).toHaveBeenCalledTimes(1); // Only tweet2
            expect(mockRuntime.ensureConnection).toHaveBeenCalledTimes(1);
            expect(client.cacheTweet).toHaveBeenCalledTimes(1); // Only tweet2
        });

        it("should handle agent's own tweets in cached timeline", async () => {
            const cachedTweets = [
                createMockTweet({
                    id: "mytweet1",
                    conversationId: "conv1",
                    userId: "123", // Agent's own ID
                    username: "testuser",
                    name: "Test User",
                    text: "My own tweet",
                    permanentUrl: "https://x.com/testuser/status/mytweet1",
                    timestamp: Date.now() / 1000,
                }),
                createMockTweet({
                    id: "other1",
                    conversationId: "conv2",
                    userId: "other",
                    username: "otheruser",
                    name: "Other User",
                    text: "Other tweet",
                    permanentUrl: "https://x.com/otheruser/status/other1",
                    timestamp: Date.now() / 1000,
                }),
            ];

            // Include one tweet in memory so someCachedTweetsExist = true
            const existingMemories = [
                { id: stringToUuid("other1" + "-" + mockRuntime.agentId) },
            ];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(
                cachedTweets
            );
            vi.spyOn(client, "cacheTweet").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue(existingMemories);

            await (client as any).populateTimeline();

            expect(mockRuntime.ensureConnection).toHaveBeenCalledWith(
                mockRuntime.agentId,
                expect.any(String),
                "testuser",
                "Test User",
                "twitter"
            );
        });

        it("should handle tweets with reply chains in cached timeline", async () => {
            const cachedTweets = [
                createMockTweet({
                    id: "reply1",
                    conversationId: "conv1",
                    inReplyToStatusId: "original1",
                    text: "This is a reply",
                    permanentUrl: "https://x.com/user1/status/reply1",
                    timestamp: Date.now() / 1000,
                }),
                createMockTweet({
                    id: "other1",
                    conversationId: "conv2",
                    text: "Other tweet",
                    permanentUrl: "https://x.com/user1/status/other1",
                    timestamp: Date.now() / 1000,
                }),
            ];

            // Include one tweet in memory so someCachedTweetsExist = true
            const existingMemories = [
                { id: stringToUuid("other1" + "-" + mockRuntime.agentId) },
            ];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(
                cachedTweets
            );
            vi.spyOn(client, "cacheTweet").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue(existingMemories);

            await (client as any).populateTimeline();

            expect(
                mockRuntime.messageManager.createMemory
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        inReplyTo: stringToUuid(
                            "original1" + "-" + mockRuntime.agentId
                        ),
                    }),
                }),
                "twitter",
                true,
                true
            );
        });

        it("should break early when finding existing memory during cached processing", async () => {
            const cachedTweets = [
                createMockTweet({ id: "tweet1", conversationId: "conv1" }),
                createMockTweet({ id: "tweet2", conversationId: "conv2" }),
            ];

            // Include one tweet in existing memories so someCachedTweetsExist = true
            const existingMemories = [
                { id: stringToUuid("tweet1" + "-" + mockRuntime.agentId) },
            ];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(
                cachedTweets
            );
            vi.spyOn(client, "cacheTweet").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue(existingMemories);

            // Mock getMemoryById to return existing memory for first tweet
            mockRuntime.messageManager.getMemoryById = vi
                .fn()
                .mockResolvedValueOnce({ id: "existing-memory" }) // First call returns existing
                .mockResolvedValue(undefined); // Subsequent calls return undefined

            await (client as any).populateTimeline();

            // Should try to process tweet2 but then break on first getMemoryById call
            expect(
                mockRuntime.messageManager.getMemoryById
            ).toHaveBeenCalledTimes(1);
            expect(
                mockRuntime.messageManager.createMemory
            ).not.toHaveBeenCalled();
        });

        it("should fetch fresh timeline when no cache exists", async () => {
            const freshTimeline = [
                createMockTweet({
                    id: "fresh1",
                    conversationId: "conv1",
                    text: "Fresh tweet",
                    permanentUrl: "https://x.com/user1/status/fresh1",
                    timestamp: Date.now() / 1000,
                }),
            ];

            const mentions = [
                createMockTweet({
                    id: "mention1",
                    conversationId: "conv2",
                    text: "@testuser hello",
                    permanentUrl: "https://x.com/user2/status/mention1",
                    timestamp: Date.now() / 1000,
                }),
            ];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "fetchHomeTimeline").mockResolvedValue(
                freshTimeline
            );
            vi.spyOn(client, "fetchSearchTweets").mockResolvedValue({
                tweets: mentions,
            });
            vi.spyOn(client, "cacheTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheMentions").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheTweet").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue([]);

            await (client as any).populateTimeline();

            expect(client.fetchHomeTimeline).toHaveBeenCalledWith(50);
            expect(client.fetchSearchTweets).toHaveBeenCalledWith(
                "@testuser",
                20,
                SearchMode.Latest
            );
            expect(mockRuntime.ensureUserExists).toHaveBeenCalledWith(
                mockRuntime.agentId,
                "testuser",
                mockRuntime.character.name,
                "twitter"
            );
            expect(
                mockRuntime.messageManager.createMemory
            ).toHaveBeenCalledTimes(2);
            expect(client.cacheTimeline).toHaveBeenCalledWith(freshTimeline);
            expect(client.cacheMentions).toHaveBeenCalledWith(mentions);
        });

        it("should fetch limited timeline when cache exists but no cached tweets exist in memory", async () => {
            const cachedTweets = [
                createMockTweet({ id: "cached1", conversationId: "conv1" }),
            ];

            // Empty existing memories - so cached tweets don't exist in memory
            const existingMemories: any[] = [];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(
                cachedTweets
            );
            vi.spyOn(client, "fetchHomeTimeline").mockResolvedValue([]);
            vi.spyOn(client, "fetchSearchTweets").mockResolvedValue({
                tweets: [],
            });
            vi.spyOn(client, "cacheTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheMentions").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue(existingMemories);

            await (client as any).populateTimeline();

            // Since no cached tweets exist in memory, someCachedTweetsExist is false
            // so it falls through to fetching fresh timeline, and since cache exists it fetches 10 not 50
            expect(client.fetchHomeTimeline).toHaveBeenCalledWith(10);
        });

        it("should filter duplicate tweets from timeline and mentions", async () => {
            const timeline = [
                createMockTweet({
                    id: "duplicate1",
                    conversationId: "conv1",
                    text: "Duplicate tweet",
                    timestamp: Date.now() / 1000,
                }),
            ];

            const mentions = [
                createMockTweet({
                    id: "duplicate1", // Same ID as timeline tweet
                    conversationId: "conv1",
                    text: "Duplicate tweet",
                    timestamp: Date.now() / 1000,
                }),
                createMockTweet({
                    id: "unique1",
                    conversationId: "conv2",
                    text: "Unique mention",
                    timestamp: Date.now() / 1000,
                }),
            ];

            const existingMemories = [
                { id: stringToUuid("duplicate1" + "-" + mockRuntime.agentId) },
            ];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "fetchHomeTimeline").mockResolvedValue(timeline);
            vi.spyOn(client, "fetchSearchTweets").mockResolvedValue({
                tweets: mentions,
            });
            vi.spyOn(client, "cacheTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheMentions").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheTweet").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue(existingMemories);

            await (client as any).populateTimeline();

            // Should only save the unique mention, not the duplicate
            expect(
                mockRuntime.messageManager.createMemory
            ).toHaveBeenCalledTimes(1);
            expect(
                mockRuntime.messageManager.createMemory
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: stringToUuid("unique1" + "-" + mockRuntime.agentId),
                }),
                "twitter",
                true,
                true
            );
        });

        it("should handle fresh timeline with agent's own tweets", async () => {
            const timeline = [
                createMockTweet({
                    id: "mytweet1",
                    conversationId: "conv1",
                    userId: "123", // Agent's own ID
                    username: "testuser",
                    name: "Test User",
                    text: "My fresh tweet",
                    timestamp: Date.now() / 1000,
                }),
            ];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "fetchHomeTimeline").mockResolvedValue(timeline);
            vi.spyOn(client, "fetchSearchTweets").mockResolvedValue({
                tweets: [],
            });
            vi.spyOn(client, "cacheTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheMentions").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheTweet").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue([]);

            await (client as any).populateTimeline();

            expect(mockRuntime.ensureConnection).toHaveBeenCalledWith(
                mockRuntime.agentId,
                expect.any(String),
                "testuser",
                "Test User",
                "twitter"
            );
        });

        it("should handle fresh timeline with reply tweets", async () => {
            const timeline = [
                createMockTweet({
                    id: "reply1",
                    conversationId: "conv1",
                    inReplyToStatusId: "original1",
                    text: "Fresh reply tweet",
                    timestamp: Date.now() / 1000,
                }),
            ];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "fetchHomeTimeline").mockResolvedValue(timeline);
            vi.spyOn(client, "fetchSearchTweets").mockResolvedValue({
                tweets: [],
            });
            vi.spyOn(client, "cacheTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheMentions").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheTweet").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue([]);

            await (client as any).populateTimeline();

            expect(
                mockRuntime.messageManager.createMemory
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        inReplyTo: stringToUuid("original1"),
                    }),
                }),
                "twitter",
                true,
                true
            );
        });

        it("should handle empty fresh timeline and mentions", async () => {
            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "fetchHomeTimeline").mockResolvedValue([]);
            vi.spyOn(client, "fetchSearchTweets").mockResolvedValue({
                tweets: [],
            });
            vi.spyOn(client, "cacheTimeline").mockResolvedValue(undefined);
            vi.spyOn(client, "cacheMentions").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue([]);

            await (client as any).populateTimeline();

            expect(mockRuntime.ensureUserExists).toHaveBeenCalled();
            expect(
                mockRuntime.messageManager.createMemory
            ).not.toHaveBeenCalled();
            expect(client.cacheTimeline).toHaveBeenCalledWith([]);
            expect(client.cacheMentions).toHaveBeenCalledWith([]);
        });

        it("should skip processing when all cached tweets already exist in memory", async () => {
            const cachedTweets = [
                createMockTweet({ id: "tweet1", conversationId: "conv1" }),
            ];

            const existingMemories = [
                { id: stringToUuid("tweet1" + "-" + mockRuntime.agentId) },
            ];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(
                cachedTweets
            );
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue(existingMemories);

            await (client as any).populateTimeline();

            // Should not process any tweets since they all exist
            expect(
                mockRuntime.messageManager.createMemory
            ).not.toHaveBeenCalled();
        });

        it("should handle agent's own tweets in cached timeline", async () => {
            const cachedTweets = [
                createMockTweet({
                    id: "mytweet1",
                    conversationId: "conv1",
                    userId: "123", // Agent's own ID
                    username: "testuser",
                    name: "Test User",
                    text: "My own tweet",
                    permanentUrl: "https://x.com/testuser/status/mytweet1",
                    timestamp: Date.now() / 1000,
                }),
                createMockTweet({
                    id: "other1",
                    conversationId: "conv2",
                    userId: "other",
                    username: "otheruser",
                    name: "Other User",
                    text: "Other tweet",
                    permanentUrl: "https://x.com/otheruser/status/other1",
                    timestamp: Date.now() / 1000,
                }),
            ];

            // Include one tweet in memory so someCachedTweetsExist = true
            const existingMemories = [
                { id: stringToUuid("other1" + "-" + mockRuntime.agentId) },
            ];

            vi.spyOn(client, "getCachedTimeline").mockResolvedValue(
                cachedTweets
            );
            vi.spyOn(client, "cacheTweet").mockResolvedValue(undefined);
            mockRuntime.messageManager.getMemoriesByRoomIds = vi
                .fn()
                .mockResolvedValue(existingMemories);

            await (client as any).populateTimeline();

            expect(mockRuntime.ensureConnection).toHaveBeenCalledWith(
                mockRuntime.agentId,
                expect.any(String),
                "testuser",
                "Test User",
                "twitter"
            );
        });
    });
});
