import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mocked,
} from "vitest";
import { IAgentRuntime, Memory, ServiceType } from "@elizaos/core";
import { Tweet } from "agent-twitter-client";
import * as core from "@elizaos/core";
import * as utils from "../src/utils";
import { ClientBase } from "../src/base";
import { KnowledgeProcessor } from "../src/KnowledgeProcessor";
import { TwitterInteractionClient } from "../src/interactions";

// Mocks
vi.mock("../src/base");
vi.mock("../src/KnowledgeProcessor");
vi.mock("@elizaos/core", async (importOriginal) => {
    const original = await importOriginal<typeof core>();
    return {
        ...original,
        generateShouldRespond: vi.fn(),
        generateMessageResponse: vi.fn(),
        composeContext: vi.fn((c) => `composed_context:${c.template}`),
        stringToUuid: vi.fn((s) => `uuid-${s}`),
        elizaLogger: {
            log: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        },
    };
});
vi.mock("../src/utils.ts", async (importOriginal) => {
    const original = await importOriginal<typeof utils>();
    return {
        ...original,
        buildConversationThread: vi.fn(),
        sendTweet: vi.fn(),
        wait: vi.fn(),
    };
});

describe("TwitterInteractionClient", () => {
    let mockClient: Mocked<ClientBase>;
    let mockRuntime: Mocked<IAgentRuntime>;
    let mockKnowledgeProcessor: Mocked<KnowledgeProcessor>;
    let twitterInteractionClient: TwitterInteractionClient;

    const mockTweet: Tweet = {
        id: "123",
        text: "Hello @testuser",
        userId: "user1",
        username: "testuser1",
        name: "Test User 1",
        conversationId: "conv1",
        timestamp: Date.now() / 1000,
        isReply: false,
        isRetweet: false,
        permanentUrl: "http://twitter.com/testuser1/status/123",
        photos: [],
        videos: [],
        hashtags: [],
        mentions: [],
        thread: [],
        urls: [],
    };

    beforeEach(() => {
        // Reset mocks before each test
        vi.clearAllMocks();

        mockClient = {
            profile: {
                id: "bot_id",
                username: "testuser",
                name: "Test User",
            },
            twitterConfig: {
                TWITTER_POLL_INTERVAL: 120,
                TWITTER_TARGET_USERS: [],
                TWITTER_USERNAME: "testuser",
            },
            fetchSearchTweets: vi.fn(),
            cacheLatestCheckedTweetId: vi.fn(),
            loadLatestKnowledgeCheckedTweetId: vi
                .fn()
                .mockResolvedValue(undefined),
            lastCheckedTweetId: BigInt(0),
            saveRequestMessage: vi.fn(),
            twitterClient: {
                fetchSearchTweets: vi.fn(),
            },
        } as unknown as Mocked<ClientBase>;

        const mockMessageManager = {
            getMemoryById: vi.fn(),
            createMemory: vi.fn(),
        };

        mockRuntime = {
            agentId: "agent1",
            ensureConnection: vi.fn(),
            messageManager: mockMessageManager,
            composeState: vi.fn(),
            getService: vi.fn(),
            character: {
                templates: {},
            },
            updateRecentMessageState: vi.fn(),
            processActions: vi.fn(),
            cacheManager: {
                set: vi.fn(),
            },
        } as unknown as Mocked<IAgentRuntime>;

        // Mock KnowledgeProcessor constructor and methods
        twitterInteractionClient = new TwitterInteractionClient(
            mockClient,
            mockRuntime
        );
        mockKnowledgeProcessor = vi.mocked(
            twitterInteractionClient.knowledgeProcessor
        );
    });

    describe("constructor", () => {
        it("should initialize correctly", () => {
            expect(twitterInteractionClient.client).toBe(mockClient);
            expect(twitterInteractionClient.runtime).toBe(mockRuntime);
            expect(twitterInteractionClient.knowledgeProcessor).toBeInstanceOf(
                KnowledgeProcessor
            );
        });
    });

    describe("start", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("should call handleTwitterInteractions immediately and schedule next call", () => {
            const handleTwitterInteractionsSpy = vi
                .spyOn(twitterInteractionClient, "handleTwitterInteractions")
                .mockResolvedValue();

            twitterInteractionClient.start();

            expect(handleTwitterInteractionsSpy).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(
                mockClient.twitterConfig.TWITTER_POLL_INTERVAL * 1000
            );

            expect(handleTwitterInteractionsSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe("handleTwitterInteractions", () => {
        it("should fetch mentions and process them", async () => {
            const mentionTweet = {
                ...mockTweet,
                id: "124",
                text: "mention tweet",
            };
            mockClient.fetchSearchTweets.mockResolvedValue({
                tweets: [mentionTweet],
            });
            vi.mocked(
                mockRuntime.messageManager.getMemoryById
            ).mockResolvedValue(null);
            vi.mocked(utils.buildConversationThread).mockResolvedValue([]);
            vi.mocked(core.generateShouldRespond).mockResolvedValue("RESPOND");
            vi.mocked(core.generateMessageResponse).mockResolvedValue({
                text: "A reply",
            });
            vi.mocked(utils.sendTweet).mockResolvedValue([]);

            await twitterInteractionClient.handleTwitterInteractions();

            expect(mockClient.fetchSearchTweets).toHaveBeenCalledWith(
                "@testuser",
                20,
                undefined,
                "0"
            );
            expect(mockKnowledgeProcessor.processKnowledge).toHaveBeenCalled();
            expect(mockClient.cacheLatestCheckedTweetId).toHaveBeenCalled();
            expect(mockClient.lastCheckedTweetId).toBe(BigInt(mentionTweet.id));
        });

        it("should handle target users when configured", async () => {
            mockClient.twitterConfig.TWITTER_TARGET_USERS = ["targetuser"];
            const targetUserTweet = {
                ...mockTweet,
                id: "125",
                username: "targetuser",
                text: "target tweet",
                timestamp: Date.now() / 1000 - 100,
            };

            // First call for mentions, second for target user
            mockClient.fetchSearchTweets.mockResolvedValue({ tweets: [] });
            vi.mocked(mockClient.fetchSearchTweets).mockResolvedValue({
                tweets: [targetUserTweet],
            });

            vi.mocked(
                mockRuntime.messageManager.getMemoryById
            ).mockResolvedValue(null);
            vi.mocked(utils.buildConversationThread).mockResolvedValue([]);
            vi.mocked(core.generateShouldRespond).mockResolvedValue("RESPOND");
            vi.mocked(core.generateMessageResponse).mockResolvedValue({
                text: "A reply",
            });
            vi.mocked(utils.sendTweet).mockResolvedValue([]);

            await twitterInteractionClient.handleTwitterInteractions();

            expect(mockClient.fetchSearchTweets).toHaveBeenCalledWith(
                "@testuser",
                20,
                undefined,
                "0"
            );
            expect(mockClient.fetchSearchTweets).toHaveBeenCalledWith(
                "from:targetuser",
                3,
                undefined,
                "0"
            );
            expect(mockKnowledgeProcessor.processKnowledge).toHaveBeenCalled();
            expect(mockClient.cacheLatestCheckedTweetId).toHaveBeenCalled();
            expect(mockClient.lastCheckedTweetId).toBe(
                BigInt(targetUserTweet.id)
            );
        });

        it("should not process tweets older than lastCheckedTweetId", async () => {
            const oldTweet = { ...mockTweet, id: "100" };
            mockClient.lastCheckedTweetId = BigInt(100);
            mockClient.fetchSearchTweets.mockResolvedValue({
                tweets: [oldTweet],
            });

            await twitterInteractionClient.handleTwitterInteractions();

            expect(core.generateShouldRespond).not.toHaveBeenCalled();
            expect(mockClient.cacheLatestCheckedTweetId).toHaveBeenCalled(); // it will be called at the end
        });

        it("should skip already processed tweets", async () => {
            const mentionTweet = { ...mockTweet, id: "126" };
            mockClient.fetchSearchTweets.mockResolvedValue({
                tweets: [mentionTweet],
            });
            // Simulate that a memory for this tweet already exists
            vi.mocked(
                mockRuntime.messageManager.getMemoryById
            ).mockResolvedValue({} as Memory);

            await twitterInteractionClient.handleTwitterInteractions();

            expect(
                vi.mocked(utils.buildConversationThread)
            ).not.toHaveBeenCalled();
            expect(core.generateShouldRespond).not.toHaveBeenCalled();
            expect(mockClient.cacheLatestCheckedTweetId).toHaveBeenCalled();
        });

        it('should not respond if shouldRespond is not "RESPOND"', async () => {
            const mentionTweet = { ...mockTweet, id: "127" };
            mockClient.fetchSearchTweets.mockResolvedValue({
                tweets: [mentionTweet],
            });
            vi.mocked(
                mockRuntime.messageManager.getMemoryById
            ).mockResolvedValue(null);
            vi.mocked(utils.buildConversationThread).mockResolvedValue([]);
            vi.mocked(core.generateShouldRespond).mockResolvedValue("IGNORE");

            await twitterInteractionClient.handleTwitterInteractions();

            expect(core.generateMessageResponse).not.toHaveBeenCalled();
            expect(utils.sendTweet).not.toHaveBeenCalled();
            expect(mockClient.lastCheckedTweetId).toBe(BigInt(mentionTweet.id));
        });

        it("should handle image descriptions", async () => {
            const tweetWithImage = {
                ...mockTweet,
                id: "128",
                photos: [{ id: "p1", url: "image.url", alt_text: undefined }],
            };
            const mockImageService = {
                describeImage: vi
                    .fn()
                    .mockResolvedValue({ title: "title", description: "desc" }),
                serviceType: ServiceType.IMAGE_DESCRIPTION,
                initialize: vi.fn(),
            };
            mockClient.fetchSearchTweets.mockResolvedValue({
                tweets: [tweetWithImage],
            });
            vi.mocked(
                mockRuntime.messageManager.getMemoryById
            ).mockResolvedValue(null);
            vi.mocked(utils.buildConversationThread).mockResolvedValue([]);
            vi.mocked(core.generateShouldRespond).mockResolvedValue("RESPOND");
            vi.mocked(core.generateMessageResponse).mockResolvedValue({
                text: "A reply",
            });
            vi.mocked(utils.sendTweet).mockResolvedValue([]);
            mockRuntime.getService.mockReturnValue(mockImageService);

            await twitterInteractionClient.handleTwitterInteractions();

            expect(mockRuntime.getService).toHaveBeenCalledWith(
                ServiceType.IMAGE_DESCRIPTION
            );
            expect(mockImageService.describeImage).toHaveBeenCalledWith(
                "image.url"
            );
            expect(mockRuntime.composeState).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    imageDescriptions: expect.stringContaining(
                        "Image 1: Title: title\nDescription: desc"
                    ),
                })
            );
        });

        it("should handle errors gracefully", async () => {
            const error = new Error("test error");
            mockClient.fetchSearchTweets.mockRejectedValue(error);

            await twitterInteractionClient.handleTwitterInteractions();

            expect(core.elizaLogger.error).toHaveBeenCalledWith(
                "Error handling Twitter interactions:",
                error
            );
        });
    });
});
