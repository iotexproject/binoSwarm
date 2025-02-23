import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    ActionTimelineType,
    IAgentRuntime,
    elizaLogger,
    State,
    ActionResponse,
    UUID,
    ServiceType,
    IImageDescriptionService,
    stringToUuid,
    Character,
    generateText,
} from "@elizaos/core";
import { Tweet } from "agent-twitter-client";
import { Client } from "discord.js";

import { TwitterPostClient } from "../src/post";
import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import * as utils from "../src/utils";

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
    };
});

vi.mock("../src/utils", async () => {
    const actual = await vi.importActual("../src/utils");
    return {
        ...actual,
        buildConversationThread: vi.fn(),
    };
});

vi.mock("discord.js", async () => {
    const actual = await vi.importActual("discord.js");
    return {
        ...actual,
        TextChannel: {
            prototype: {
                [Symbol.hasInstance]: (instance: any) => {
                    return instance?.type === 0;
                },
            },
        },
    };
});

// Test Fixtures
const createMockTweet = (overrides: Partial<Tweet> = {}): Tweet => {
    const { text, ...restOverrides } = overrides;
    return {
        id: "123",
        name: "Test User",
        username: "testuser",
        text: text ?? "Test tweet",
        conversationId: "123",
        timestamp: Date.now(),
        userId: "123",
        permanentUrl: "https://twitter.com/testuser/status/123",
        hashtags: [],
        mentions: [],
        photos: [],
        thread: [],
        urls: [],
        videos: [],
        ...restOverrides,
    };
};

const createMockState = () =>
    ({
        userId: "user-123" as UUID,
        agentId: "agent-123" as UUID,
        bio: "Test bio",
        lore: "Test lore",
        messageDirections: "Test message directions",
        postDirections: "Test post directions",
        roomId: "room-123" as UUID,
        actors: "user1, user2",
        recentMessages: "message1\nmessage2",
        recentMessagesData: [],
        providers: "Test providers",
        topics: "Test topics",
        knowledge: "Test knowledge",
        characterPostExamples: "Test examples",
        content: { text: "", action: "" },
    }) as State;

const photoSample = {
    id: "photo-123",
    url: "https://example.com/image.jpg",
    alt_text: "Test image alt text",
};

const createMockTimeline = (
    overrides: {
        tweet?: Partial<Tweet>;
        actionResponse?: Partial<ActionResponse>;
        roomId?: UUID;
    } = {}
) => ({
    tweet: createMockTweet(overrides.tweet),
    actionResponse: {
        like: false,
        retweet: false,
        quote: false,
        reply: false,
        ...overrides.actionResponse,
    } as ActionResponse,
    tweetState: createMockState(),
    roomId: overrides.roomId || ("room-123" as UUID),
});

const createSuccessfulTweetResponse = (content: string = "Tweet content") => ({
    json: () => ({
        data: {
            create_tweet: {
                tweet_results: {
                    result: {
                        rest_id: "456",
                        legacy: {
                            full_text: content,
                            created_at: new Date().toISOString(),
                            conversation_id_str: "456",
                        },
                    },
                },
            },
        },
    }),
});

