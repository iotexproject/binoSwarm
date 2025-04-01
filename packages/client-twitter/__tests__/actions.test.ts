import { TwitterActionProcessor } from "./../src/actions";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    IAgentRuntime,
    elizaLogger,
    UUID,
    ServiceType,
    IImageDescriptionService,
    stringToUuid,
} from "@elizaos/core";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import * as utils from "../src/utils";
import {
    buildTwitterClientMock,
    buildConfigMock,
    buildRuntimeMock,
    createSuccessfulTweetResponse,
    mockTwitterProfile,
    mockCharacter,
    createMockTweet,
    createMockTimeline,
    createMockState,
} from "./mocks";

// Mock modules at the top level
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
        generateText: vi.fn(),
        composeContext: vi.fn().mockReturnValue("mocked context"),
        generateMessageResponse: vi.fn(),
    };
});

vi.mock("../src/utils", async () => {
    const actual = await vi.importActual("../src/utils");
    return {
        ...actual,
        buildConversationThread: vi.fn(),
    };
});

const photoSample = {
    id: "photo-123",
    url: "https://example.com/image.jpg",
    alt_text: "Test image alt text",
};

describe("TwitterActionProcessor Start Method", () => {
    let mockRuntime: IAgentRuntime;
    let baseClient: ClientBase;
    let mockConfig: TwitterConfig;
    let mockTwitterClient: any;
    let actionClient: TwitterActionProcessor;

    beforeEach(() => {
        vi.clearAllMocks();

        mockTwitterClient = buildTwitterClientMock();
        mockRuntime = buildRuntimeMock();
        mockConfig = buildConfigMock();
        baseClient = new ClientBase(mockRuntime, mockConfig);

        baseClient.twitterClient = mockTwitterClient;
        baseClient.profile = null; // Set to null to test initialization

        // Setup mock runtime with character
        mockRuntime.character = mockCharacter;

        actionClient = new TwitterActionProcessor(baseClient, mockRuntime);

        // Mock processActionsLoop
        vi.spyOn(actionClient as any, "processActionsLoop").mockImplementation(
            () => {}
        );

        // Mock client.init
        vi.spyOn(baseClient, "init").mockImplementation(async () => {
            baseClient.profile = mockTwitterProfile;
        });
    });

    it("should not start action processing when disabled in config", async () => {
        // Set ENABLE_ACTION_PROCESSING to false
        baseClient.twitterConfig.ENABLE_ACTION_PROCESSING = false;

        await actionClient.start();

        // Verify processActionsLoop was not called
        expect(actionClient["processActionsLoop"]).not.toHaveBeenCalled();

        // Verify client.init was not called
        expect(baseClient.init).not.toHaveBeenCalled();
    });

    it("should initialize client when profile is null", async () => {
        // Set ENABLE_ACTION_PROCESSING to true
        baseClient.twitterConfig.ENABLE_ACTION_PROCESSING = true;
        baseClient.profile = null;

        await actionClient.start();

        // Verify client.init was called
        expect(baseClient.init).toHaveBeenCalled();

        // Verify processActionsLoop was called
        expect(actionClient["processActionsLoop"]).toHaveBeenCalled();
    });

    it("should not initialize client when profile already exists", async () => {
        // Set ENABLE_ACTION_PROCESSING to true
        baseClient.twitterConfig.ENABLE_ACTION_PROCESSING = true;
        baseClient.profile = mockTwitterProfile;

        await actionClient.start();

        // Verify client.init was not called
        expect(baseClient.init).not.toHaveBeenCalled();

        // Verify processActionsLoop was called
        expect(actionClient["processActionsLoop"]).toHaveBeenCalled();
    });
});

describe("TwitterActionProcessor Stop Method", () => {
    let mockRuntime: IAgentRuntime;
    let baseClient: ClientBase;
    let mockConfig: TwitterConfig;
    let actionClient: TwitterActionProcessor;

    beforeEach(() => {
        vi.clearAllMocks();

        mockRuntime = buildRuntimeMock();
        mockConfig = buildConfigMock();
        baseClient = new ClientBase(mockRuntime, mockConfig);

        // Setup mock runtime with character
        mockRuntime.character = mockCharacter;

        actionClient = new TwitterActionProcessor(baseClient, mockRuntime);

        // Ensure stopProcessingActions is false initially
        actionClient["stopProcessingActions"] = false;
    });

    it("should set the stop flag to true", async () => {
        // Verify stopProcessingActions is false initially
        expect(actionClient["stopProcessingActions"]).toBe(false);

        // Call stop method
        await actionClient.stop();

        // Verify stopProcessingActions is now true
        expect(actionClient["stopProcessingActions"]).toBe(true);
    });
});

