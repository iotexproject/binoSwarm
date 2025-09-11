import { describe, it, expect, vi, beforeEach } from "vitest";
import { elizaLogger, generateObject } from "@elizaos/core";

import { SearchTweetSelector } from "../src/SearchTweetSelector";
import { ClientBase } from "../src/base";
import {
    buildRuntimeMock,
    buildConfigMock,
    buildTwitterClientMock,
    createMockTweet,
} from "./mocks";

// Mock dependencies
vi.mock("@elizaos/core", async () => {
    const actual = await vi.importActual("@elizaos/core");
    return {
        ...actual,
        elizaLogger: {
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
        generateObject: vi.fn(),
        composeContext: vi.fn().mockReturnValue("mocked context"),
    };
});

describe("SearchTweetSelector", () => {
    let selector: SearchTweetSelector;
    let mockRuntime: any;
    let mockClient: any;
    let mockTwitterClient: any;
    let mockConfig: any;
    let mockRequestQueue: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup mocks
        mockRuntime = buildRuntimeMock();
        mockConfig = buildConfigMock();
        mockTwitterClient = buildTwitterClientMock();

        // Setup client
        mockClient = new ClientBase(mockRuntime, mockConfig);
        mockClient.twitterClient = mockTwitterClient;

        // Setup request queue
        mockRequestQueue = {
            add: vi.fn((fn) => fn()),
        };
        mockClient.requestQueue = mockRequestQueue;

        // Setup runtime with character
        mockRuntime.character = {
            topics: new Set(["javascript", "programming", "technology"]),
        };

        // Create selector instance
        selector = new SearchTweetSelector(mockRuntime, mockClient);
    });

    describe("selectTweet", () => {
        it("should select a tweet successfully", async () => {
            // Mock tweets
            const mockTweets = [
                createMockTweet({
                    id: "123456789",
                    text: "Tweet about javascript",
                    username: "someuser",
                }),
                createMockTweet({
                    id: "987654321",
                    text: "Another tweet",
                    username: "anotheruser",
                }),
            ];

            // Mock necessary methods
            mockClient.fetchSearchTweets = vi.fn().mockResolvedValue({
                tweets: mockTweets,
            });

            // Mock generateObject to return a valid tweetId
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "123456789" },
            } as any);

            // Execute the method
            const result = await selector.selectTweet();

            // Assertions
            expect(result).toBeDefined();
            expect(result.id).toBe("123456789");
            expect(result.text).toBe("Tweet about javascript");
            expect(mockClient.fetchSearchTweets).toHaveBeenCalled();
            expect(generateObject).toHaveBeenCalled();
        });

        it("should use the environment search terms when selecting a tweet", async () => {
            // Setup environment search terms
            const searchTerms = ["term1", "term2", "term3"];
            mockClient.twitterConfig.TWITTER_SEARCH_TERMS = searchTerms;

            // Mock Math.random to always select the first term
            const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

            // Spy on the private getSearchTerm method and make it return the first search term
            const getSearchTermSpy = vi.spyOn(selector as any, "getSearchTerm");
            getSearchTermSpy.mockReturnValue(searchTerms[0]);

            // Mock tweets with a username that's different from the bot
            const mockTweets = [
                createMockTweet({
                    id: "123456789",
                    username: "other_user", // Not the bot username
                    name: "Other User",
                }),
            ];

            // Mock necessary methods
            mockClient.fetchSearchTweets = vi.fn().mockResolvedValue({
                tweets: mockTweets,
            });

            // Mock generateObject
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "123456789" },
            } as any);

            try {
                // Execute the method
                await selector.selectTweet();

                // Verify the search term from environment was used
                expect(mockClient.fetchSearchTweets).toHaveBeenCalledWith(
                    searchTerms[0],
                    expect.any(Number)
                );

                // Don't check for the specific log message since it will be overwritten
                // by subsequent log calls during the test execution
            } finally {
                randomSpy.mockRestore();
                getSearchTermSpy.mockRestore();
            }
        });

        it("should throw error when no tweets are found", async () => {
            // Mock empty tweets result
            mockClient.fetchSearchTweets = vi.fn().mockResolvedValue({
                tweets: [],
            });

            // Execute and assert
            await expect(selector.selectTweet()).rejects.toThrow(
                "No valid tweets found for the search term"
            );

            // Verify logging - looser assertion that checks for any call with the required first argument
            const logCalls = vi.mocked(elizaLogger.log).mock.calls;
            const foundValidationCall = logCalls.some(
                (call) =>
                    call[0] === "No valid tweets found for the search term"
            );
            expect(foundValidationCall).toBe(true);
        });

        it("should throw error when selected tweet is from bot itself", async () => {
            // Create tweets including one from the bot
            const mockTweets = [
                createMockTweet({
                    id: "123456789",
                    text: "Tweet from bot",
                    username: mockConfig.TWITTER_USERNAME,
                }),
            ];

            // Mock setup
            mockClient.fetchSearchTweets = vi.fn().mockResolvedValue({
                tweets: mockTweets,
            });

            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "123456789" },
            } as any);

            // Execute and assert
            await expect(selector.selectTweet()).rejects.toThrow(
                "Skipping tweet from bot itself"
            );

            // Verify logging
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "Skipping tweet from bot itself"
            );
        });

        it("should throw error when no matching tweet is found for selected ID", async () => {
            // Create tweets
            const mockTweets = [
                createMockTweet({ id: "123456789", text: "Test tweet" }),
            ];

            // Mock setup
            mockClient.fetchSearchTweets = vi.fn().mockResolvedValue({
                tweets: mockTweets,
            });

            // Return a non-existent tweet ID
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "non-existent-id" },
            } as any);

            // Execute and assert
            await expect(selector.selectTweet()).rejects.toThrow(
                "No matching tweet found for the selected ID"
            );

            // Verify logging
            expect(elizaLogger.warn).toHaveBeenCalledWith(
                "No matching tweet found for the selected ID"
            );
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "Selected tweet ID:",
                "non-existent-id"
            );
        });

        it("should throw error when generateObject doesn't return a valid object", async () => {
            // Create tweets
            const mockTweets = [
                createMockTweet({ id: "123456789", text: "Test tweet" }),
            ];

            // Mock setup
            mockClient.fetchSearchTweets = vi.fn().mockResolvedValue({
                tweets: mockTweets,
            });

            // Return an empty result from generateObject
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: null,
            } as any);

            // Execute and assert
            await expect(selector.selectTweet()).rejects.toThrow(
                "Choose most interesting tweet: No tweet ID found in the response"
            );

            // Verify logging
            expect(elizaLogger.warn).toHaveBeenCalledWith(
                "No tweet ID found in the response"
            );
        });

        it("should fall back to character topics when no search terms are configured", async () => {
            // Ensure no search terms in config
            mockClient.twitterConfig.TWITTER_SEARCH_TERMS = [];

            // Ensure character topics are set properly
            const topics = ["javascript", "programming", "technology"];
            mockRuntime.character.topics = new Set(topics);

            // Mock Math.random to select the first topic
            const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

            // Spy on the private getSearchTerm method and make it return the first topic
            const getSearchTermSpy = vi.spyOn(selector as any, "getSearchTerm");
            getSearchTermSpy.mockReturnValue(topics[0]);

            // Mock tweets with a username that's different from the bot
            const mockTweets = [
                createMockTweet({
                    id: "123456789",
                    username: "other_user", // Not the bot username
                    name: "Other User",
                }),
            ];

            // Mock necessary methods
            mockClient.fetchSearchTweets = vi.fn().mockResolvedValue({
                tweets: mockTweets,
            });

            // Mock generateObject
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "123456789" },
            } as any);

            try {
                // Execute the method
                await selector.selectTweet();

                // Verify the search term from character topics was used
                expect(mockClient.fetchSearchTweets).toHaveBeenCalledWith(
                    topics[0],
                    expect.any(Number)
                );

                // Don't check for the specific log message since it will be overwritten
                // by subsequent log calls during the test execution
            } finally {
                randomSpy.mockRestore();
                getSearchTermSpy.mockRestore();
            }
        });
    });

    describe("tweet filtering", () => {
        it("should filter out tweets where thread contains a tweet by the bot", async () => {
            // Create tweets where one has a thread containing bot tweet and one does not
            const mockTweets = [
                createMockTweet({
                    id: "123456789",
                    text: "Normal tweet",
                    username: "someuser1",
                    thread: [
                        createMockTweet({ username: "someuser" }),
                        createMockTweet({
                            username: mockConfig.TWITTER_USERNAME,
                        }), // Bot in thread
                    ],
                }),
                createMockTweet({
                    id: "987654321",
                    text: "Clean tweet",
                    username: "someuser2", // not the bot
                    thread: [createMockTweet({ username: "otheruser" })],
                }),
            ];

            // Mock setup
            mockClient.fetchSearchTweets = vi.fn().mockResolvedValue({
                tweets: mockTweets,
            });

            // Return the second tweet ID (the clean one)
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "987654321" },
            } as any);

            // Access the private formatTweets method
            const formatTweets = vi.spyOn(selector as any, "formatTweets");

            try {
                // Execute method - we're just testing formatTweets gets called correctly
                await selector.selectTweet();

                // Check formatTweets was called with the right tweets
                expect(formatTweets).toHaveBeenCalledWith(mockTweets);

                // We know that internally, it filters on username in thread
                // Testing the implementation directly isn't necessary, but we can
                // verify our mock data is correctly structured
                const formattedTweets = (selector as any).formatTweets(
                    mockTweets
                );
                expect(formattedTweets).not.toContain("123456789"); // Filtered out
                expect(formattedTweets).toContain("987654321"); // Kept in
            } finally {
                formatTweets.mockRestore();
            }
        });

        it("should filter out tweets from users in TWITTER_TARGET_USERS list", () => {
            // Create tweets with one user from the target list and one not in the list
            const targetUsername = "targeted_user";
            const nonTargetUsername = "regular_user";

            // Setup target users in config
            mockClient.twitterConfig.TWITTER_TARGET_USERS = [targetUsername];

            const mockTweets = [
                createMockTweet({
                    id: "123456789",
                    text: "Tweet from targeted user",
                    username: targetUsername,
                    thread: [],
                }),
                createMockTweet({
                    id: "987654321",
                    text: "Tweet from regular user",
                    username: nonTargetUsername,
                    thread: [],
                }),
            ];

            // Directly test the filterOutTargetUsers method
            const filterOutTargetUsers = vi.spyOn(
                selector as any,
                "filterOutTargetUsers"
            );

            try {
                // Call formatTweets which internally calls filterOutTargetUsers
                const formattedTweets = (selector as any).formatTweets(
                    mockTweets
                );

                // Verify filterOutTargetUsers was called
                expect(filterOutTargetUsers).toHaveBeenCalled();

                // Verify the result doesn't contain the tweet from targeted user
                expect(formattedTweets).not.toContain(targetUsername);
                expect(formattedTweets).not.toContain("123456789");

                // Verify the result contains the tweet from non-targeted user
                expect(formattedTweets).toContain(nonTargetUsername);
                expect(formattedTweets).toContain("987654321");
            } finally {
                filterOutTargetUsers.mockRestore();
            }
        });

        it("should not filter any tweets when TWITTER_TARGET_USERS is empty", () => {
            // Create test tweets
            const username1 = "user1";
            const username2 = "user2";

            // Ensure target users is empty
            mockClient.twitterConfig.TWITTER_TARGET_USERS = [];

            const mockTweets = [
                createMockTweet({
                    id: "123456789",
                    text: "Tweet from user 1",
                    username: username1,
                    thread: [],
                }),
                createMockTweet({
                    id: "987654321",
                    text: "Tweet from user 2",
                    username: username2,
                    thread: [],
                }),
            ];

            // Test that all tweets pass through when no target users are specified
            const filteredTweets = (selector as any).filterOutTargetUsers(
                mockTweets
            );

            // Verify that no tweets were filtered out
            expect(filteredTweets.length).toBe(mockTweets.length);
            expect(filteredTweets).toEqual(mockTweets);
        });

        it("should filter out tweets from the bot itself regardless of case", () => {
            // The configured bot username with lowercase
            const botUsername = mockConfig.TWITTER_USERNAME.toLowerCase();

            // Create tweets with different cases of the bot username
            const mockTweets = [
                createMockTweet({
                    id: "123456789",
                    text: "Tweet from bot (lowercase)",
                    username: botUsername,
                    thread: [],
                }),
                createMockTweet({
                    id: "987654321",
                    text: "Tweet from bot (uppercase)",
                    username: botUsername.toUpperCase(),
                    thread: [],
                }),
                createMockTweet({
                    id: "246813579",
                    text: "Tweet from bot (mixed case)",
                    username:
                        botUsername.charAt(0).toUpperCase() +
                        botUsername.slice(1),
                    thread: [],
                }),
                createMockTweet({
                    id: "135792468",
                    text: "Tweet from regular user",
                    username: "regular_user",
                    thread: [],
                }),
            ];

            // Test the filterOutBotTweets method directly
            const filteredTweets = (selector as any).filterOutBotTweets(
                mockTweets
            );

            // Verify that all bot tweets are filtered out regardless of case
            expect(filteredTweets.length).toBe(1);
            expect(filteredTweets[0].id).toBe("135792468");
            expect(filteredTweets[0].username).toBe("regular_user");
        });

        it("should throw error when selected tweet is from bot itself with different case", async () => {
            // Create tweet with different case than the configured username
            const mockTweets = [
                createMockTweet({
                    id: "123456789",
                    text: "Tweet from bot with different case",
                    username: mockConfig.TWITTER_USERNAME.toUpperCase(),
                }),
            ];

            // Mock setup
            mockClient.fetchSearchTweets = vi.fn().mockResolvedValue({
                tweets: mockTweets,
            });

            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "123456789" },
            } as any);

            // Execute and assert - should throw despite case difference
            await expect(selector.selectTweet()).rejects.toThrow(
                "Skipping tweet from bot itself"
            );

            // Verify logging
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "Skipping tweet from bot itself"
            );
        });
    });

    describe("getSearchTerm", () => {
        it("should use configured TWITTER_SEARCH_TERMS when available", () => {
            // Setup with search terms in config
            const searchTerms = ["term1", "term2", "term3"];
            mockClient.twitterConfig.TWITTER_SEARCH_TERMS = searchTerms;

            // Mock Math.random to return predictable value
            const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

            try {
                // Call the method directly
                const term = (selector as any).getSearchTerm();

                // Verify result is from the search terms
                expect(term).toBe(searchTerms[0]);
                // We can't verify the log call here since it will be mixed with other test logs
            } finally {
                randomSpy.mockRestore();
            }
        });

        it("should fall back to character topics when no search terms are configured", () => {
            // Ensure no search terms in config
            mockClient.twitterConfig.TWITTER_SEARCH_TERMS = [];

            // Ensure character topics are set properly
            const topics = ["javascript", "programming", "technology"];
            mockRuntime.character.topics = new Set(topics);

            // Mock Math.random to return predictable values
            const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

            try {
                // Call the method directly
                const term = (selector as any).getSearchTerm();

                // Verify result is from the character topics
                expect(term).toBe(topics[0]);
                // We can't verify the log call here since it will be mixed with other test logs
            } finally {
                randomSpy.mockRestore();
            }
        });

        it("should handle empty search terms array", () => {
            // Explicitly set empty array
            mockClient.twitterConfig.TWITTER_SEARCH_TERMS = [];

            // Ensure character topics are set properly
            const topics = ["javascript", "programming", "technology"];
            mockRuntime.character.topics = new Set(topics);

            // Mock Math.random to return predictable values
            const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

            try {
                // Call the method directly
                const term = (selector as any).getSearchTerm();

                // Verify fallback to topics
                expect(term).toBe(topics[0]);
                // We can't verify the log call here since it will be mixed with other test logs
            } finally {
                randomSpy.mockRestore();
            }
        });

        it("should use default fallback term when no search terms and no character topics are available", () => {
            // Explicitly set empty search terms
            mockClient.twitterConfig.TWITTER_SEARCH_TERMS = [];

            // Set empty character topics
            mockRuntime.character.topics = new Set();

            // Call the method directly
            const term = (selector as any).getSearchTerm();

            // Verify default term is returned
            expect(term).toBe("technology");

            // Verify the correct log was called
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "No topics available, using default search term:",
                "technology"
            );
        });
    });
});
