import { describe, it, expect, vi, beforeEach } from "vitest";
import { IAgentRuntime, elizaLogger, UUID } from "@elizaos/core";
import { Client } from "discord.js";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import {
    buildTwitterClientMock,
    buildConfigMock,
    buildRuntimeMock,
    mockTwitterProfile,
    mockCharacter,
} from "./mocks";
import { DiscordApprover } from "../src/DiscordApprover";

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

describe("Tweet Approval", () => {
    let mockDiscordClient: any;
    let mockChannel: any;
    let mockMessage: any;
    let mockRuntime: IAgentRuntime;
    let mockConfig: TwitterConfig;
    let baseClient: ClientBase;
    let mockTwitterClient: any;
    let discordApprover: DiscordApprover;

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

        discordApprover = new DiscordApprover(
            mockRuntime,
            baseClient,
            mockTwitterProfile.username
        );

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

    it("should handle approval workflow when enabled", async () => {
        const mockDiscordChannel = {
            send: vi.fn().mockResolvedValue({ id: "discord-message-123" }),
        };

        discordApprover["validateChannel"] = vi
            .fn()
            .mockReturnValue(mockDiscordChannel);

        const mockClient = {
            channels: {
                fetch: vi.fn().mockResolvedValue(mockDiscordChannel),
                cache: new Map(),
                resolve: vi.fn(),
                resolveId: vi.fn(),
            },
        } as unknown as Client;

        discordApprover["discordClientForApproval"] = mockClient;
        discordApprover["discordApprovalChannelId"] = "test-channel";

        await discordApprover.sendForApproval(
            "Test tweet",
            "room-123-123-123-123",
            "Test tweet"
        );

        expect(elizaLogger.log).toHaveBeenCalledWith(
            expect.stringContaining("Sending Tweet For Approval")
        );

        expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
            "twitter/testuser/pendingTweet",
            expect.any(Array)
        );
    });

    it("should handle invalid Discord channel", async () => {
        discordApprover["discordClientForApproval"] = mockDiscordClient;
        discordApprover["discordApprovalChannelId"] = "discord-channel-123";

        // Mock channel fetch to return null
        mockDiscordClient.channels.fetch.mockResolvedValue(null);

        const tweetContent = "Test tweet";
        const roomId = "room-123" as UUID;

        const messageId = await discordApprover["sendForApproval"](
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
        discordApprover["discordClientForApproval"] = mockDiscordClient;
        discordApprover["discordApprovalChannelId"] = "discord-channel-123";

        // Mock Discord API error
        mockChannel.send.mockRejectedValue(new Error("Discord API error"));

        const tweetContent = "Test tweet";
        const roomId = "room-123" as UUID;

        const messageId = await discordApprover["sendForApproval"](
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
