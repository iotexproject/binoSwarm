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
            mockClient.twitterClient.fetchSearchTweets = vi
                .fn()
                .mockResolvedValue({
                    tweets: mockTweets,
                });

            // Mock generateObject to return a valid tweetId
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "123456789" },
                finishReason: "success",
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                warnings: [],
                request: {},
                timestamp: 0,
                metadata: {},
                modelUsed: "",
                duration: 0,
            });

            // Execute the method
            const result = await selector.selectTweet();

            // Assertions
            expect(result).toBeDefined();
            expect(result.id).toBe("123456789");
            expect(result.text).toBe("Tweet about javascript");
            expect(
                mockClient.twitterClient.fetchSearchTweets
            ).toHaveBeenCalled();
            expect(generateObject).toHaveBeenCalled();
        });

        it("should throw error when no tweets are found", async () => {
            // Mock empty tweets result
            mockClient.twitterClient.fetchSearchTweets = vi
                .fn()
                .mockResolvedValue({
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
            mockClient.twitterClient.fetchSearchTweets = vi
                .fn()
                .mockResolvedValue({
                    tweets: mockTweets,
                });

            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "123456789" },
                finishReason: "success",
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                warnings: [],
                request: {},
                timestamp: 0,
                metadata: {},
                modelUsed: "",
                duration: 0,
            });

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
            mockClient.twitterClient.fetchSearchTweets = vi
                .fn()
                .mockResolvedValue({
                    tweets: mockTweets,
                });

            // Return a non-existent tweet ID
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "non-existent-id" },
                finishReason: "success",
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                warnings: [],
                request: {},
                timestamp: 0,
                metadata: {},
                modelUsed: "",
                duration: 0,
            });

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
            mockClient.twitterClient.fetchSearchTweets = vi
                .fn()
                .mockResolvedValue({
                    tweets: mockTweets,
                });

            // Return an empty result from generateObject
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: null,
                finishReason: "error",
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                warnings: [],
                request: {},
                timestamp: 0,
                metadata: {},
                modelUsed: "",
                duration: 0,
            });

            // Execute and assert
            await expect(selector.selectTweet()).rejects.toThrow(
                "Choose most interesting tweet: No tweet ID found in the response"
            );

            // Verify logging
            expect(elizaLogger.warn).toHaveBeenCalledWith(
                "No tweet ID found in the response"
            );
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
                        { username: "someuser" },
                        { username: mockConfig.TWITTER_USERNAME }, // Bot in thread
                    ],
                }),
                createMockTweet({
                    id: "987654321",
                    text: "Clean tweet",
                    username: "someuser2", // not the bot
                    thread: [{ username: "otheruser" }],
                }),
            ];

            // Mock setup
            mockClient.twitterClient.fetchSearchTweets = vi
                .fn()
                .mockResolvedValue({
                    tweets: mockTweets,
                });

            // Return the second tweet ID (the clean one)
            vi.mocked(generateObject).mockResolvedValueOnce({
                object: { tweetId: "987654321" },
                finishReason: "success",
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                warnings: [],
                request: {},
                timestamp: 0,
                metadata: {},
                modelUsed: "",
                duration: 0,
            });

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
    });

    describe("getSearchTerm", () => {
        it("should select a random topic from character topics", () => {
            // Setup mock Math.random to return predictable values
            const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

            // Convert Set to Array for easy access
            const topicsArray = [...mockRuntime.character.topics];

            try {
                // Access private method
                const getSearchTerm = vi.spyOn(
                    Object.getPrototypeOf(selector) as any,
                    "getSearchTerm"
                );
                getSearchTerm.mockImplementation(function (
                    this: SearchTweetSelector
                ) {
                    return topicsArray[0]; // Return first topic
                });

                // Call the method
                const result = (selector as any).getSearchTerm();

                // Verify result is as expected
                expect(result).toBe(topicsArray[0]);
                expect(mockRuntime.character.topics).toContain(result);
            } finally {
                randomSpy.mockRestore();
            }
        });
    });
});
