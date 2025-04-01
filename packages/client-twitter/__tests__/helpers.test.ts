import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    IAgentRuntime,
    truncateToCompleteSentence,
    elizaLogger,
} from "@elizaos/core";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import { TwitterHelpers } from "../src/helpers";
import {
    buildRuntimeMock,
    buildConfigMock,
    buildTwitterClientMock,
    mockTwitterProfile,
    mockCharacter,
    setupMockTwitterClient,
} from "./mocks";

// Mock the truncateToCompleteSentence function
vi.mock("@elizaos/core", async () => {
    const actual = await vi.importActual("@elizaos/core");
    return {
        ...actual,
        elizaLogger: {
            log: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
        },
        truncateToCompleteSentence: vi
            .fn()
            .mockImplementation((text, length) => "Truncated content"),
    };
});

describe("Tweet Generation and Posting", () => {
    let mockRuntime: IAgentRuntime;
    let mockConfig: TwitterConfig;
    let baseClient: ClientBase;
    let mockTwitterClient: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockTwitterClient = buildTwitterClientMock();
        mockRuntime = buildRuntimeMock();
        mockConfig = buildConfigMock();
        baseClient = new ClientBase(mockRuntime, mockConfig);

        baseClient.twitterClient = mockTwitterClient;
        baseClient.profile = mockTwitterProfile;

        // Mock RequestQueue with just the add method since that's all we use
        baseClient.requestQueue = {
            add: async <T>(request: () => Promise<T>): Promise<T> => request(),
        } as any;

        // Setup mock runtime with character
        mockRuntime.character = mockCharacter;

        // Ensure baseClient.profile is not null before each test
        baseClient.profile = mockTwitterProfile;
    });

    it("should handle standard tweet posting", async () => {
        const tweetContent = "Test tweet";
        setupMockTwitterClient(mockTwitterClient, tweetContent);

        await TwitterHelpers.handleStandardTweet(baseClient, tweetContent);
        expect(mockTwitterClient.sendTweet).toHaveBeenCalledWith(
            tweetContent,
            undefined
        );
    });

    it("should handle note tweet posting", async () => {
        const tweetContent =
            "A very long tweet that exceeds standard length...".repeat(10);
        setupMockTwitterClient(mockTwitterClient, tweetContent);

        await TwitterHelpers.handleNoteTweet(baseClient, tweetContent);

        expect(mockTwitterClient.sendNoteTweet).toHaveBeenCalledWith(
            tweetContent,
            undefined
        );
    });

    it("should fallback to standard tweet when note tweet fails", async () => {
        const longTweetContent =
            "A very long tweet that exceeds standard length...".repeat(10);
        const truncatedContent = "Truncated content";

        // Mock sendNoteTweet to return an error
        mockTwitterClient.sendNoteTweet.mockResolvedValue({
            errors: [{ message: "Not authorized for Note Tweet" }],
        });

        // Mock sendTweet to succeed
        const successResponse = {
            data: {
                create_tweet: {
                    tweet_results: {
                        result: { id: "123456" },
                    },
                },
            },
        };
        mockTwitterClient.sendTweet.mockResolvedValue({
            json: () => successResponse,
        });

        const result = await TwitterHelpers.handleNoteTweet(
            baseClient,
            longTweetContent
        );

        // Verify sendNoteTweet was called
        expect(mockTwitterClient.sendNoteTweet).toHaveBeenCalledWith(
            longTweetContent,
            undefined
        );

        // Verify truncateToCompleteSentence was called
        expect(truncateToCompleteSentence).toHaveBeenCalledWith(
            longTweetContent,
            baseClient.twitterConfig.MAX_TWEET_LENGTH
        );

        // Verify fallback to standard tweet
        expect(mockTwitterClient.sendTweet).toHaveBeenCalledWith(
            truncatedContent,
            undefined
        );

        // Verify correct result was returned
        expect(result).toBe(
            successResponse.data.create_tweet.tweet_results.result
        );
    });

    it("should handle quote tweet posting successfully", async () => {
        const quoteContent = "This is a quote tweet";
        const tweetId = "123456789";

        // Mock successful quote tweet response
        const successResponse = {
            data: {
                create_tweet: {
                    tweet_results: {
                        result: { id: "987654321" },
                    },
                },
            },
        };

        mockTwitterClient.sendQuoteTweet.mockResolvedValue({
            json: async () => successResponse,
        });

        await TwitterHelpers.handleQuoteTweet(
            baseClient,
            quoteContent,
            tweetId
        );

        // Verify sendQuoteTweet was called with correct parameters
        expect(mockTwitterClient.sendQuoteTweet).toHaveBeenCalledWith(
            quoteContent,
            tweetId
        );

        // Verify success was logged
        expect(elizaLogger.log).toHaveBeenCalledWith(
            "Successfully posted quote tweet"
        );
    });

    it("should handle quote tweet posting failure and throw error", async () => {
        const quoteContent = "This is a failed quote tweet";
        const tweetId = "123456789";

        // Mock failed quote tweet response
        const failedResponse = {
            errors: [{ message: "Failed to create quote tweet" }],
        };

        mockTwitterClient.sendQuoteTweet.mockResolvedValue({
            json: async () => failedResponse,
        });

        // Expect error to be thrown
        await expect(
            TwitterHelpers.handleQuoteTweet(baseClient, quoteContent, tweetId)
        ).rejects.toThrow("Quote tweet creation failed");

        // Verify sendQuoteTweet was called
        expect(mockTwitterClient.sendQuoteTweet).toHaveBeenCalledWith(
            quoteContent,
            tweetId
        );

        // Verify error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Quote tweet creation failed:",
            failedResponse
        );
    });
});
