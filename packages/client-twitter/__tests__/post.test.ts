import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    IAgentRuntime,
    elizaLogger,
    UUID,
    generateText,
    generateMessageResponse,
    Content,
} from "@elizaos/core";
import { Client } from "discord.js";

import { TwitterPostClient } from "../src/post";
import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import {
    buildTwitterClientMock,
    buildConfigMock,
    buildRuntimeMock,
    createSuccessfulTweetResponse,
    mockTwitterProfile,
    mockCharacter,
    createMockTweet,
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

describe("Twitter Post Client", () => {
    let mockRuntime: IAgentRuntime;
    let mockConfig: TwitterConfig;
    let baseClient: ClientBase;
    let mockTwitterClient: any;
    let postClient: TwitterPostClient;

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

        postClient = new TwitterPostClient(baseClient, mockRuntime);
    });

    it("should create post client instance", () => {
        const postClient = new TwitterPostClient(baseClient, mockRuntime);
        expect(postClient).toBeDefined();
        expect(postClient.twitterUsername).toBe("testuser");
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

    describe("Generate New Tweet", () => {
        it("should generate and post a new tweet successfully", async () => {
            if (!baseClient.profile) {
                throw new Error("Profile must be defined for test");
            }

            vi.mocked(generateMessageResponse).mockResolvedValue({
                text: "Test tweet content",
            } as Content);

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

            expect(elizaLogger.log).toHaveBeenNthCalledWith(
                8,
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

        it("should handle tweet generation error", async () => {
            vi.mocked(generateMessageResponse).mockRejectedValue(
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