describe("Tweet Actions Processing", () => {
    let mockRuntime: IAgentRuntime;
    let baseClient: ClientBase;
    let mockConfig: TwitterConfig;
    let mockTwitterClient: any;
    let actionClient: TwitterActionProcessor;
    let mockImageDescriptionService: IImageDescriptionService;

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

        actionClient = new TwitterActionProcessor(baseClient, mockRuntime);

        mockTwitterClient.likeTweet.mockClear();
        mockTwitterClient.sendQuoteTweet.mockClear();

        // Mock image description service with all required properties
        mockImageDescriptionService = {
            serviceType: ServiceType.IMAGE_DESCRIPTION,
            initialize: vi.fn(),
            describeImage: vi
                .fn()
                .mockResolvedValue("A test image description"),
        };

        // Add getService to mockRuntime
        mockRuntime.getService = vi
            .fn()
            .mockImplementation((service: ServiceType) => {
                if (service === ServiceType.IMAGE_DESCRIPTION) {
                    return mockImageDescriptionService;
                }
                return null;
            });

        // Mock generateTweetContent
        vi.spyOn(actionClient as any, "generateTweetContent").mockResolvedValue(
            "This is a generated quote tweet response"
        );

        // Mock buildConversationThread to return a simple thread
        vi.mocked(utils.buildConversationThread).mockResolvedValue([
            {
                id: "123",
                name: "Test User",
                username: "testuser",
                text: "Original tweet with image",
                conversationId: "123",
                timestamp: Date.now() / 1000,
                userId: "123",
                permanentUrl: "https://twitter.com/testuser/status/123",
                hashtags: [],
                mentions: [],
                photos: [photoSample],
                thread: [],
                urls: [],
                videos: [],
            },
        ]);
    });

    it("should process like action", async () => {
        const timeline = createMockTimeline({
            actionResponse: { like: true },
        });

        vi.mocked(mockRuntime.messageManager.getMemoryById).mockResolvedValue(
            null
        );
        vi.mocked(mockRuntime.composeState).mockResolvedValue(
            timeline.tweetState
        );

        await actionClient["processTimelineActions"]([timeline]);

        expect(mockTwitterClient.likeTweet).toHaveBeenCalledWith(
            timeline.tweet.id
        );
        expect(mockRuntime.messageManager.createMemory).toHaveBeenCalled();
    });

    it("should process quote action with images", async () => {
        const mockTweet = createMockTweet({
            text: "Original tweet with image",
            photos: [photoSample],
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { quote: true },
        });

        mockTwitterClient.sendQuoteTweet.mockResolvedValue(
            createSuccessfulTweetResponse("Quote tweet content", "456")
        );

        // Mock the composeState to return enriched state
        vi.mocked(mockRuntime.composeState)
            .mockResolvedValueOnce(timeline.tweetState)
            .mockResolvedValueOnce({
                ...timeline.tweetState,
                currentPost: `From @${mockTweet.username}: ${mockTweet.text}`,
                formattedConversation:
                    "@testuser (now): Original tweet with image",
                imageContext: "Image 1: A test image description",
                quotedContent: "",
            });

        await actionClient["processTimelineActions"]([timeline]);

        expect(utils.buildConversationThread).toHaveBeenCalledWith(
            mockTweet,
            baseClient
        );

        expect(mockImageDescriptionService.describeImage).toHaveBeenCalledWith(
            "https://example.com/image.jpg"
        );

        expect(actionClient["generateTweetContent"]).toHaveBeenCalled();

        expect(mockTwitterClient.sendQuoteTweet).toHaveBeenCalledWith(
            "This is a generated quote tweet response",
            mockTweet.id
        );

        expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
            expect.stringContaining("twitter/quote_generation_123.txt"),
            expect.any(String)
        );
        expect(elizaLogger.log).toHaveBeenCalledWith(
            "Successfully posted quote tweet"
        );
    });

    it("should handle errors in action processing gracefully", async () => {
        const timeline = createMockTimeline({
            actionResponse: { like: true },
        });

        mockTwitterClient.likeTweet.mockRejectedValue(new Error("API Error"));

        await actionClient["processTimelineActions"]([timeline]);

        expect(elizaLogger.error).toHaveBeenCalled();
    });

    it("should handle errors in quote tweet processing", async () => {
        const timeline = createMockTimeline({
            actionResponse: { quote: true },
        });

        mockTwitterClient.sendQuoteTweet.mockRejectedValue(
            new Error("Quote tweet failed")
        );

        vi.mocked(mockRuntime.composeState).mockResolvedValue({
            ...timeline.tweetState,
            currentPost: `From @${timeline.tweet.username}: ${timeline.tweet.text}`,
            formattedConversation: "",
            imageContext: "",
            quotedContent: "",
        });

        await actionClient["processTimelineActions"]([timeline]);

        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error in quote tweet generation:",
            expect.any(Error)
        );
    });

    it("should handle errors in quote processing after quote tweet creation", async () => {
        const timeline = createMockTimeline({
            actionResponse: { quote: true },
        });

        mockTwitterClient.sendQuoteTweet.mockResolvedValue({
            json: () => ({
                data: {}, // Missing create_tweet field
            }),
        });

        vi.mocked(mockRuntime.composeState).mockResolvedValue({
            ...timeline.tweetState,
            currentPost: `From @${timeline.tweet.username}: ${timeline.tweet.text}`,
            formattedConversation: "",
            imageContext: "",
            quotedContent: "",
        });

        await actionClient["processTimelineActions"]([timeline]);

        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Quote tweet creation failed:",
            expect.any(Object)
        );
    });

    it("should process reply action successfully", async () => {
        const mockTweet = createMockTweet({
            text: "Original tweet to reply to",
            photos: [photoSample],
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { reply: true },
        });

        // Mock successful reply tweet response
        mockTwitterClient.sendTweet.mockResolvedValue(
            createSuccessfulTweetResponse("Reply tweet content", "456")
        );

        // Mock the composeState to return enriched state
        vi.mocked(mockRuntime.composeState)
            .mockResolvedValueOnce(timeline.tweetState)
            .mockResolvedValueOnce({
                ...timeline.tweetState,
                currentPost: `From @${mockTweet.username}: ${mockTweet.text}`,
                formattedConversation:
                    "@testuser (now): Original tweet to reply to",
                imageContext: "Image 1: A test image description",
                quotedContent: "",
            });

        await actionClient["processTimelineActions"]([timeline]);

        // Verify buildConversationThread was called
        expect(utils.buildConversationThread).toHaveBeenCalledWith(
            mockTweet,
            baseClient
        );

        // Verify image description service was called
        expect(mockImageDescriptionService.describeImage).toHaveBeenCalledWith(
            "https://example.com/image.jpg"
        );

        // Verify generateTweetContent was called
        expect(actionClient["generateTweetContent"]).toHaveBeenCalled();

        // Verify tweet was sent with the generated content and in reply to the original tweet
        expect(mockTwitterClient.sendTweet).toHaveBeenCalledWith(
            "This is a generated quote tweet response",
            mockTweet.id
        );

        expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
            expect.stringContaining("twitter/reply_generation_123.txt"),
            expect.any(String)
        );
    });

    it("should handle errors in reply processing", async () => {
        const timeline = createMockTimeline({
            actionResponse: { reply: true },
        });

        // Mock processReply to throw an error only for this test
        vi.spyOn(actionClient as any, "processReply").mockRejectedValueOnce(
            new Error(`Error replying to tweet ${timeline.tweet.id}`)
        );

        vi.mocked(mockRuntime.composeState).mockResolvedValue({
            ...timeline.tweetState,
            currentPost: `From @${timeline.tweet.username}: ${timeline.tweet.text}`,
            formattedConversation: "",
            imageContext: "",
            quotedContent: "",
        });

        await actionClient["processTimelineActions"]([timeline]);

        expect(elizaLogger.error).toHaveBeenCalledWith(
            `Error processing tweet ${timeline.tweet.id}:`,
            new Error(`Error replying to tweet ${timeline.tweet.id}`)
        );
    });

    it("should handle long replies using note tweet", async () => {
        const mockTweet = createMockTweet({
            text: "Original tweet to reply to",
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { reply: true },
        });

        // Mock generateTweetContent to return a long response
        vi.spyOn(actionClient as any, "generateTweetContent").mockResolvedValue(
            "A very long reply that exceeds the standard tweet length...".repeat(
                10
            )
        );

        // Mock successful note tweet response
        mockTwitterClient.sendNoteTweet.mockResolvedValue({
            data: {
                notetweet_create: {
                    tweet_results: {
                        result: {
                            rest_id: "456",
                            legacy: {
                                full_text: "Long reply content",
                                created_at: new Date().toISOString(),
                                conversation_id_str: "456",
                            },
                        },
                    },
                },
            },
        });

        vi.mocked(mockRuntime.composeState).mockResolvedValue({
            ...timeline.tweetState,
            currentPost: `From @${timeline.tweet.username}: ${timeline.tweet.text}`,
            formattedConversation:
                "@testuser (now): Original tweet to reply to",
            imageContext: "",
            quotedContent: "",
        });

        await actionClient["processTimelineActions"]([timeline]);

        // Verify note tweet was used for the long reply
        expect(mockTwitterClient.sendNoteTweet).toHaveBeenCalledWith(
            expect.stringContaining("A very long reply"),
            mockTweet.id
        );
    });

    it("should handle undefined reply content gracefully", async () => {
        const mockTweet = createMockTweet({
            text: "Original tweet to reply to",
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { reply: true },
        });

        // Mock generateTweetContent to return undefined/null
        vi.spyOn(actionClient as any, "generateTweetContent").mockResolvedValue(
            undefined
        );

        vi.mocked(mockRuntime.composeState).mockResolvedValue({
            ...timeline.tweetState,
            currentPost: `From @${mockTweet.username}: ${mockTweet.text}`,
            formattedConversation:
                "@testuser (now): Original tweet to reply to",
            imageContext: "",
            quotedContent: "",
        });

        await actionClient["processTimelineActions"]([timeline]);

        // Verify error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Failed to generate valid tweet content"
        );

        // Verify no tweet was sent
        expect(mockTwitterClient.sendTweet).not.toHaveBeenCalled();
        expect(mockTwitterClient.sendNoteTweet).not.toHaveBeenCalled();
    });

    it("should process reply with quoted tweet content", async () => {
        const quotedTweet = createMockTweet({
            id: "456",
            text: "I am a quoted tweet",
            username: "quoteduser",
        });

        const mockTweet = createMockTweet({
            text: "Original tweet with quote",
            quotedStatusId: quotedTweet.id,
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { reply: true },
        });

        // Mock getTweet to return the quoted tweet
        mockTwitterClient.getTweet.mockResolvedValue(quotedTweet);

        // Mock successful reply tweet response
        mockTwitterClient.sendTweet.mockResolvedValue(
            createSuccessfulTweetResponse("Reply tweet content", "456")
        );

        // Mock the composeState to return enriched state
        vi.mocked(mockRuntime.composeState)
            .mockResolvedValueOnce(timeline.tweetState)
            .mockResolvedValueOnce({
                ...timeline.tweetState,
                currentPost: `From @${mockTweet.username}: ${mockTweet.text}`,
                formattedConversation:
                    "@testuser (now): Original tweet with quote",
                imageContext: "",
                quotedContent: `\nQuoted Tweet from @${quotedTweet.username}:\n${quotedTweet.text}`,
            });

        await actionClient["processTimelineActions"]([timeline]);

        // Verify quoted tweet was fetched
        expect(mockTwitterClient.getTweet).toHaveBeenCalledWith(quotedTweet.id);

        // Verify tweet was sent with the generated content
        expect(mockTwitterClient.sendTweet).toHaveBeenCalledWith(
            "This is a generated quote tweet response",
            mockTweet.id
        );
    });

    it("should handle error when fetching quoted tweet", async () => {
        const mockTweet = createMockTweet({
            text: "Original tweet with quote",
            quotedStatusId: "456",
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { reply: true },
        });

        // Mock getTweet to throw an error
        mockTwitterClient.getTweet.mockRejectedValue(
            new Error("Failed to fetch quoted tweet")
        );

        // Mock successful reply tweet response
        mockTwitterClient.sendTweet.mockResolvedValue(
            createSuccessfulTweetResponse("Reply tweet content", "456")
        );

        // Mock the composeState to return enriched state
        vi.mocked(mockRuntime.composeState)
            .mockResolvedValueOnce(timeline.tweetState)
            .mockResolvedValueOnce({
                ...timeline.tweetState,
                currentPost: `From @${mockTweet.username}: ${mockTweet.text}`,
                formattedConversation:
                    "@testuser (now): Original tweet with quote",
                imageContext: "",
                quotedContent: "", // Should be empty due to error
            });

        await actionClient["processTimelineActions"]([timeline]);

        // Verify error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error fetching quoted tweet:",
            expect.any(Error)
        );

        // Verify tweet was still sent despite quoted tweet error
        expect(mockTwitterClient.sendTweet).toHaveBeenCalledWith(
            "This is a generated quote tweet response",
            mockTweet.id
        );
    });

    it("should handle errors in timeline processing gracefully", async () => {
        const timeline = createMockTimeline({
            actionResponse: { like: true },
        });

        // Mock ensureRoomExists to throw an error
        vi.mocked(mockRuntime.ensureRoomExists).mockRejectedValue(
            new Error("Failed to create room")
        );

        await actionClient["processTimelineActions"]([timeline]);

        // Verify error was logged with the tweet ID
        expect(elizaLogger.error).toHaveBeenCalledWith(
            `Error processing tweet ${timeline.tweet.id}:`,
            expect.any(Error)
        );

        // Verify room creation was attempted
        expect(mockRuntime.ensureRoomExists).toHaveBeenCalledWith(
            timeline.roomId
        );
    });

    it("should handle undefined quote content gracefully", async () => {
        const mockTweet = createMockTweet({
            text: "Original tweet to quote",
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { quote: true },
        });

        // Mock generateTweetContent to return undefined/null
        vi.spyOn(actionClient as any, "generateTweetContent").mockResolvedValue(
            undefined
        );

        vi.mocked(mockRuntime.composeState).mockResolvedValue({
            ...timeline.tweetState,
            currentPost: `From @${mockTweet.username}: ${mockTweet.text}`,
            formattedConversation: "@testuser (now): Original tweet to quote",
            imageContext: "",
            quotedContent: "",
        });

        await actionClient["processTimelineActions"]([timeline]);

        // Verify error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Failed to generate valid tweet content"
        );

        // Verify no quote tweet was sent
        expect(mockTwitterClient.sendQuoteTweet).not.toHaveBeenCalled();
    });

    it("should process quote with quoted tweet content", async () => {
        const quotedTweet = createMockTweet({
            id: "456",
            text: "I am a quoted tweet",
            username: "quoteduser",
        });

        const mockTweet = createMockTweet({
            text: "Original tweet with quote",
            quotedStatusId: quotedTweet.id,
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { quote: true },
        });

        // Mock getTweet to return the quoted tweet
        mockTwitterClient.getTweet.mockResolvedValue(quotedTweet);

        // Mock successful quote tweet response
        mockTwitterClient.sendQuoteTweet.mockResolvedValue(
            createSuccessfulTweetResponse("Quote tweet content", "456")
        );

        // Mock the composeState to return enriched state
        vi.mocked(mockRuntime.composeState)
            .mockResolvedValueOnce(timeline.tweetState)
            .mockResolvedValueOnce({
                ...timeline.tweetState,
                currentPost: `From @${mockTweet.username}: ${mockTweet.text}`,
                formattedConversation:
                    "@testuser (now): Original tweet with quote",
                imageContext: "",
                quotedContent: `\nQuoted Tweet from @${quotedTweet.username}:\n${quotedTweet.text}`,
            });

        await actionClient["processTimelineActions"]([timeline]);

        // Verify quoted tweet was fetched
        expect(mockTwitterClient.getTweet).toHaveBeenCalledWith(quotedTweet.id);

        // Verify quote tweet was sent with the generated content
        expect(mockTwitterClient.sendQuoteTweet).toHaveBeenCalledWith(
            "This is a generated quote tweet response",
            mockTweet.id
        );
    });

    it("should handle error when fetching quoted tweet for quote action", async () => {
        const mockTweet = createMockTweet({
            text: "Original tweet with quote",
            quotedStatusId: "456",
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { quote: true },
        });

        // Mock getTweet to throw an error
        mockTwitterClient.getTweet.mockRejectedValue(
            new Error("Failed to fetch quoted tweet")
        );

        // Mock successful quote tweet response
        mockTwitterClient.sendQuoteTweet.mockResolvedValue(
            createSuccessfulTweetResponse("Quote tweet content", "456")
        );

        // Mock the composeState to return enriched state
        vi.mocked(mockRuntime.composeState)
            .mockResolvedValueOnce(timeline.tweetState)
            .mockResolvedValueOnce({
                ...timeline.tweetState,
                currentPost: `From @${mockTweet.username}: ${mockTweet.text}`,
                formattedConversation:
                    "@testuser (now): Original tweet with quote",
                imageContext: "",
                quotedContent: "", // Should be empty due to error
            });

        await actionClient["processTimelineActions"]([timeline]);

        // Verify error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error fetching quoted tweet:",
            expect.any(Error)
        );

        // Verify quote tweet was still sent despite quoted tweet error
        expect(mockTwitterClient.sendQuoteTweet).toHaveBeenCalledWith(
            "This is a generated quote tweet response",
            mockTweet.id
        );
    });

    it("should handle successful retweet", async () => {
        const mockTweet = createMockTweet({
            text: "Original tweet to retweet",
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { retweet: true },
        });

        // Mock successful retweet
        mockTwitterClient.retweet.mockResolvedValue(undefined);

        await actionClient["processTimelineActions"]([timeline]);

        // Verify retweet was called
        expect(mockTwitterClient.retweet).toHaveBeenCalledWith(mockTweet.id);

        // Verify success was logged
        expect(elizaLogger.log).toHaveBeenCalledWith(
            `Retweeted tweet ${mockTweet.id}`
        );

        // Verify action was recorded
        expect(timeline.actionResponse.retweet).toBe(true);
    });

    it("should handle retweet error", async () => {
        const mockTweet = createMockTweet({
            text: "Original tweet to retweet",
        });

        const timeline = createMockTimeline({
            tweet: mockTweet,
            actionResponse: { retweet: true },
        });

        // Mock retweet to throw error
        mockTwitterClient.retweet.mockRejectedValue(
            new Error("Retweet failed")
        );

        await actionClient["processTimelineActions"]([timeline]);

        // Verify retweet was attempted
        expect(mockTwitterClient.retweet).toHaveBeenCalledWith(mockTweet.id);

        // Verify error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            `Error retweeting tweet ${mockTweet.id}:`,
            expect.any(Error)
        );
    });

    it("should skip already processed tweets", async () => {
        const mockTweet = createMockTweet();
        const roomId = stringToUuid(mockTweet.id + "-" + mockRuntime.agentId);

        // Mock fetchHomeTimeline to return raw tweet format
        mockTwitterClient.fetchHomeTimeline.mockResolvedValue([
            {
                rest_id: mockTweet.id,
                core: {
                    user_results: {
                        result: {
                            legacy: {
                                name: mockTweet.name,
                                screen_name: mockTweet.username + "2",
                            },
                        },
                    },
                },
            },
        ]);

        // Mock getMemoryById to return existing memory
        vi.mocked(mockRuntime.messageManager.getMemoryById).mockResolvedValue({
            id: stringToUuid(mockTweet.id + "-" + mockRuntime.agentId),
            content: { text: "existing memory" },
            userId: mockRuntime.agentId,
            agentId: mockRuntime.agentId,
            roomId,
        });

        await actionClient["processTweetActions"]();

        expect(elizaLogger.log).toHaveBeenCalledWith(
            `Already processed tweet ID: ${mockTweet.id}`
        );
        expect(elizaLogger.log).toHaveBeenLastCalledWith(`Processed 0 tweets`);

        // Verify no further processing occurred
        expect(mockRuntime.composeState).not.toHaveBeenCalled();
    });

    it("should handle error in tweet processing", async () => {
        const mockTweet = createMockTweet();

        // Mock fetchHomeTimeline to return raw tweet format
        mockTwitterClient.fetchHomeTimeline.mockResolvedValue([
            {
                rest_id: mockTweet.id,
                core: {
                    user_results: {
                        result: {
                            legacy: {
                                name: mockTweet.name,
                                screen_name: mockTweet.username + "2",
                            },
                        },
                    },
                },
            },
        ]);

        // Clear all mocks after initialization
        vi.clearAllMocks();

        // Mock getMemoryById to throw an error
        vi.mocked(mockRuntime.messageManager.getMemoryById).mockRejectedValue(
            new Error("Failed to check tweet memory")
        );

        // Call processTweetActions
        await actionClient["processTweetActions"]();

        // Verify error was logged with the tweet ID
        expect(elizaLogger.error).toHaveBeenCalledWith(
            `Error processing tweet ${mockTweet.id}:`,
            expect.any(Error)
        );

        // Verify processing continued (didn't throw)
        expect(mockRuntime.composeState).not.toHaveBeenCalled();
    });

    it("should handle error in processTweetActions", async () => {
        vi.clearAllMocks();

        await expect(actionClient["processTweetActions"]()).rejects.toThrow(
            "Cannot read properties of undefined (reading 'map')"
        );
        // Verify error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error in processTweetActions:",
            new TypeError("Cannot read properties of undefined (reading 'map')")
        );
    });

    it("should keep tweets under max length when already valid", () => {
        const validTweet = "This is a valid tweet";
        const result = actionClient["trimTweetLength"](validTweet);
        expect(result).toBe(validTweet);
        expect(result.length).toBeLessThanOrEqual(280);
    });

    it("should cut long tweets at last sentence when possible", () => {
        const longTweet =
            "Exploring the endless possibilities of Web3! From decentralized apps to smart contracts, the future is being built on blockchain. Exciting to see how AI, NFTs, and DAOs are shaping the next internet era. Let's continue pushing boundaries and innovating! 🚀 #Web3 #Blockchain #Innovation";
        const result = actionClient["trimTweetLength"](longTweet);
        expect(result).toBe(
            "Exploring the endless possibilities of Web3! From decentralized apps to smart contracts, the future is being built on blockchain. Exciting to see how AI, NFTs, and DAOs are shaping the next internet era."
        );
    });

    it("should add ellipsis when cutting within a sentence", () => {
        const longSentence =
            "Diving deeper into the potential of AI agents and decentralized systems looking forward to seeing how automation and smart contracts can transform industries from finance to healthcare the future is decentralized and intelligent and we're just getting started #AI #Web3 #Blockchain #Innovation";
        const result = actionClient["trimTweetLength"](longSentence);
        expect(result).toBe(
            "Diving deeper into the potential of AI agents and decentralized systems looking forward to seeing how automation and smart contracts can transform industries from finance to healthcare the future is decentralized and intelligent and we're just getting started #AI #Web3..."
        );
    });

    describe("Timeline Sorting", () => {
        it("should sort timelines by number of true actions", async () => {
            const mockTimelines = [
                {
                    tweet: createMockTweet(),
                    actionResponse: {
                        like: false,
                        retweet: false,
                        quote: false,
                        reply: false,
                    },
                    tweetState: createMockState(),
                    roomId: "room1" as UUID,
                },
                {
                    tweet: createMockTweet(),
                    actionResponse: {
                        like: true,
                        retweet: true,
                        quote: false,
                        reply: false,
                    },
                    tweetState: createMockState(),
                    roomId: "room2" as UUID,
                },
                {
                    tweet: createMockTweet(),
                    actionResponse: {
                        like: true,
                        retweet: true,
                        quote: true,
                        reply: true,
                    },
                    tweetState: createMockState(),
                    roomId: "room3" as UUID,
                },
            ];

            const sorted = actionClient["sortProcessedTimeline"](mockTimelines);

            expect(sorted[0].actionResponse).toEqual({
                like: true,
                retweet: true,
                quote: true,
                reply: true,
            });
        });

        it("should prioritize likes when true count is equal", async () => {
            const mockTimelines = [
                {
                    tweet: createMockTweet(),
                    actionResponse: {
                        like: false,
                        retweet: true,
                        quote: false,
                        reply: false,
                    },
                    tweetState: createMockState(),
                    roomId: "room1" as UUID,
                },
                {
                    tweet: createMockTweet(),
                    actionResponse: {
                        like: true,
                        retweet: false,
                        quote: false,
                        reply: false,
                    },
                    tweetState: createMockState(),
                    roomId: "room2" as UUID,
                },
            ];

            const sorted = actionClient["sortProcessedTimeline"](mockTimelines);

            // Should prioritize the one with like=true even though both have one true value
            expect(sorted[0].actionResponse).toEqual({
                like: true,
                retweet: false,
                quote: false,
                reply: false,
            });
            expect(sorted[1].actionResponse).toEqual({
                like: false,
                retweet: true,
                quote: false,
                reply: false,
            });
        });

        it("should maintain order for equal weights and likes", async () => {
            const mockTimelines = [
                {
                    tweet: createMockTweet(),
                    actionResponse: {
                        like: true,
                        retweet: false,
                        quote: false,
                        reply: false,
                    },
                    tweetState: createMockState(),
                    roomId: "room1" as UUID,
                },
                {
                    tweet: createMockTweet(),
                    actionResponse: {
                        like: true,
                        retweet: false,
                        quote: false,
                        reply: false,
                    },
                    tweetState: createMockState(),
                    roomId: "room2" as UUID,
                },
            ];

            const sorted = actionClient["sortProcessedTimeline"](mockTimelines);

            // Should maintain original order when weights and likes are equal
            expect(sorted[0].roomId).toBe("room1");
            expect(sorted[1].roomId).toBe("room2");
        });
    });
});

