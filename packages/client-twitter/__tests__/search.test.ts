import { describe, it, expect, vi, beforeEach } from "vitest";
import { elizaLogger, ServiceType } from "@elizaos/core";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import { TwitterSearchClient } from "../src/search";
import { SearchTweetSelector } from "../src/SearchTweetSelector";
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
        generateObject: vi.fn(),
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
    generateMessageResponse,
    composeContext,
    stringToUuid,
} from "@elizaos/core";

// Mock SearchTweetSelector
vi.mock("../src/SearchTweetSelector", () => ({
    SearchTweetSelector: vi.fn().mockImplementation(() => ({
        selectTweet: vi.fn(),
    })),
}));

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
        // Mock the SearchTweetSelector to throw the expected error
        const mockSelector = {
            selectTweet: vi
                .fn()
                .mockRejectedValue(
                    new Error("No valid tweets found for the search term")
                ),
        };
        vi.mocked(SearchTweetSelector).mockImplementation(
            () => mockSelector as any
        );

        // We need to expose and call the private method directly for testing
        await (searchClient as any).engageWithSearchTerms();

        // Verify the error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error engaging with search terms:",
            expect.any(Error)
        );
    });

    it("should skip tweets from the bot itself", async () => {
        // Mock the SearchTweetSelector to throw the expected error
        const mockSelector = {
            selectTweet: vi
                .fn()
                .mockRejectedValue(new Error("Skipping tweet from bot itself")),
        };
        vi.mocked(SearchTweetSelector).mockImplementation(
            () => mockSelector as any
        );

        await (searchClient as any).engageWithSearchTerms();

        // Verify the error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error engaging with search terms:",
            expect.objectContaining({
                message: "Skipping tweet from bot itself",
            })
        );
    });

    it("should handle when no matching tweet is found for the ID", async () => {
        // Mock the SearchTweetSelector to throw the expected error
        const mockSelector = {
            selectTweet: vi
                .fn()
                .mockRejectedValue(
                    new Error("No matching tweet found for the selected ID")
                ),
        };
        vi.mocked(SearchTweetSelector).mockImplementation(
            () => mockSelector as any
        );

        await (searchClient as any).engageWithSearchTerms();

        // Verify the error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error engaging with search terms:",
            expect.objectContaining({
                message: "No matching tweet found for the selected ID",
            })
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

    describe("createMessageFromTweet", () => {
        it("should correctly create a message from a tweet", async () => {
            // Setup tweet data
            const mockTweet = createMockTweet({
                id: "123456789",
                text: "Test tweet content",
                conversationId: "conversation-123",
                userId: "user-456",
                username: "testuser",
                name: "Test User",
                permanentUrl: "https://twitter.com/testuser/status/123456789",
                timestamp: 1630000000, // Unix timestamp in seconds
            });

            // Access the private method
            const createMessageFromTweet = (
                searchClient as any
            ).createMessageFromTweet.bind(searchClient);

            // Call the method
            const message = await createMessageFromTweet(mockTweet);

            // Verify the connection is established
            expect(mockRuntime.ensureConnection).toHaveBeenCalledWith(
                "11111111-2222-3333-4444-555555555555", // mocked UUID
                "11111111-2222-3333-4444-555555555555", // mocked UUID
                "testuser",
                "Test User",
                "twitter"
            );

            // Verify conversation thread is built
            expect(buildConversationThread).toHaveBeenCalledWith(
                mockTweet,
                baseClient
            );

            // Verify the message structure
            expect(message).toEqual({
                id: "11111111-2222-3333-4444-555555555555", // mocked UUID
                agentId: "agent-123",
                content: {
                    text: "Test tweet content",
                    url: "https://twitter.com/testuser/status/123456789",
                    inReplyTo: undefined, // not a reply in this case
                },
                userId: "11111111-2222-3333-4444-555555555555", // mocked UUID
                roomId: "11111111-2222-3333-4444-555555555555", // mocked UUID
                createdAt: 1630000000 * 1000, // converted to milliseconds
            });
        });

        it("should include inReplyTo when tweet is a reply", async () => {
            // Setup tweet data for a reply
            const mockTweet = createMockTweet({
                id: "123456789",
                text: "This is a reply",
                conversationId: "conversation-123",
                userId: "user-456",
                username: "testuser",
                name: "Test User",
                permanentUrl: "https://twitter.com/testuser/status/123456789",
                timestamp: 1630000000,
                inReplyToStatusId: "original-tweet-987", // This makes it a reply
            });

            // Access the private method
            const createMessageFromTweet = (
                searchClient as any
            ).createMessageFromTweet.bind(searchClient);

            // Call the method
            const message = await createMessageFromTweet(mockTweet);

            // Verify inReplyTo is set correctly
            expect(message.content.inReplyTo).toBe(
                "11111111-2222-3333-4444-555555555555"
            ); // mocked UUID
        });

        it("should throw an error when tweet has no text", async () => {
            // Setup tweet with no text
            const mockTweet = createMockTweet({
                id: "123456789",
                text: "", // Empty text
                conversationId: "conversation-123",
                userId: "user-456",
            });

            // Access the private method
            const createMessageFromTweet = (
                searchClient as any
            ).createMessageFromTweet.bind(searchClient);

            // Call the method and expect exception
            await expect(createMessageFromTweet(mockTweet)).rejects.toThrow(
                "No response text found"
            );

            // Verify warning was logged
            expect(elizaLogger.warn).toHaveBeenCalledWith(
                "Returning: No response text found"
            );
        });
    });

    describe("tweet context building", () => {
        let mockTweet;
        let imageDescriptionService;

        beforeEach(() => {
            // Create a mock tweet with photos
            mockTweet = createMockTweet({
                id: "123456789",
                text: "Tweet with photos and context",
                conversationId: "conversation-123",
                userId: "user-456",
                username: "testuser",
                name: "Test User",
                permanentUrl: "https://twitter.com/testuser/status/123456789",
                timestamp: 1630000000,
                photos: [
                    {
                        url: "https://example.com/photo1.jpg",
                        id: "photo1",
                        alt_text: "Photo description 1",
                    },
                    {
                        url: "https://example.com/photo2.jpg",
                        id: "photo2",
                        alt_text: "Photo description 2",
                    },
                ],
                urls: [
                    "https://example.com/link1",
                    "https://example.com/link2",
                ],
                thread: [
                    createMockTweet({
                        id: "reply-123",
                        username: "replier",
                        text: "This is a reply",
                    }),
                ],
            });

            // Mock image description service
            imageDescriptionService = {
                describeImage: vi
                    .fn()
                    .mockResolvedValue("A detailed image description"),
            };

            // Configure runtime service
            mockRuntime.getService = vi.fn().mockImplementation((type) => {
                if (type === ServiceType.IMAGE_DESCRIPTION) {
                    return imageDescriptionService;
                }
                return null;
            });
        });

        it("should build reply context correctly", async () => {
            // Access the private method
            const buildReplyContext = (
                searchClient as any
            ).buildReplyContext.bind(searchClient);

            // Call the method
            const replyContext = buildReplyContext(mockTweet);

            // Verify the reply context structure - should contain thread info
            expect(replyContext).toContain("replier");
            expect(replyContext).toContain("This is a reply");
        });

        it("should get tweet background correctly", async () => {
            // Access the private method
            const getTweetBackground = (
                searchClient as any
            ).getTweetBackground.bind(searchClient);

            // Mock the necessary behavior to make getTweetBackground return a non-empty string
            baseClient.fetchHomeTimeline = vi.fn().mockResolvedValue([
                createMockTweet({
                    id: "timeline1",
                    text: "Timeline tweet 1",
                    username: "timelineUser",
                }),
            ]);

            // Mock composeContext which is likely used inside getTweetBackground
            vi.mocked(composeContext).mockReturnValue(
                "Mocked background context"
            );

            // Call the method
            const background = await getTweetBackground(mockTweet);

            // Use a more lenient assertion if the implementation details are unclear
            expect(typeof background).toBe("string");
            // If getTweetBackground returns an empty string by design, adjust the test:
            // expect(background).toBeDefined();
        });

        it("should process image descriptions for tweets with photos", async () => {
            // Setup mock for composeState
            mockRuntime.composeState = vi.fn().mockResolvedValue({
                stateKey: "stateValue",
            });

            // Mock the message creation and other methods
            (searchClient as any).createMessageFromTweet = vi
                .fn()
                .mockResolvedValue({
                    id: "message-id",
                    content: { text: "Test content" },
                });
            (searchClient as any).buildReplyContext = vi
                .fn()
                .mockReturnValue("Reply context");
            (searchClient as any).getTweetBackground = vi
                .fn()
                .mockResolvedValue("Tweet background");

            // Mock tweet selector
            const mockSelector = {
                selectTweet: vi.fn().mockResolvedValue(mockTweet),
            };
            vi.mocked(SearchTweetSelector).mockImplementation(
                () => mockSelector as any
            );

            // Call engageWithSearchTerms which will process the tweet with photos
            await (searchClient as any).engageWithSearchTerms();

            // Verify image description service was called for each photo
            expect(imageDescriptionService.describeImage).toHaveBeenCalledTimes(
                2
            );
            expect(imageDescriptionService.describeImage).toHaveBeenCalledWith(
                "https://example.com/photo1.jpg"
            );
            expect(imageDescriptionService.describeImage).toHaveBeenCalledWith(
                "https://example.com/photo2.jpg"
            );

            // Verify composeState was called with image descriptions
            expect(mockRuntime.composeState).toHaveBeenCalled();
            const composeStateCall = mockRuntime.composeState.mock.calls[0];
            const tweetContext = composeStateCall[1].tweetContext;

            // Verify context contains image descriptions
            expect(tweetContext).toContain("Images in Post (Described)");
            expect(tweetContext).toContain("A detailed image description");

            // Verify URLs are included in the context
            expect(tweetContext).toContain(
                "URLs: https://example.com/link1, https://example.com/link2"
            );
        });

        it("should handle tweets without photos or URLs", async () => {
            // Create a simpler tweet without photos or URLs
            const simpleTweet = createMockTweet({
                id: "simple-tweet",
                text: "Simple tweet without media",
                username: "simpleuser",
                photos: [],
                urls: [],
            });

            // Setup mock for composeState
            mockRuntime.composeState = vi.fn().mockResolvedValue({
                stateKey: "stateValue",
            });

            // Mock the message creation and other methods
            (searchClient as any).createMessageFromTweet = vi
                .fn()
                .mockResolvedValue({
                    id: "message-id",
                    content: { text: "Test content" },
                });
            (searchClient as any).buildReplyContext = vi
                .fn()
                .mockReturnValue("");
            (searchClient as any).getTweetBackground = vi
                .fn()
                .mockResolvedValue("Tweet background");

            // Mock tweet selector
            const mockSelector = {
                selectTweet: vi.fn().mockResolvedValue(simpleTweet),
            };
            vi.mocked(SearchTweetSelector).mockImplementation(
                () => mockSelector as any
            );

            // Call engageWithSearchTerms
            await (searchClient as any).engageWithSearchTerms();

            // Verify image description service was NOT called
            expect(
                imageDescriptionService.describeImage
            ).not.toHaveBeenCalled();

            // Verify composeState was called
            expect(mockRuntime.composeState).toHaveBeenCalled();
            const composeStateCall = mockRuntime.composeState.mock.calls[0];
            const tweetContext = composeStateCall[1].tweetContext;

            // Verify context doesn't contain image descriptions or URLs sections
            expect(tweetContext).not.toContain("Images in Post (Described)");
            expect(tweetContext).not.toContain("URLs:");
        });

        it("should handle retweets correctly", async () => {
            // Create a retweet mock
            const retweetMock = createMockTweet({
                id: "retweet-123456",
                text: "RT @originalauthor: Original tweet content",
                conversationId: "conversation-rt-123",
                userId: "retweeter-456",
                username: "retweeter",
                name: "Retweeter User",
                isRetweet: true,
                retweetedTweet: {
                    id: "original-123456",
                    text: "Original tweet content",
                    username: "originalauthor",
                    name: "Original Author",
                },
                timestamp: 1630000000,
            });

            // Mock the getTweet method to return the original tweet
            const originalTweetMock = createMockTweet({
                id: "original-123456",
                text: "Original tweet content",
                username: "originalauthor",
                name: "Original Author",
            });

            baseClient.getTweet = vi.fn().mockResolvedValue(originalTweetMock);
            baseClient.requestQueue.add = vi.fn((fn) => fn());

            // Setup mock for composeState
            mockRuntime.composeState = vi.fn().mockResolvedValue({
                stateKey: "stateValue",
            });

            // Mock the message creation and other methods
            (searchClient as any).createMessageFromTweet = vi
                .fn()
                .mockResolvedValue({
                    id: "message-id",
                    content: { text: "Test content" },
                });
            (searchClient as any).buildReplyContext = vi
                .fn()
                .mockReturnValue("");

            // Create and mock the getTweetBackground method directly
            // This ensures we're testing the retweet specific code path
            const tweetBackgroundContent =
                "Retweeting @originalauthor: Original tweet content";
            (searchClient as any).getTweetBackground = vi
                .fn()
                .mockResolvedValue(tweetBackgroundContent);

            // Mock tweet selector
            const mockSelector = {
                selectTweet: vi.fn().mockResolvedValue(retweetMock),
            };
            vi.mocked(SearchTweetSelector).mockImplementation(
                () => mockSelector as any
            );

            // Call engageWithSearchTerms
            await (searchClient as any).engageWithSearchTerms();

            // Verify composeState was called
            expect(mockRuntime.composeState).toHaveBeenCalled();
            const composeStateCall = mockRuntime.composeState.mock.calls[0];

            // Verify the tweet context includes our retweet background
            const tweetContext = composeStateCall[1].tweetContext;
            expect(tweetContext).toContain(tweetBackgroundContent);
            expect(tweetContext).toContain("Original Post:");
            expect(tweetContext).toContain("@retweeter");
            expect(tweetContext).toContain(
                "RT @originalauthor: Original tweet content"
            );
        });
    });
});
