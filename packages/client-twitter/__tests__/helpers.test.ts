import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    IAgentRuntime,
    truncateToCompleteSentence,
    elizaLogger,
    UUID,
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
    createMockTweet,
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
    let mockTwitterApiV2Client: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockTwitterClient = buildTwitterClientMock();
        mockRuntime = buildRuntimeMock();
        mockConfig = buildConfigMock();
        baseClient = new ClientBase(mockRuntime, mockConfig);

        baseClient.twitterClient = mockTwitterClient;

        // Mock TwitterApiV2Client
        mockTwitterApiV2Client = {
            createTweet: vi.fn().mockResolvedValue(createMockTweet()),
            createNoteTweet: vi.fn().mockResolvedValue(createMockTweet()),
            uploadMedia: vi.fn().mockResolvedValue("media-id-123"),
        };
        baseClient.twitterApiV2Client = mockTwitterApiV2Client as any;

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

    it("should handle tweet posting", async () => {
        const tweetContent = "Test tweet";

        const result = await TwitterHelpers.handleTweet(
            baseClient,
            tweetContent
        );

        expect(mockTwitterApiV2Client.createTweet).toHaveBeenCalledWith(
            tweetContent,
            undefined,
            undefined
        );
        expect(result).toBeDefined();
    });

    it("should handle long tweet posting", async () => {
        const tweetContent =
            "A very long tweet that exceeds standard length...".repeat(10);

        const result = await TwitterHelpers.handleTweet(
            baseClient,
            tweetContent
        );

        expect(mockTwitterApiV2Client.createTweet).toHaveBeenCalledWith(
            tweetContent,
            undefined,
            undefined
        );
        expect(result).toBeDefined();
    });

    it("should handle quote tweet posting successfully", async () => {
        const quoteContent = "This is a quote tweet";
        const tweetId = "123456789";

        const mockTwitterApiV2Client = {
            quoteTweet: vi
                .fn()
                .mockResolvedValue(createMockTweet({ id: "987654321" })),
        };
        baseClient.twitterApiV2Client = mockTwitterApiV2Client as any;

        await TwitterHelpers.handleQuoteTweet(
            baseClient,
            quoteContent,
            tweetId
        );

        expect(mockTwitterApiV2Client.quoteTweet).toHaveBeenCalledWith(
            quoteContent,
            tweetId
        );

        expect(elizaLogger.log).toHaveBeenCalledWith(
            "Successfully posted quote tweet"
        );
    });

    it("should handle quote tweet posting failure and throw error", async () => {
        const quoteContent = "This is a failed quote tweet";
        const tweetId = "123456789";

        const mockTwitterApiV2Client = {
            quoteTweet: vi
                .fn()
                .mockRejectedValue(new Error("Failed to create quote tweet")),
        };
        baseClient.twitterApiV2Client = mockTwitterApiV2Client as any;

        await expect(
            TwitterHelpers.handleQuoteTweet(baseClient, quoteContent, tweetId)
        ).rejects.toThrow("Failed to create quote tweet");

        expect(mockTwitterApiV2Client.quoteTweet).toHaveBeenCalledWith(
            quoteContent,
            tweetId
        );
    });

    describe("Cache Management", () => {
        it("should properly manage tweet cache", async () => {
            const mockTweet = createMockTweet({ text: "Test tweet" });

            vi.mocked(mockRuntime.cacheManager.get).mockResolvedValue(null);
            vi.mocked(mockRuntime.cacheManager.set).mockResolvedValue(
                undefined
            );

            await TwitterHelpers.processAndCacheTweet(
                mockRuntime,
                baseClient,
                mockTweet,
                "room-123" as UUID,
                mockTweet.text ?? ""
            );

            expect(mockRuntime.cacheManager.set).toHaveBeenCalled();
            expect(mockRuntime.messageManager.createMemory).toHaveBeenCalled();
        });
    });
});