describe("Twitter Post Client", () => {
    let mockRuntime: IAgentRuntime;
    let mockConfig: TwitterConfig;
    let baseClient: ClientBase;
    let mockTwitterClient: any;
    let postClient: TwitterPostClient;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup mock Twitter client
        mockTwitterClient = {
            sendTweet: vi.fn(),
            sendNoteTweet: vi.fn(),
            likeTweet: vi.fn(),
            retweet: vi.fn(),
            getTweet: vi.fn(),
            sendQuoteTweet: vi.fn(),
            fetchTimelineForActions: vi.fn(),
            fetchHomeTimeline: vi.fn(),
            fetchFollowingTimeline: vi.fn(),
        };

        mockRuntime = {
            env: {
                TWITTER_USERNAME: "testuser",
                TWITTER_POST_INTERVAL_MIN: "5",
                TWITTER_POST_INTERVAL_MAX: "10",
                TWITTER_ACTION_INTERVAL: "5",
                TWITTER_ENABLE_ACTION_PROCESSING: "true",
                TWITTER_POST_IMMEDIATELY: "false",
                TWITTER_SEARCH_ENABLE: "false",
                TWITTER_EMAIL: "test@example.com",
                TWITTER_PASSWORD: "hashedpassword",
                TWITTER_2FA_SECRET: "",
                TWITTER_POLL_INTERVAL: "120",
                TWITTER_RETRY_LIMIT: "5",
                ACTION_TIMELINE_TYPE: "foryou",
                MAX_ACTIONS_PROCESSING: "1",
                MAX_TWEET_LENGTH: "280",
            },
            getEnv: function (key: string) {
                return this.env[key] || null;
            },
            getSetting: function (key: string) {
                return this.env[key] || null;
            },
            character: {
                style: {
                    all: ["Test style 1", "Test style 2"],
                    post: ["Post style 1", "Post style 2"],
                },
            },
            cacheManager: {
                get: vi.fn(),
                set: vi.fn(),
                delete: vi.fn(),
            },
            messageManager: {
                createMemory: vi.fn(),
                getMemoryById: vi.fn(),
            },
            ensureRoomExists: vi.fn(),
            ensureUserExists: vi.fn(),
            ensureParticipantInRoom: vi.fn(),
            composeState: vi.fn(),
            getService: vi.fn(),
        } as unknown as IAgentRuntime;

        mockConfig = {
            TWITTER_USERNAME: "testuser",
            TWITTER_PASSWORD: "hashedpassword",
            TWITTER_EMAIL: "test@example.com",
            TWITTER_2FA_SECRET: "",
            TWITTER_RETRY_LIMIT: 5,
            TWITTER_POLL_INTERVAL: 120,
            TWITTER_KNOWLEDGE_USERS: [],
            MAX_ACTIONS_PROCESSING: 1,
            ACTION_TIMELINE_TYPE: ActionTimelineType.ForYou,
            TWITTER_SEARCH_ENABLE: false,
            TWITTER_SPACES_ENABLE: false,
            TWITTER_TARGET_USERS: [],
            POST_INTERVAL_MIN: 5,
            POST_INTERVAL_MAX: 10,
            ACTION_INTERVAL: 5,
            ENABLE_ACTION_PROCESSING: true,
            POST_IMMEDIATELY: false,
            MAX_TWEET_LENGTH: 280,
        };

        baseClient = new ClientBase(mockRuntime, mockConfig);
        baseClient.twitterClient = mockTwitterClient;
        baseClient.profile = {
            id: "123",
            username: "testuser",
            screenName: "Test User",
            bio: "Test bio",
            nicknames: ["test"],
        };

        // Mock RequestQueue with just the add method since that's all we use
        baseClient.requestQueue = {
            add: async <T>(request: () => Promise<T>): Promise<T> => request(),
        } as any;

        // Setup mock runtime with character
        mockRuntime.character = {
            name: "Test Character",
            topics: ["topic1", "topic2"],
            templates: {
                twitterPostTemplate: "test template",
                twitterMessageHandlerTemplate: "test message template",
                twitterActionTemplate: "test action template",
            },
            modelProvider: "test-provider",
            bio: "Test bio",
            lore: "Test lore",
            messageExamples: ["example1"],
            postExamples: ["post1"],
            style: {
                all: ["style1"],
                post: ["post-style1"],
                message: ["message-style1"],
            },
            characterPostExamples: ["char-post1"],
            messageDirections: "test directions",
            postDirections: "test post directions",
            knowledge: "test knowledge",
            adjectives: ["adj1"],
            clients: [],
            plugins: [],
        } as unknown as Character;

        // Ensure baseClient.profile is not null before each test
        baseClient.profile = {
            id: "123",
            username: "testuser",
            screenName: "Test User",
            bio: "Test bio",
            nicknames: ["test"],
        };

        postClient = new TwitterPostClient(baseClient, mockRuntime);
    });

    it("should create post client instance", () => {
        const postClient = new TwitterPostClient(baseClient, mockRuntime);
        expect(postClient).toBeDefined();
        expect(postClient.twitterUsername).toBe("testuser");
    });

    it("should keep tweets under max length when already valid", () => {
        const postClient = new TwitterPostClient(baseClient, mockRuntime);
        const validTweet = "This is a valid tweet";
        const result = postClient["trimTweetLength"](validTweet);
        expect(result).toBe(validTweet);
        expect(result.length).toBeLessThanOrEqual(280);
    });

    it("should cut long tweets at last sentence when possible", () => {
        const postClient = new TwitterPostClient(baseClient, mockRuntime);
        const longTweet =
            "Exploring the endless possibilities of Web3! From decentralized apps to smart contracts, the future is being built on blockchain. Exciting to see how AI, NFTs, and DAOs are shaping the next internet era. Let's continue pushing boundaries and innovating! 🚀 #Web3 #Blockchain #Innovation";
        const result = postClient["trimTweetLength"](longTweet);
        expect(result).toBe(
            "Exploring the endless possibilities of Web3! From decentralized apps to smart contracts, the future is being built on blockchain. Exciting to see how AI, NFTs, and DAOs are shaping the next internet era."
        );
    });

    it("should add ellipsis when cutting within a sentence", () => {
        const postClient = new TwitterPostClient(baseClient, mockRuntime);
        const longSentence =
            "Diving deeper into the potential of AI agents and decentralized systems looking forward to seeing how automation and smart contracts can transform industries from finance to healthcare the future is decentralized and intelligent and we're just getting started #AI #Web3 #Blockchain #Innovation";
        const result = postClient["trimTweetLength"](longSentence);
        expect(result).toBe(
            "Diving deeper into the potential of AI agents and decentralized systems looking forward to seeing how automation and smart contracts can transform industries from finance to healthcare the future is decentralized and intelligent and we're just getting started #AI #Web3..."
        );
    });

    describe("Tweet Generation and Posting", () => {
        it("should handle standard tweet posting", async () => {
            const postClient = new TwitterPostClient(baseClient, mockRuntime);
            const tweetContent = "Test tweet";

            mockTwitterClient.sendTweet.mockResolvedValue({
                json: () => ({
                    data: {
                        create_tweet: {
                            tweet_results: {
                                result: {
                                    rest_id: "123",
                                    legacy: {
                                        full_text: tweetContent,
                                        created_at: new Date().toISOString(),
                                        conversation_id_str: "123",
                                    },
                                },
                            },
                        },
                    },
                }),
            });

            await postClient["sendStandardTweet"](baseClient, tweetContent);

            expect(mockTwitterClient.sendTweet).toHaveBeenCalledWith(
                tweetContent,
                undefined
            );
            expect(elizaLogger.log).toHaveBeenCalled();
        });

        it("should handle note tweet posting", async () => {
            const postClient = new TwitterPostClient(baseClient, mockRuntime);
            const tweetContent =
                "A very long tweet that exceeds standard length...".repeat(10);

            mockTwitterClient.sendNoteTweet.mockResolvedValue({
                data: {
                    notetweet_create: {
                        tweet_results: {
                            result: {
                                rest_id: "123",
                                legacy: {
                                    full_text: tweetContent,
                                    created_at: new Date().toISOString(),
                                    conversation_id_str: "123",
                                },
                            },
                        },
                    },
                },
            });

            await postClient["handleNoteTweet"](baseClient, tweetContent);

            expect(mockTwitterClient.sendNoteTweet).toHaveBeenCalledWith(
                tweetContent,
                undefined
            );
        });
    });

    describe("Tweet Actions Processing", () => {
        let mockImageDescriptionService: IImageDescriptionService;

        beforeEach(() => {
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
            vi.spyOn(
                postClient as any,
                "generateTweetContent"
            ).mockResolvedValue("This is a generated quote tweet response");

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

            vi.mocked(
                mockRuntime.messageManager.getMemoryById
            ).mockResolvedValue(null);
            vi.mocked(mockRuntime.composeState).mockResolvedValue(
                timeline.tweetState
            );

            await postClient["processTimelineActions"]([timeline]);

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
                createSuccessfulTweetResponse("Quote tweet content")
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

            await postClient["processTimelineActions"]([timeline]);

            expect(utils.buildConversationThread).toHaveBeenCalledWith(
                mockTweet,
                baseClient
            );

            expect(
                mockImageDescriptionService.describeImage
            ).toHaveBeenCalledWith("https://example.com/image.jpg");

            expect(postClient["generateTweetContent"]).toHaveBeenCalled();

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

            mockTwitterClient.likeTweet.mockRejectedValue(
                new Error("API Error")
            );

            await postClient["processTimelineActions"]([timeline]);

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

            await postClient["processTimelineActions"]([timeline]);

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

            await postClient["processTimelineActions"]([timeline]);

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
                createSuccessfulTweetResponse("Reply tweet content")
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

            await postClient["processTimelineActions"]([timeline]);

            // Verify buildConversationThread was called
            expect(utils.buildConversationThread).toHaveBeenCalledWith(
                mockTweet,
                baseClient
            );

            // Verify image description service was called
            expect(
                mockImageDescriptionService.describeImage
            ).toHaveBeenCalledWith("https://example.com/image.jpg");

            // Verify generateTweetContent was called
            expect(postClient["generateTweetContent"]).toHaveBeenCalled();

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
            vi.spyOn(postClient as any, "processReply").mockRejectedValueOnce(
                new Error(`Error replying to tweet ${timeline.tweet.id}`)
            );

            vi.mocked(mockRuntime.composeState).mockResolvedValue({
                ...timeline.tweetState,
                currentPost: `From @${timeline.tweet.username}: ${timeline.tweet.text}`,
                formattedConversation: "",
                imageContext: "",
                quotedContent: "",
            });

            await postClient["processTimelineActions"]([timeline]);

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
            vi.spyOn(
                postClient as any,
                "generateTweetContent"
            ).mockResolvedValue(
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

            await postClient["processTimelineActions"]([timeline]);

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
            vi.spyOn(
                postClient as any,
                "generateTweetContent"
            ).mockResolvedValue(undefined);

            vi.mocked(mockRuntime.composeState).mockResolvedValue({
                ...timeline.tweetState,
                currentPost: `From @${mockTweet.username}: ${mockTweet.text}`,
                formattedConversation:
                    "@testuser (now): Original tweet to reply to",
                imageContext: "",
                quotedContent: "",
            });

            await postClient["processTimelineActions"]([timeline]);

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
                createSuccessfulTweetResponse("Reply tweet content")
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

            await postClient["processTimelineActions"]([timeline]);

            // Verify quoted tweet was fetched
            expect(mockTwitterClient.getTweet).toHaveBeenCalledWith(
                quotedTweet.id
            );

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
                createSuccessfulTweetResponse("Reply tweet content")
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

            await postClient["processTimelineActions"]([timeline]);

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

            await postClient["processTimelineActions"]([timeline]);

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
            vi.spyOn(
                postClient as any,
                "generateTweetContent"
            ).mockResolvedValue(undefined);

            vi.mocked(mockRuntime.composeState).mockResolvedValue({
                ...timeline.tweetState,
                currentPost: `From @${mockTweet.username}: ${mockTweet.text}`,
                formattedConversation:
                    "@testuser (now): Original tweet to quote",
                imageContext: "",
                quotedContent: "",
            });

            await postClient["processTimelineActions"]([timeline]);

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
                createSuccessfulTweetResponse("Quote tweet content")
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

            await postClient["processTimelineActions"]([timeline]);

            // Verify quoted tweet was fetched
            expect(mockTwitterClient.getTweet).toHaveBeenCalledWith(
                quotedTweet.id
            );

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
                createSuccessfulTweetResponse("Quote tweet content")
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

            await postClient["processTimelineActions"]([timeline]);

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

            await postClient["processTimelineActions"]([timeline]);

            // Verify retweet was called
            expect(mockTwitterClient.retweet).toHaveBeenCalledWith(
                mockTweet.id
            );

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

            await postClient["processTimelineActions"]([timeline]);

            // Verify retweet was attempted
            expect(mockTwitterClient.retweet).toHaveBeenCalledWith(
                mockTweet.id
            );

            // Verify error was logged
            expect(elizaLogger.error).toHaveBeenCalledWith(
                `Error retweeting tweet ${mockTweet.id}:`,
                expect.any(Error)
            );
        });

        it("should skip already processed tweets", async () => {
            const postClient = new TwitterPostClient(baseClient, mockRuntime);
            const mockTweet = createMockTweet();
            const roomId = stringToUuid(
                mockTweet.id + "-" + mockRuntime.agentId
            );

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
            vi.mocked(
                mockRuntime.messageManager.getMemoryById
            ).mockResolvedValue({
                id: stringToUuid(mockTweet.id + "-" + mockRuntime.agentId),
                content: { text: "existing memory" },
                userId: mockRuntime.agentId,
                agentId: mockRuntime.agentId,
                roomId,
            });

            await postClient["processTweetActions"]();

            expect(elizaLogger.log).toHaveBeenCalledWith(
                `Already processed tweet ID: ${mockTweet.id}`
            );
            expect(elizaLogger.log).toHaveBeenLastCalledWith(
                `Processed 0 tweets`
            );

            // Verify no further processing occurred
            expect(mockRuntime.composeState).not.toHaveBeenCalled();
        });

        it("should handle error in tweet processing", async () => {
            const postClient = new TwitterPostClient(baseClient, mockRuntime);
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
            vi.mocked(
                mockRuntime.messageManager.getMemoryById
            ).mockRejectedValue(new Error("Failed to check tweet memory"));

            // Call processTweetActions
            await postClient["processTweetActions"]();

            // Verify error was logged with the tweet ID
            expect(elizaLogger.error).toHaveBeenCalledWith(
                `Error processing tweet ${mockTweet.id}:`,
                expect.any(Error)
            );

            // Verify processing continued (didn't throw)
            expect(mockRuntime.composeState).not.toHaveBeenCalled();
        });

        it("should handle error in processTweetActions", async () => {
            const postClient = new TwitterPostClient(baseClient, mockRuntime);

            vi.clearAllMocks();

            await expect(postClient["processTweetActions"]()).rejects.toThrow(
                "Cannot read properties of undefined (reading 'map')"
            );
            // Verify error was logged
            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error in processTweetActions:",
                new TypeError(
                    "Cannot read properties of undefined (reading 'map')"
                )
            );
        });
    });

    describe("Cache Management", () => {
        it("should properly manage tweet cache", async () => {
            const postClient = new TwitterPostClient(baseClient, mockRuntime);
            const mockTweet = createMockTweet({ text: "Test tweet" });

            vi.mocked(mockRuntime.cacheManager.get).mockResolvedValue(null);
            vi.mocked(mockRuntime.cacheManager.set).mockResolvedValue(
                undefined
            );

            await postClient["processAndCacheTweet"](
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

    describe("Tweet Approval", () => {
        let mockDiscordClient: any;
        let mockChannel: any;
        let mockMessage: any;

        beforeEach(() => {
            // Mock Discord client and channel
            mockMessage = {
                id: "discord-message-123",
                send: vi.fn(),
            };

            mockChannel = {
                send: vi.fn().mockResolvedValue(mockMessage),
                messages: {
                    fetch: vi.fn(),
                },
                type: 0, // ChannelType.GuildText
                id: "discord-channel-123",
                name: "test-channel",
                guild: {
                    id: "test-guild",
                    name: "Test Guild",
                },
                client: mockDiscordClient,
                isText: () => true,
                isTextBased: () => true,
                isThread: () => false,
            };

            // Create a proper channels collection mock
            mockDiscordClient = {
                channels: {
                    fetch: vi.fn().mockImplementation(async (channelId) => {
                        if (channelId === "discord-channel-123") {
                            return mockChannel;
                        }
                        return null;
                    }),
                },
            };
        });

        it("should handle invalid Discord channel", async () => {
            const postClient = new TwitterPostClient(baseClient, mockRuntime);
            postClient["discordClientForApproval"] = mockDiscordClient;
            postClient["discordApprovalChannelId"] = "discord-channel-123";

            // Mock channel fetch to return null
            mockDiscordClient.channels.fetch.mockResolvedValue(null);

            const tweetContent = "Test tweet";
            const roomId = "room-123" as UUID;

            const messageId = await postClient["sendForApproval"](
                tweetContent,
                roomId,
                tweetContent
            );

            expect(messageId).toBeNull();
            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error Sending Twitter Post Approval Request:",
                expect.any(Error)
            );
            expect(mockRuntime.cacheManager.set).not.toHaveBeenCalled();
        });

        it("should handle Discord API errors", async () => {
            const postClient = new TwitterPostClient(baseClient, mockRuntime);
            postClient["discordClientForApproval"] = mockDiscordClient;
            postClient["discordApprovalChannelId"] = "discord-channel-123";

            // Mock Discord API error
            mockChannel.send.mockRejectedValue(new Error("Discord API error"));

            const tweetContent = "Test tweet";
            const roomId = "room-123" as UUID;

            const messageId = await postClient["sendForApproval"](
                tweetContent,
                roomId,
                tweetContent
            );

            expect(messageId).toBeNull();
            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error Sending Twitter Post Approval Request:",
                expect.any(Error)
            );
            expect(mockRuntime.cacheManager.set).not.toHaveBeenCalled();
        });
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

            const sorted = postClient["sortProcessedTimeline"](mockTimelines);

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

            const sorted = postClient["sortProcessedTimeline"](mockTimelines);

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

            const sorted = postClient["sortProcessedTimeline"](mockTimelines);

            // Should maintain original order when weights and likes are equal
            expect(sorted[0].roomId).toBe("room1");
            expect(sorted[1].roomId).toBe("room2");
        });
    });

    describe("Generate New Tweet", () => {
        it("should generate and post a new tweet successfully", async () => {
            if (!baseClient.profile) {
                throw new Error("Profile must be defined for test");
            }

            vi.mocked(generateText).mockResolvedValue(
                "<response>Test tweet content</response>"
            );

            mockTwitterClient.sendTweet.mockResolvedValue(
                createSuccessfulTweetResponse("Test tweet content")
            );

            await postClient.generateNewTweet();

            expect(mockRuntime.ensureUserExists).toHaveBeenCalledWith(
                mockRuntime.agentId,
                baseClient.profile.username,
                mockRuntime.character.name,
                "twitter"
            );

            expect(mockRuntime.composeState).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: mockRuntime.agentId,
                    content: {
                        text: "topic1, topic2",
                        action: "TWEET",
                    },
                }),
                expect.objectContaining({
                    twitterUserName: baseClient.profile.username,
                    maxTweetLength: baseClient.twitterConfig.MAX_TWEET_LENGTH,
                })
            );

            expect(elizaLogger.log).toHaveBeenCalledWith(
                expect.stringContaining("Posting new tweet")
            );
        });

        it.skip("should handle approval workflow when enabled", async () => {
            vi.mocked(generateText).mockResolvedValue(
                "<refsponse>Test tweet content</refsponse>"
            );

            postClient["approvalRequired"] = true;

            const mockDiscordChannel = {
                send: vi.fn().mockResolvedValue({ id: "discord-message-123" }),
                type: 0,
            };

            const mockClient = {
                channels: {
                    fetch: vi.fn().mockResolvedValue(mockDiscordChannel),
                    cache: new Map(),
                    resolve: vi.fn(),
                    resolveId: vi.fn(),
                },
            } as unknown as Client;

            postClient["discordClientForApproval"] = mockClient;
            postClient["discordApprovalChannelId"] = "test-channel";

            await postClient.generateNewTweet();

            expect(elizaLogger.log).toHaveBeenCalledWith(
                expect.stringContaining("Sending Tweet For Approval")
            );
        });

        it("should handle invalid generated content", async () => {
            vi.mocked(generateText).mockResolvedValue(
                "Invalid content without response tags"
            );

            await postClient.generateNewTweet();

            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Failed to extract valid content from response:",
                expect.any(Object)
            );

            expect(mockTwitterClient.sendTweet).not.toHaveBeenCalled();
        });

        it("should handle tweet generation error", async () => {
            vi.mocked(generateText).mockRejectedValue(
                new Error("Generation failed")
            );

            await postClient.generateNewTweet();

            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error generating new tweet:",
                expect.any(Error)
            );

            expect(mockTwitterClient.sendTweet).not.toHaveBeenCalled();
        });
    });
});
