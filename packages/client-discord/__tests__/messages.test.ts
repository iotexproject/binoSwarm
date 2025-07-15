import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageManager } from "../src/messages";
import {
    Message,
    User,
    Guild,
    Collection,
    ChannelType,
    Snowflake,
    Attachment,
    BaseChannel,
} from "discord.js";

// Import the modules we want to mock
import * as elizaosCore from "@elizaos/core";
const { elizaLogger } = elizaosCore;

// Mock @elizaos/core
vi.mock("@elizaos/core", () => ({
    elizaLogger: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        log: vi.fn(),
    },
    getEmbeddingZeroVector: () => new Array(1536).fill(0),
    stringToUuid: (str: string) => str,
    generateMessageResponse: vi.fn(),
    generateShouldRespond: vi.fn(),
    composeContext: vi.fn(() => "mocked context"),
    composeRandomUser: vi.fn(),
    UUID: String,
    InteractionLogger: {
        logMessageReceived: vi.fn(),
        logAgentResponse: vi.fn(),
        logAgentScheduledPost: vi.fn(),
        logAgentActionCalled: vi.fn(),
    },
}));

// Mock the VoiceManager
vi.mock("../src/voice.ts", () => ({
    VoiceManager: vi.fn().mockImplementation(() => ({
        playAudioStream: vi.fn(),
    })),
}));

// Mock attachments manager
vi.mock("../src/attachments.ts", () => ({
    AttachmentManager: vi.fn().mockImplementation(() => ({
        processAttachments: vi.fn().mockResolvedValue([]),
    })),
}));

// Mock templates
vi.mock("../src/templates.ts", () => ({
    discordShouldRespondTemplate: "mocked should respond template",
    discordMessageHandlerTemplate: "mocked message handler template",
}));

// Mock utils
vi.mock("../src/utils.ts", () => ({
    sendMessageInChunks: vi
        .fn()
        .mockImplementation(async (channel, content, messageId) => {
            return [
                {
                    id: "mock-response-id",
                    createdTimestamp: Date.now(),
                    url: "https://discord.com/mock-url",
                },
            ];
        }),
    canSendMessage: vi.fn().mockReturnValue({ canSend: true }),
    cosineSimilarity: vi.fn().mockReturnValue(0.9),
}));

function createMockDiscordMessage(overrides = {}) {
    const mockGuild = {
        id: "mock-guild-id",
        members: {
            cache: new Map([["bot-user-id", { nickname: "Bot Nickname" }]]),
        },
    } as unknown as Guild;

    const mockUser = {
        id: "mock-user-id",
        username: "Mock User",
        displayName: "Mock Display Name",
        bot: false,
    } as unknown as User;

    const mockChannel = {
        id: "mock-channel-id",
        type: ChannelType.GuildText,
        guild: mockGuild,
        send: vi.fn().mockResolvedValue({ id: "mock-response-id" }),
        sendTyping: vi.fn().mockResolvedValue(undefined),
        messages: {
            fetch: vi.fn().mockResolvedValue(new Collection()),
        },
    } as unknown as BaseChannel & { sendTyping: () => Promise<void> };

    return {
        id: "mock-message-id",
        content: "Hello world",
        author: mockUser,
        channel: mockChannel,
        guild: mockGuild,
        createdTimestamp: Date.now(),
        mentions: {
            users: new Collection<Snowflake, User>(),
            roles: new Collection(),
            has: vi.fn().mockReturnValue(false),
        },
        reference: null,
        interaction: null,
        attachments: new Collection<string, Attachment>(),
        url: "https://discord.com/mock-url",
        ...overrides,
    } as unknown as Message;
}

