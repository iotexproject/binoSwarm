import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageManager } from "../src/messageManager";
import { IAgentRuntime } from "@elizaos/core";
import * as Core from "@elizaos/core";
import { Context, Telegraf } from "telegraf";
import { Message } from "@telegraf/types";

// Mock Telegraf
vi.mock("telegraf", () => {
    return {
        Telegraf: vi.fn().mockImplementation(() => ({
            telegram: {
                sendMessage: vi
                    .fn()
                    .mockImplementation(async (_chatId: any, text: any) => ({
                        message_id: Math.floor(Math.random() * 100000),
                        text,
                        date: Math.floor(Date.now() / 1000),
                    })),
                sendChatAction: vi.fn().mockResolvedValue(true),
                sendPhoto: vi.fn().mockResolvedValue({
                    message_id: 124,
                    date: Math.floor(Date.now() / 1000),
                }),
                getFileLink: vi
                    .fn()
                    .mockResolvedValue(new URL("https://example.com/file.jpg")),
            },
        })),
    };
});

// Mock fs module for image handling
vi.mock("fs", () => ({
    default: {
        existsSync: vi.fn().mockReturnValue(true),
        createReadStream: vi.fn().mockReturnValue({}),
    },
}));

describe("MessageManager", () => {
    let mockRuntime: IAgentRuntime;
    let mockBot: Telegraf<Context>;
    let messageManager: MessageManager;
    const CHAT_ID = 123456789;

    beforeEach(() => {
        mockRuntime = {
            getSetting: vi.fn(),
            getCharacter: vi.fn(),
            getFlow: vi.fn(),
            getPlugin: vi.fn(),
            getPlugins: vi.fn(),
            getSafePlugins: vi.fn(),
            hasPlugin: vi.fn(),
            registerPlugin: vi.fn(),
            removePlugin: vi.fn(),
            setCharacter: vi.fn(),
            setFlow: vi.fn(),
        } as unknown as IAgentRuntime;

        mockBot = new Telegraf("mock_token") as any;
        messageManager = new MessageManager(mockBot, mockRuntime);
        vi.clearAllMocks();
    });

    describe("message sending", () => {
        it("should send a message successfully", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as Context;

            const content = { text: "Test message" };
            const result = await (messageManager as any).sendMessageInChunks(
                ctx,
                content
            );

            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                CHAT_ID,
                content.text,
                expect.objectContaining({
                    parse_mode: "Markdown",
                })
            );
            expect(result[0].message_id).toEqual(expect.any(Number));
        });

        it("should split long messages", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as Context;

            // Create a message that's just over 4096 characters (Telegram's limit)
            const message1 = "a".repeat(4096);
            const message2 = "b".repeat(100);
            const content = { text: `${message1}\n${message2}` };
            await (messageManager as any).sendMessageInChunks(ctx, content);

            expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(2);
            expect(mockBot.telegram.sendMessage).toHaveBeenNthCalledWith(
                1,
                CHAT_ID,
                message1,
                expect.objectContaining({ parse_mode: "Markdown" })
            );
            expect(mockBot.telegram.sendMessage).toHaveBeenNthCalledWith(
                2,
                CHAT_ID,
                message2,
                expect.objectContaining({ parse_mode: "Markdown" })
            );
        });
    });

    describe("image handling", () => {
        it("should send an image from URL", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as Context;

            const imageUrl = "https://example.com/image.jpg";
            await (messageManager as any).sendImage(ctx, imageUrl);

            expect(mockBot.telegram.sendPhoto).toHaveBeenCalledWith(
                CHAT_ID,
                imageUrl,
                expect.any(Object)
            );
        });

        it("should send an image from local file", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as Context;

            const localPath = "/path/to/image.jpg";
            await (messageManager as any).sendImage(ctx, localPath);

            expect(mockBot.telegram.sendPhoto).toHaveBeenCalledWith(
                CHAT_ID,
                expect.objectContaining({ source: expect.any(Object) }),
                expect.any(Object)
            );
        });
    });

    describe("error handling", () => {
        it("should handle send message errors", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as Context;

            const error = new Error("Network error");
            (mockBot.telegram.sendMessage as any).mockRejectedValueOnce(error);

            await expect(
                (messageManager as any).sendMessageInChunks(ctx, {
                    text: "test",
                })
            ).rejects.toThrow("Network error");
        });

        it("should handle image send errors", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as Context;

            const error = new Error("Image send failed");
            (mockBot.telegram.sendPhoto as any).mockRejectedValueOnce(error);

            await (messageManager as any).sendImage(ctx, "test.jpg");
            // Should not throw, but log error
            expect(mockBot.telegram.sendPhoto).toHaveBeenCalled();
        });
    });

    describe("handleMessage - positive flow", () => {
        it("processes a text message end-to-end and sends a response", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID, type: "private" },
                from: { id: 987654321, username: "alice", is_bot: false },
                message: {
                    message_id: 345,
                    date: Math.floor(Date.now() / 1000),
                    text: "Hello there",
                },
            } as unknown as Context;

            // External dependency: model response
            vi.spyOn(Core as any, "generateMessageResponse").mockResolvedValue({
                text: "Hi!",
            });
            vi.spyOn(messageManager as any, "_shouldRespond").mockResolvedValue(
                true
            );

            // Runtime expectations/mocks
            const createMemorySpy = vi.fn().mockResolvedValue(undefined);
            (mockRuntime as any).agentId = "agent-123";
            (mockRuntime as any).character = {
                clientConfig: { telegram: {} },
                templates: {},
            };
            (mockRuntime as any).messageManager = {
                createMemory: createMemorySpy,
                getMemories: vi.fn().mockResolvedValue([]),
            };
            (mockRuntime as any).ensureConnection = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).composeState = vi.fn().mockResolvedValue({});
            (mockRuntime as any).updateRecentMessageState = vi
                .fn()
                .mockResolvedValue({});
            (mockRuntime as any).processActions = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).evaluate = vi
                .fn()
                .mockResolvedValue(undefined);

            await messageManager.handleMessage(ctx);

            // Ensure connection was established
            expect((mockRuntime as any).ensureConnection).toHaveBeenCalledTimes(
                1
            );

            // Initial memory created for incoming message
            expect(createMemorySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    memory: expect.objectContaining({
                        content: expect.objectContaining({
                            text: "Hello there",
                            source: "telegram",
                        }),
                        createdAt: expect.any(Number),
                    }),
                    isUnique: true,
                })
            );

            // Memory created for the outgoing response (second call)
            expect(createMemorySpy.mock.calls.length).toBeGreaterThanOrEqual(2);
            const responseCallArg = createMemorySpy.mock.calls[1][0];
            expect(responseCallArg).toEqual(
                expect.objectContaining({
                    memory: expect.objectContaining({
                        content: expect.objectContaining({
                            text: "Hi!",
                            inReplyTo: expect.anything(),
                        }),
                    }),
                    isUnique: true,
                })
            );

            // State updates and action processing occurred
            expect(
                (mockRuntime as any).updateRecentMessageState
            ).toHaveBeenCalledTimes(2);
            expect((mockRuntime as any).processActions).toHaveBeenCalledTimes(
                1
            );
            expect((mockRuntime as any).evaluate).toHaveBeenCalledTimes(1);
        });
    });

    describe("handleMessage - branching", () => {
        it("returns early when ctx.message or ctx.from is missing (lines 424-425)", async () => {
            (mockRuntime as any).ensureConnection = vi.fn();
            (mockRuntime as any).composeState = vi.fn();
            (mockRuntime as any).updateRecentMessageState = vi.fn();
            (mockRuntime as any).processActions = vi.fn();
            (mockRuntime as any).evaluate = vi.fn();
            (mockRuntime as any).messageManager = {
                createMemory: vi.fn(),
            };

            // Missing message
            const ctxNoMessage = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID, type: "group" },
                from: { id: 1, username: "user1", is_bot: false },
            } as unknown as Context;
            await messageManager.handleMessage(ctxNoMessage);

            expect(
                (mockRuntime as any).ensureConnection
            ).not.toHaveBeenCalled();
            expect(
                (mockRuntime as any).messageManager.createMemory
            ).not.toHaveBeenCalled();

            // Missing from
            const ctxNoFrom = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID, type: "group" },
                message: {
                    message_id: 1,
                    date: Math.floor(Date.now() / 1000),
                    text: "x",
                },
            } as unknown as Context;
            await messageManager.handleMessage(ctxNoFrom);

            expect(
                (mockRuntime as any).ensureConnection
            ).not.toHaveBeenCalled();
            expect(
                (mockRuntime as any).messageManager.createMemory
            ).not.toHaveBeenCalled();
        });

        it("returns early when out of scope (lines 449-450)", async () => {
            // Configure runtime to ignore bot messages so isOutOfScope returns true
            (mockRuntime as any).character = {
                clientConfig: { telegram: { shouldIgnoreBotMessages: true } },
            };
            (mockRuntime as any).ensureConnection = vi.fn();
            (mockRuntime as any).messageManager = { createMemory: vi.fn() };

            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID, type: "group" },
                from: { id: 2, username: "botty", is_bot: true },
                message: {
                    message_id: 11,
                    date: Math.floor(Date.now() / 1000),
                    text: "ignored",
                },
            } as unknown as Context;

            await messageManager.handleMessage(ctx);

            expect(
                (mockRuntime as any).ensureConnection
            ).not.toHaveBeenCalled();
            expect(
                (mockRuntime as any).messageManager.createMemory
            ).not.toHaveBeenCalled();
        });

        it("uses caption when present (lines 467-468) and proceeds through positive flow", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID, type: "group" },
                from: { id: 3, username: "carol", is_bot: false },
                message: {
                    message_id: 456,
                    date: Math.floor(Date.now() / 1000),
                    caption: "A caption only",
                },
            } as unknown as Context;

            // Drive positive path
            vi.spyOn(messageManager as any, "_shouldRespond").mockResolvedValue(
                true
            );
            vi.spyOn(
                messageManager as any,
                "_generateResponse"
            ).mockResolvedValue({ text: "Response" });
            vi.spyOn(
                messageManager as any,
                "sendMessageInChunks"
            ).mockResolvedValue([
                {
                    message_id: 888,
                    date: Math.floor(Date.now() / 1000),
                    text: "Response",
                } as any,
            ]);

            const createMemorySpy = vi.fn().mockResolvedValue(undefined);
            (mockRuntime as any).agentId = "agent-xyz";
            (mockRuntime as any).character = {
                clientConfig: { telegram: {} },
                templates: {},
            };
            (mockRuntime as any).messageManager = {
                createMemory: createMemorySpy,
                getMemories: vi.fn().mockResolvedValue([]),
            };
            (mockRuntime as any).ensureConnection = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).composeState = vi.fn().mockResolvedValue({});
            (mockRuntime as any).updateRecentMessageState = vi
                .fn()
                .mockResolvedValue({});
            (mockRuntime as any).processActions = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).evaluate = vi
                .fn()
                .mockResolvedValue(undefined);

            await messageManager.handleMessage(ctx);

            // First memory should reflect caption as text
            const firstCallArg = createMemorySpy.mock.calls[0][0];
            expect(firstCallArg.memory.content.text).toBe("A caption only");

            // Response path taken
            expect(
                (messageManager as any).sendMessageInChunks
            ).toHaveBeenCalledWith(ctx, { text: "Response" }, 456);
        });

        it("appends image description to text when imageInfo is present (line 472)", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID, type: "private" },
                from: { id: 6, username: "frank", is_bot: false },
                message: {
                    message_id: 44,
                    date: Math.floor(Date.now() / 1000),
                    text: "Hello",
                    photo: [{ file_id: "file123" }],
                },
            } as unknown as Context;

            const createMemorySpy = vi.fn().mockResolvedValue(undefined);
            (mockRuntime as any).agentId = "agent-image";
            (mockRuntime as any).character = {
                clientConfig: { telegram: {} },
                templates: {},
            };
            (mockRuntime as any).messageManager = {
                createMemory: createMemorySpy,
                getMemories: vi.fn().mockResolvedValue([]),
            };
            (mockRuntime as any).ensureConnection = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).composeState = vi.fn().mockResolvedValue({});
            (mockRuntime as any).updateRecentMessageState = vi
                .fn()
                .mockResolvedValue({});
            (mockRuntime as any).processActions = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).evaluate = vi
                .fn()
                .mockResolvedValue(undefined);

            // Provide bot info and image service so processImage works without mocking
            (mockBot as any).botInfo = { id: 42, username: "bot" };
            const imageService = {
                describeImage: vi
                    .fn()
                    .mockResolvedValue({ title: "Title", description: "Desc" }),
            };
            (mockRuntime as any).getService = vi
                .fn()
                .mockReturnValue(imageService);
            vi.spyOn(Core as any, "generateMessageResponse").mockResolvedValue({
                text: "ok",
            });

            await messageManager.handleMessage(ctx);

            const firstCallArg = createMemorySpy.mock.calls[0][0];
            expect(firstCallArg.memory.content.text).toBe(
                "Hello [Image: Title\nDesc]"
            );
        });

        it("returns early when fullText is empty (lines 476-477)", async () => {
            const createMemorySpy = vi.fn();
            (mockRuntime as any).messageManager = {
                createMemory: createMemorySpy,
            };
            (mockRuntime as any).ensureConnection = vi.fn();
            (mockRuntime as any).character = {
                clientConfig: { telegram: {} },
                templates: {},
            };
            (mockRuntime as any).composeState = vi.fn();

            vi.spyOn(messageManager as any, "processImage").mockResolvedValue(
                null
            );
            vi.spyOn(messageManager as any, "_shouldRespond");

            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID, type: "group" },
                from: { id: 7, username: "gary", is_bot: false },
                message: {
                    message_id: 55,
                    date: Math.floor(Date.now() / 1000),
                    // no text, no caption
                },
            } as unknown as Context;

            await messageManager.handleMessage(ctx);

            expect((mockRuntime as any).ensureConnection).toHaveBeenCalledTimes(
                1
            );
            expect(createMemorySpy).not.toHaveBeenCalled();
            expect((mockRuntime as any).composeState).not.toHaveBeenCalled();
            expect(
                (messageManager as any)._shouldRespond
            ).not.toHaveBeenCalled();
        });

        it("sets inReplyTo when replying to a message (lines 485-489)", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID, type: "group" },
                from: { id: 8, username: "harry", is_bot: false },
                message: {
                    message_id: 66,
                    date: Math.floor(Date.now() / 1000),
                    text: "replying",
                    reply_to_message: { message_id: 99 },
                },
            } as unknown as Context;

            vi.spyOn(messageManager as any, "processImage").mockResolvedValue(
                null
            );
            vi.spyOn(messageManager as any, "_shouldRespond").mockResolvedValue(
                false
            );

            const createMemorySpy = vi.fn().mockResolvedValue(undefined);
            (mockRuntime as any).agentId = "agent-reply";
            (mockRuntime as any).character = {
                clientConfig: { telegram: {} },
                templates: {},
            };
            (mockRuntime as any).messageManager = {
                createMemory: createMemorySpy,
            };
            (mockRuntime as any).ensureConnection = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).composeState = vi.fn().mockResolvedValue({});
            (mockRuntime as any).updateRecentMessageState = vi
                .fn()
                .mockResolvedValue({});

            await messageManager.handleMessage(ctx);

            const firstCallArg = createMemorySpy.mock.calls[0][0];
            expect(firstCallArg.memory.content.inReplyTo).toBeDefined();
        });

        it("marks intermediate chunks CONTINUE and last chunk keeps action (line 563)", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID, type: "group" },
                from: { id: 9, username: "ivy", is_bot: false },
                message: {
                    message_id: 77,
                    date: Math.floor(Date.now() / 1000),
                    text: "trigger",
                },
            } as unknown as Context;

            vi.spyOn(messageManager as any, "processImage").mockResolvedValue(
                null
            );
            vi.spyOn(messageManager as any, "_shouldRespond").mockResolvedValue(
                true
            );
            vi.spyOn(
                messageManager as any,
                "_generateResponse"
            ).mockResolvedValue({ text: "resp", action: "DONE" });
            vi.spyOn(
                messageManager as any,
                "sendMessageInChunks"
            ).mockResolvedValue([
                {
                    message_id: 2001,
                    date: Math.floor(Date.now() / 1000),
                    text: "part1",
                } as any,
                {
                    message_id: 2002,
                    date: Math.floor(Date.now() / 1000),
                    text: "part2",
                } as any,
            ]);

            const createMemorySpy = vi.fn().mockResolvedValue(undefined);
            (mockRuntime as any).agentId = "agent-chunks";
            (mockRuntime as any).character = {
                clientConfig: { telegram: {} },
                templates: {},
            };
            (mockRuntime as any).messageManager = {
                createMemory: createMemorySpy,
                getMemories: vi.fn().mockResolvedValue([]),
            };
            (mockRuntime as any).ensureConnection = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).composeState = vi.fn().mockResolvedValue({});
            (mockRuntime as any).updateRecentMessageState = vi
                .fn()
                .mockResolvedValue({});
            (mockRuntime as any).processActions = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).evaluate = vi
                .fn()
                .mockResolvedValue(undefined);

            await messageManager.handleMessage(ctx);

            // First createMemory call is for the incoming message; next two are for response chunks
            const firstResponse = createMemorySpy.mock.calls[1][0].memory;
            const secondResponse = createMemorySpy.mock.calls[2][0].memory;
            expect(firstResponse.content.action).toBe("CONTINUE");
            expect(secondResponse.content.action).toBe("DONE");
            expect(firstResponse.content.inReplyTo).toBeDefined();
            expect(secondResponse.content.inReplyTo).toBeDefined();
        });

        it("returns early when response content is missing (lines 596-597)", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID, type: "private" },
                from: { id: 10, username: "jane", is_bot: false },
                message: {
                    message_id: 88,
                    date: Math.floor(Date.now() / 1000),
                    text: "hello",
                },
            } as unknown as Context;

            // Don't mock private methods; use private chat to force response logic path
            vi.spyOn(Core as any, "generateMessageResponse").mockResolvedValue(
                undefined
            );
            const sendSpy = vi.spyOn(
                messageManager as any,
                "sendMessageInChunks"
            );

            const createMemorySpy = vi.fn().mockResolvedValue(undefined);
            (mockRuntime as any).agentId = "agent-empty";
            (mockRuntime as any).character = {
                clientConfig: { telegram: {} },
                templates: {},
            };
            (mockRuntime as any).messageManager = {
                createMemory: createMemorySpy,
            };
            (mockRuntime as any).ensureConnection = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).composeState = vi.fn().mockResolvedValue({});
            (mockRuntime as any).updateRecentMessageState = vi
                .fn()
                .mockResolvedValue({});
            (mockRuntime as any).processActions = vi
                .fn()
                .mockResolvedValue(undefined);
            (mockRuntime as any).evaluate = vi
                .fn()
                .mockResolvedValue(undefined);

            await messageManager.handleMessage(ctx);

            expect(createMemorySpy).toHaveBeenCalledTimes(1); // only the incoming memory
            expect(sendSpy).not.toHaveBeenCalled();
            expect((mockRuntime as any).processActions).not.toHaveBeenCalled();
            expect(
                (mockRuntime as any).updateRecentMessageState
            ).toHaveBeenCalledTimes(1); // only before response block
            // Early return prevents evaluate
            expect((mockRuntime as any).evaluate).not.toHaveBeenCalled();
        });
    });
});
