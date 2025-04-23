import { describe, it, expect, vi, beforeEach } from "vitest";
import { elizaLogger, ServiceType } from "@elizaos/core";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import { TwitterSearchClient } from "../src/search";
import {
    buildRuntimeMock,
    buildConfigMock,
    buildTwitterClientMock,
    mockTwitterProfile,
    mockCharacter,
    createMockTweet,
} from "./mocks";

// Mock modules
vi.mock("@elizaos/core", async () => {
    const actual = await vi.importActual("@elizaos/core");
    return {
        ...actual,
        elizaLogger: {
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
        generateText: vi.fn(),
        generateMessageResponse: vi.fn(),
        composeContext: vi.fn(),
        stringToUuid: vi
            .fn()
            .mockImplementation(
                (str) => "11111111-2222-3333-4444-555555555555"
            ),
    };
});

vi.mock("../src/utils.ts", () => ({
    buildConversationThread: vi.fn().mockResolvedValue(undefined),
    sendTweet: vi.fn().mockResolvedValue([
        {
            id: "11111111-2222-3333-4444-555555555555",
            userId: "user-123",
            agentId: "agent-123",
            content: { text: "response" },
            roomId: "room-123",
        },
    ]),
    wait: vi.fn().mockResolvedValue(undefined),
}));

// Import the mocked utils directly
import { buildConversationThread, sendTweet, wait } from "../src/utils.ts";
import {
    generateText,
    generateMessageResponse,
    composeContext,
    stringToUuid,
} from "@elizaos/core";

describe("TwitterSearchClient", () => {
    let mockConfig: TwitterConfig;
    let baseClient: ClientBase;
    let searchClient: TwitterSearchClient;
    let mockTwitterClient: any;
    let mockRuntime: any;
    let mockRequestQueue: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup mocks for imported functions
        vi.mocked(generateText).mockResolvedValue("123456789");
        vi.mocked(generateMessageResponse).mockResolvedValue({
            text: "Generated response text",
            inReplyTo: undefined,
        });
        vi.mocked(composeContext).mockReturnValue("Generated context");
        vi.mocked(stringToUuid).mockImplementation(
            (str) => "11111111-2222-3333-4444-555555555555"
        );

        // Create mocks
        mockTwitterClient = buildTwitterClientMock();
        mockRuntime = buildRuntimeMock();

        // Manually setup the runtime mock methods to ensure they're functions
        mockRuntime.updateRecentMessageState = vi.fn().mockResolvedValue({
            stateKey: "updatedStateValue",
        });
        mockRuntime.evaluate = vi.fn().mockResolvedValue(undefined);
        mockRuntime.processActions = vi.fn().mockResolvedValue(undefined);
        mockRuntime.ensureConnection = vi.fn().mockResolvedValue(undefined);
        mockRuntime.messageManager = {
            createMemory: vi.fn().mockResolvedValue(undefined),
        };
        mockRuntime.cacheManager = {
            set: vi.fn().mockResolvedValue(undefined),
        };
        mockRuntime.composeState = vi.fn().mockResolvedValue({
            stateKey: "stateValue",
        });

        mockConfig = buildConfigMock();
        baseClient = new ClientBase(mockRuntime, mockConfig);

        // Setup tweet client dependencies
        baseClient.twitterClient = mockTwitterClient;
        baseClient.profile = mockTwitterProfile;

        // Setup mock runtime with character
        mockRuntime.character = mockCharacter;
        mockRuntime.agentId = "agent-123";
        mockRuntime.character.topics = new Set(["javascript"]);

        // Mock image description service
        const mockImageService = {
            describeImage: vi.fn().mockResolvedValue("Image description"),
        };
        mockRuntime.getService = vi.fn().mockImplementation((type) => {
            if (type === ServiceType.IMAGE_DESCRIPTION) {
                return mockImageService;
            }
            return null;
        });

        // Setup client request queue
        mockRequestQueue = {
            add: vi.fn((fn) => fn()),
            queue: [],
            processing: false,
            processQueue: vi.fn(),
            exponentialBackoff: vi.fn(),
            randomDelay: vi.fn(),
        };
        baseClient.requestQueue = mockRequestQueue;

        // Setup client methods
        baseClient.fetchSearchTweets = vi.fn().mockResolvedValue({
            tweets: [
                createMockTweet({
                    id: "123456789",
                    text: "Test tweet 1",
                    conversationId: "conv-123",
                    userId: "user-123",
                    username: "testuser",
                    name: "Test User",
                    permanentUrl:
                        "https://twitter.com/testuser/status/123456789",
                    timestamp: 1630000000, // Unix timestamp in seconds
                }),
                createMockTweet({ id: "987654321", text: "Test tweet 2" }),
            ],
        });
        baseClient.fetchHomeTimeline = vi
            .fn()
            .mockResolvedValue([
                createMockTweet({ id: "timeline1", text: "Timeline tweet 1" }),
            ]);
        baseClient.cacheTimeline = vi.fn().mockResolvedValue(undefined);
        baseClient.saveRequestMessage = vi.fn().mockResolvedValue(undefined);

        // Create search client instance
        searchClient = new TwitterSearchClient(baseClient, mockRuntime);

        // Override private methods to make them testable
        (searchClient as any).engageWithSearchTermsLoop = vi.fn();
    });

    it("should initialize correctly", () => {
        expect(searchClient.client).toBe(baseClient);
        expect(searchClient.runtime).toBe(mockRuntime);
        expect(searchClient.twitterUsername).toBe(mockConfig.TWITTER_USERNAME);
    });

    it("should start the search loop on start()", async () => {
        await searchClient.start();
        expect(
            (searchClient as any).engageWithSearchTermsLoop
        ).toHaveBeenCalledTimes(1);
    });

    it("should handle empty search results", async () => {
        // Setup empty search results
        baseClient.fetchSearchTweets = vi.fn().mockResolvedValue({
            tweets: [],
        });

        // We need to expose and call the private method directly for testing
        await (searchClient as any).engageWithSearchTerms();

        // Check if the specific log message was called at any point
        const wasLogMessageCalled = vi
            .mocked(elizaLogger.log)
            .mock.calls.some(
                (call) =>
                    call[0] === "No valid tweets found for the search term"
            );

        expect(wasLogMessageCalled).toBe(true);
    });

    it("should skip tweets from the bot itself", async () => {
        // Setup tweet from the bot
        vi.mocked(generateText).mockResolvedValueOnce("123456789");
        baseClient.fetchSearchTweets = vi.fn().mockResolvedValue({
            tweets: [
                createMockTweet({
                    id: "123456789",
                    text: "Bot's own tweet",
                    username: mockConfig.TWITTER_USERNAME,
                }),
            ],
        });

        await (searchClient as any).engageWithSearchTerms();

        expect(elizaLogger.log).toHaveBeenCalledWith(
            "Skipping tweet from bot itself"
        );
    });

    it("should handle when no matching tweet is found for the ID", async () => {
        // Setup non-matching tweet ID
        vi.mocked(generateText).mockResolvedValueOnce("non-existent-id");

        await (searchClient as any).engageWithSearchTerms();

        expect(elizaLogger.warn).toHaveBeenCalledWith(
            "No matching tweet found for the selected ID"
        );
    });

    it("should handle errors during the search process", async () => {
        // Force an error during processing
        baseClient.fetchSearchTweets = vi
            .fn()
            .mockRejectedValue(new Error("Network error"));

        await (searchClient as any).engageWithSearchTerms();

        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error engaging with search terms:",
            expect.any(Error)
        );
    });
});