describe("TwitterActionProcessor ProcessActionsLoop Method", () => {
    let mockRuntime: IAgentRuntime;
    let baseClient: ClientBase;
    let mockConfig: TwitterConfig;
    let actionClient: TwitterActionProcessor;
    let originalSetInterval: typeof setInterval;
    let originalClearInterval: typeof clearInterval;

    beforeEach(() => {
        vi.clearAllMocks();

        originalSetInterval = global.setInterval;
        originalClearInterval = global.clearInterval;

        let intervalId = 123;
        global.setInterval = vi.fn().mockImplementation((fn, ms) => {
            setTimeout(() => {
                if (typeof fn === "function") {
                    fn();
                } else {
                    eval(fn);
                }
            }, 0);
            return intervalId;
        }) as unknown as typeof setInterval;
        global.clearInterval = vi.fn();

        mockRuntime = buildRuntimeMock();
        mockConfig = buildConfigMock();
        baseClient = new ClientBase(mockRuntime, mockConfig);

        mockRuntime.character = mockCharacter;

        baseClient.twitterConfig.ACTION_INTERVAL = 5; // 5 minutes

        actionClient = new TwitterActionProcessor(baseClient, mockRuntime);

        vi.spyOn(actionClient as any, "processTweetActions").mockResolvedValue(
            undefined
        );
    });

    afterEach(() => {
        global.setInterval = originalSetInterval;
        global.clearInterval = originalClearInterval;
    });

    it("should set up interval that calls processTweetActions", async () => {
        actionClient["processActionsLoop"]();

        const expectedIntervalMs =
            baseClient.twitterConfig.ACTION_INTERVAL * 60 * 1000;
        expect(global.setInterval).toHaveBeenCalledWith(
            expect.any(Function),
            expectedIntervalMs
        );

        await vi.waitFor(() => {
            expect(actionClient["processTweetActions"]).toHaveBeenCalled();
        });

        expect(elizaLogger.log).toHaveBeenCalledWith(
            `Next action processing scheduled in ${baseClient.twitterConfig.ACTION_INTERVAL} minutes`
        );
    });

    it("should not process if isProcessing flag is true", async () => {
        actionClient["isProcessing"] = true;

        actionClient["processActionsLoop"]();

        await vi.waitFor(() => {
            expect(elizaLogger.error).toHaveBeenCalled();
        });

        expect(actionClient["processTweetActions"]).not.toHaveBeenCalled();

        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error in action processing loop:",
            expect.objectContaining({
                message: "Already processing tweet actions, skipping",
            })
        );
    });

    it("should handle errors in processTweetActions", async () => {
        const testError = new Error("Processing failed");
        vi.spyOn(actionClient as any, "processTweetActions").mockRejectedValue(
            testError
        );

        actionClient["processActionsLoop"]();

        await vi.waitFor(() => {
            expect(elizaLogger.error).toHaveBeenCalled();
        });

        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error in action processing loop:",
            testError
        );
    });

    it("should clear interval when stop is called", async () => {
        actionClient["processActionsLoop"]();
        const intervalId = actionClient["processingInterval"];
        expect(intervalId).not.toBeNull();

        await actionClient.stop();

        expect(global.clearInterval).toHaveBeenCalledWith(intervalId);

        expect(actionClient["stopProcessingActions"]).toBe(true);

        expect(actionClient["processingInterval"]).toBeNull();
    });

    it("should check stopProcessingActions flag in the interval callback", async () => {
        let capturedCallback: Function = () => {};
        global.setInterval = vi.fn().mockImplementation((fn, ms) => {
            capturedCallback = fn as Function;
            return 123;
        }) as unknown as typeof setInterval;

        actionClient["processActionsLoop"]();

        actionClient["stopProcessingActions"] = true;

        await capturedCallback();

        expect(global.clearInterval).toHaveBeenCalled();

        expect(actionClient["processTweetActions"]).not.toHaveBeenCalled();
    });
});