describe("MessageManager", () => {
    let mockRuntime;
    let mockDiscordClient;
    let messageManager;
    let mockVoiceManager;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create mock runtime
        mockRuntime = {
            agentId: "mock-agent-id",
            ensureConnection: vi.fn().mockResolvedValue(undefined),
            composeState: vi.fn().mockResolvedValue({ key: "mock-state" }),
            updateRecentMessageState: vi
                .fn()
                .mockImplementation((state) => Promise.resolve(state)),
            processActions: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue(undefined),
            messageManager: {
                addEmbeddingToMemory: vi.fn().mockResolvedValue(undefined),
                createMemory: vi.fn().mockResolvedValue(undefined),
                getMemories: vi.fn().mockResolvedValue([]),
            },
            databaseAdapter: {
                getParticipantUserState: vi.fn().mockResolvedValue("ACTIVE"),
                log: vi.fn().mockResolvedValue(undefined),
            },
            getService: vi.fn().mockReturnValue(null),
            character: {
                name: "TestBot",
                clientConfig: {
                    discord: {
                        shouldIgnoreBotMessages: false,
                        shouldRespondOnlyToMentions: false,
                        shouldIgnoreDirectMessages: false,
                    },
                },
                templates: {},
            },
        };

        // Create mock Discord client
        mockDiscordClient = {
            client: {
                user: {
                    id: "bot-user-id",
                    username: "TestBot",
                    displayName: "Test Bot",
                    tag: "TestBot#1234",
                },
            },
            runtime: mockRuntime,
        };

        mockVoiceManager = {
            playAudioStream: vi.fn(),
        };

        // Create message manager instance
        messageManager = new MessageManager(
            mockDiscordClient,
            mockVoiceManager
        );
    });

    describe("handleMessage", () => {
        it("should ignore messages from self", async () => {
            const message = createMockDiscordMessage({
                author: {
                    id: "bot-user-id",
                    username: "TestBot",
                    displayName: "Test Bot",
                    bot: true,
                },
            });

            await messageManager.handleMessage(message);

            expect(mockRuntime.ensureConnection).not.toHaveBeenCalled();
        });

        it("should ignore bot messages when configured to", async () => {
            mockRuntime.character.clientConfig.discord.shouldIgnoreBotMessages =
                true;

            const message = createMockDiscordMessage({
                author: {
                    id: "some-other-bot-id",
                    username: "OtherBot",
                    displayName: "Other Bot",
                    bot: true,
                },
            });

            await messageManager.handleMessage(message);

            expect(mockRuntime.ensureConnection).not.toHaveBeenCalled();
        });

        it("should process messages when direct mention occurs", async () => {
            // Set up to respond only to mentions
            mockRuntime.character.clientConfig.discord.shouldRespondOnlyToMentions =
                true;

            const message = createMockDiscordMessage({
                mentions: {
                    users: new Map([["bot-user-id", {}]]),
                    roles: new Collection(),
                    has: vi.fn((id) => id === "bot-user-id"),
                },
            });

            // Mock the functions directly instead of using require()
            vi.mocked(elizaosCore.generateShouldRespond).mockResolvedValue(
                "RESPOND"
            );
            vi.mocked(elizaosCore.generateMessageResponse).mockResolvedValue({
                text: "Hello, I'm responding to your mention!",
                inReplyTo: "mock-message-id-mock-agent-id",
            });

            await messageManager.handleMessage(message);

            // Verify interaction with runtime
            expect(mockRuntime.ensureConnection).toHaveBeenCalled();
            expect(mockRuntime.messageManager.createMemory).toHaveBeenCalled();
        });

        it("should ignore direct messages when configured to", async () => {
            mockRuntime.character.clientConfig.discord.shouldIgnoreDirectMessages =
                true;

            const message = createMockDiscordMessage({
                channel: {
                    id: "dm-channel-id",
                    type: ChannelType.DM,
                    send: vi.fn(),
                    sendTyping: vi.fn(),
                },
                guild: null,
            });

            await messageManager.handleMessage(message);

            expect(mockRuntime.ensureConnection).not.toHaveBeenCalled();
        });

        it("should process message with attachments", async () => {
            // Mock attachment in the message
            const mockAttachment = {
                id: "mock-attachment-id",
                name: "test.png",
                contentType: "image/png",
                url: "https://example.com/test.png",
            };

            const mockAttachmentCollection = new Collection();
            mockAttachmentCollection.set(
                "mock-attachment-id",
                mockAttachment as any
            );

            const message = createMockDiscordMessage({
                content: "Check out this image",
                attachments: mockAttachmentCollection,
            });

            // Set up the mock return value for AttachmentManager.processAttachments
            const { AttachmentManager } = await import("../src/attachments.ts");
            const mockProcessedAttachments = [
                {
                    id: "processed-attachment-id",
                    url: "https://example.com/test.png",
                    title: "test.png",
                    source: "Discord",
                    description: "Image from Discord",
                    text: "Image content text",
                },
            ];

            // Get a reference to the mocked instance and update its implementation
            const mockAttachmentManagerInstance =
                messageManager.attachmentManager;
            mockAttachmentManagerInstance.processAttachments = vi
                .fn()
                .mockResolvedValue(mockProcessedAttachments);

            // Mock the core functions
            vi.mocked(elizaosCore.generateShouldRespond).mockResolvedValue(
                "RESPOND"
            );
            vi.mocked(elizaosCore.generateMessageResponse).mockResolvedValue({
                text: "I see you sent an image!",
                inReplyTo: "mock-message-id-mock-agent-id",
            });

            await messageManager.handleMessage(message);

            // Verify the message was processed with the attachment
            expect(mockRuntime.ensureConnection).toHaveBeenCalled();
            expect(
                mockAttachmentManagerInstance.processAttachments
            ).toHaveBeenCalledWith(mockAttachmentCollection);
        });

        it.skip("should handle _shouldRespond returning true", async () => {
            const message = createMockDiscordMessage({
                content: "Will you respond to this?",
            });

            // Mock directly
            vi.mocked(elizaosCore.generateShouldRespond).mockResolvedValue(
                "RESPOND"
            );
            vi.mocked(elizaosCore.generateMessageResponse).mockResolvedValue({
                text: "Yes, I will respond!",
                inReplyTo: "mock-message-id-mock-agent-id",
            });

            await messageManager.handleMessage(message);

            // Verify that response generation was triggered
            expect(mockRuntime.messageManager.createMemory).toHaveBeenCalled();
            expect(elizaosCore.generateMessageResponse).toHaveBeenCalled();
        });

        it("should handle _shouldRespond returning false", async () => {
            const message = createMockDiscordMessage({
                content: "Random message that should be ignored",
            });

            // Mock directly
            vi.mocked(elizaosCore.generateShouldRespond).mockResolvedValue(
                "IGNORE"
            );

            await messageManager.handleMessage(message);

            // Verify that no response was generated
            expect(mockRuntime.messageManager.createMemory).toHaveBeenCalled(); // Should still create memory
            expect(elizaosCore.generateMessageResponse).not.toHaveBeenCalled(); // But not generate response
        });
    });

    describe("Message processing and memory", () => {
        it("should properly process and store message content and attachments", async () => {
            const mockAttachment = {
                id: "mock-attachment",
                contentType: "image/png",
                url: "https://example.com/image.png",
            };

            const message = createMockDiscordMessage({
                content: "Message with attachment",
                attachments: new Collection([
                    [mockAttachment.id, mockAttachment as any],
                ]),
            });

            await messageManager.handleMessage(message);

            expect(
                mockRuntime.messageManager.createMemory
            ).toHaveBeenCalledWith({
                memory: expect.objectContaining({
                    content: expect.objectContaining({
                        text: "Message with attachment",
                        attachments: expect.any(Array),
                    }),
                }),
                isUnique: true,
            });
        });

        it("should handle audio attachments correctly", async () => {
            const mockAudioAttachment = {
                id: "mock-audio",
                contentType: "audio/mp3",
                url: "https://example.com/audio.mp3",
            };

            const message = createMockDiscordMessage({
                attachments: new Collection([
                    [mockAudioAttachment.id, mockAudioAttachment as any],
                ]),
            });

            const mockProcessedAudio = [
                {
                    id: "processed-audio",
                    url: "https://example.com/processed.mp3",
                    type: "audio",
                },
            ];

            messageManager.attachmentManager.processAttachments.mockResolvedValue(
                mockProcessedAudio
            );

            await messageManager.handleMessage(message);

            expect(
                messageManager.attachmentManager.processAttachments
            ).toHaveBeenCalledWith(expect.any(Collection));
        });
    });

    describe("State and response handling", () => {
        it("should respect muted state in channels", async () => {
            mockRuntime.databaseAdapter.getParticipantUserState.mockResolvedValue(
                "MUTED"
            );

            const message = createMockDiscordMessage({
                content: "Message in muted channel",
            });

            await messageManager.handleMessage(message);

            expect(elizaosCore.generateMessageResponse).not.toHaveBeenCalled();
        });
    });

    describe("Error handling", () => {
        it("should handle text channel errors appropriately", async () => {
            const message = createMockDiscordMessage();
            mockRuntime.messageManager.createMemory.mockRejectedValue(
                new Error("Test error")
            );

            await messageManager.handleMessage(message);

            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error handling message:",
                expect.any(Error)
            );
        });
    });
});
