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
            __handlers: {} as Record<string, Function>,
            command: vi.fn(function (
                this: any,
                cmd: string,
                handler: Function
            ) {
                this.__handlers[cmd] = handler;
            }),
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
                sendAnimation: vi.fn().mockResolvedValue({
                    message_id: 125,
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

    describe("animation handling", () => {
        it("should send an animation from URL", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as Context;

            const url = "https://example.com/anim.gif";
            await (messageManager as any).sendAnimation(ctx, url, "cap");

            expect(mockBot.telegram.sendAnimation).toHaveBeenCalledWith(
                CHAT_ID,
                url,
                expect.objectContaining({ caption: "cap" })
            );
        });

        it("should send an animation from local file", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as Context;

            const localPath = "/path/to/anim.gif";
            await (messageManager as any).sendAnimation(ctx, localPath);

            expect(mockBot.telegram.sendAnimation).toHaveBeenCalledWith(
                CHAT_ID,
                expect.objectContaining({ source: expect.any(Object) }),
                expect.any(Object)
            );
        });

        it("should catch errors when sending animation fails", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as Context;

            (mockBot.telegram.sendAnimation as any).mockRejectedValueOnce(
                new Error("anim fail")
            );

            await (messageManager as any).sendAnimation(ctx, "/bad/path.gif");
            expect(mockBot.telegram.sendAnimation).toHaveBeenCalled();
        });
    });

    describe("_analyzeContextSimilarity", () => {
        it("returns 1 when previousContext is missing (line 69)", async () => {
            const res = await (messageManager as any)._analyzeContextSimilarity(
                "now",
                undefined,
                undefined
            );
            expect(res).toBe(1);
        });

        it("computes similarity * timeWeight (approximately)", async () => {
            const spy = vi
                .spyOn(Core as any, "cosineSimilarity")
                .mockReturnValue(0.8);
            const ts = Date.now();
            const res = await (messageManager as any)._analyzeContextSimilarity(
                "Current",
                { content: "Previous", timestamp: ts },
                "AgentLast"
            );
            expect(res).toBeLessThanOrEqual(0.8);
            expect(res).toBeGreaterThan(0.6);
            spy.mockRestore();
        });
    });

    describe("processImage document and error paths", () => {
        it("describes image from document mime", async () => {
            (mockBot as any).botInfo = { id: 2, username: "bot" };
            const docMsg = {
                document: { file_id: "doc123", mime_type: "image/png" },
            } as unknown as Message;
            const imageService = {
                describeImage: vi
                    .fn()
                    .mockResolvedValue({ title: "T", description: "D" }),
            };
            (mockRuntime as any).getService = vi
                .fn()
                .mockReturnValue(imageService);

            const res = await (messageManager as any).processImage(docMsg);
            expect(res).toEqual([
                expect.objectContaining({
                    source: "Telegram",
                    text: "D",
                    title: "T",
                    description: "D",
                    url: "https://example.com/file.jpg",
                }),
            ]);
            expect(mockBot.telegram.getFileLink).toHaveBeenCalledWith("doc123");
        });

        it("returns empty array on error", async () => {
            (mockBot.telegram.getFileLink as any).mockRejectedValueOnce(
                new Error("boom")
            );
            const msg = {
                photo: [{ file_id: "x" }],
            } as unknown as Message;

            const res = await (messageManager as any).processImage(msg);
            expect(res).toEqual([]);
        });
    });

    describe("_shouldRespond", () => {
        const baseState = {} as any;
        const baseMemory = {
            id: "m1",
            content: { text: "t" },
        } as any;

        beforeEach(() => {
            (mockRuntime as any).agentId = "agent-SR";
            (mockRuntime as any).character = {
                clientConfig: { telegram: {} },
                templates: {},
            };
        });

        it("delegates to _isMessageForMe when mentions-only is true", async () => {
            (
                mockRuntime as any
            ).character.clientConfig.telegram.shouldRespondOnlyToMentions =
                true;
            vi.spyOn(messageManager as any, "_isMessageForMe").mockReturnValue(
                true
            );
            const message = { chat: { type: "group" }, text: "x" } as any;
            const res = await (messageManager as any)._shouldRespond(
                message,
                baseState,
                baseMemory
            );
            expect(res).toBe(true);
        });

        it("returns true when bot is mentioned", async () => {
            (mockBot as any).botInfo = { username: "botu" };
            const message = {
                chat: { type: "group" },
                text: "hello @botu",
            } as any;
            const res = await (messageManager as any)._shouldRespond(
                message,
                baseState,
                baseMemory
            );
            expect(res).toBe(true);
        });

        it("returns true for private chat", async () => {
            const message = { chat: { type: "private" } } as any;
            const res = await (messageManager as any)._shouldRespond(
                message,
                baseState,
                baseMemory
            );
            expect(res).toBe(true);
        });

        it("returns false for images in group chats", async () => {
            const photoMsg = {
                chat: { type: "group" },
                photo: [{ file_id: "p" }],
            } as any;
            const res1 = await (messageManager as any)._shouldRespond(
                photoMsg,
                baseState,
                baseMemory
            );
            expect(res1).toBe(false);

            const docMsg = {
                chat: { type: "group" },
                document: { mime_type: "image/jpeg" },
            } as any;
            const res2 = await (messageManager as any)._shouldRespond(
                docMsg,
                baseState,
                baseMemory
            );
            expect(res2).toBe(false);
        });

        it("checks chatState currentHandler context and returns false when context says no", async () => {
            const chatId = 321;
            const message = {
                chat: { id: chatId, type: "group" },
                text: "x",
            } as any;
            (messageManager as any).interestChats[chatId.toString()] = {
                currentHandler: "123", // different from bot id initially
            };
            // set bot id to match, to enter branch
            (mockBot as any).botInfo = { id: 123, username: "u" };
            vi.spyOn(
                messageManager as any,
                "_shouldRespondBasedOnContext"
            ).mockResolvedValue(false);

            const res = await (messageManager as any)._shouldRespond(
                message,
                baseState,
                baseMemory
            );
            expect(res).toBe(false);
        });

        it("AI decision path returns RESPOND and DO_NOT_RESPOND", async () => {
            const message = {
                chat: { id: 7, type: "group" },
                text: "x",
            } as any;
            vi.spyOn(
                messageManager as any,
                "_shouldRespondBasedOnContext"
            ).mockResolvedValue(true);
            (messageManager as any).interestChats["7"] = {
                currentHandler: (mockBot as any).botInfo?.id?.toString?.(),
            } as any;

            const shouldRespondSpy = vi
                .spyOn(Core as any, "generateShouldRespond")
                .mockResolvedValueOnce("RESPOND")
                .mockResolvedValueOnce("DO_NOT_RESPOND");

            const res1 = await (messageManager as any)._shouldRespond(
                message,
                baseState,
                baseMemory
            );
            const res2 = await (messageManager as any)._shouldRespond(
                message,
                baseState,
                baseMemory
            );
            expect(res1).toBe(true);
            expect(res2).toBe(false);
            shouldRespondSpy.mockRestore();
        });
    });

    describe("sendMessageInChunks with attachments", () => {
        it("routes gif to sendAnimation and images to sendImage", async () => {
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as any;
            const animSpy = vi
                .spyOn(messageManager as any, "sendAnimation")
                .mockResolvedValue(undefined);
            const imgSpy = vi
                .spyOn(messageManager as any, "sendImage")
                .mockResolvedValue(undefined);
            const content = {
                text: "ignored",
                attachments: [
                    { contentType: "image/gif", url: "u1", description: "d1" },
                    { contentType: "image/png", url: "u2", description: "d2" },
                ],
            } as any;

            await (messageManager as any).sendMessageInChunks(ctx, content);
            expect(animSpy).toHaveBeenCalledWith(ctx, "u1", "d1");
            expect(imgSpy).toHaveBeenCalledWith(ctx, "u2", "d2");
        });
    });

    describe("file-not-found branches in sendImage/sendAnimation", () => {
        it("sendImage logs error when file missing", async () => {
            const existsSpy = (await import("fs")).default.existsSync as any;
            existsSpy.mockReturnValueOnce(false);
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as any;
            await (messageManager as any).sendImage(ctx, "/no/such.jpg");
            expect(mockBot.telegram.sendPhoto).not.toHaveBeenCalledWith(
                CHAT_ID,
                expect.anything(),
                expect.anything()
            );
        });

        it("sendAnimation logs error when file missing", async () => {
            const existsSpy = (await import("fs")).default.existsSync as any;
            existsSpy.mockReturnValueOnce(false);
            const ctx = {
                telegram: mockBot.telegram,
                chat: { id: CHAT_ID },
            } as any;
            await (messageManager as any).sendAnimation(ctx, "/no/such.gif");
            expect(mockBot.telegram.sendAnimation).not.toHaveBeenCalledWith(
                CHAT_ID,
                expect.anything(),
                expect.anything()
            );
        });
    });

    describe("isOutOfScope", () => {
        it("ignores direct messages when configured", () => {
            (mockRuntime as any).character = {
                clientConfig: {
                    telegram: { shouldIgnoreDirectMessages: true },
                },
            } as any;
            const ctx = {
                chat: { type: "private" },
                from: { is_bot: false },
            } as any;
            const res = (messageManager as any).isOutOfScope(ctx);
            expect(res).toBe(true);
        });
    });

    describe("initializeCommands and start command", () => {
        it("catches errors during initializeCommands", () => {
            const badBot = new (Telegraf as any)("t");
            badBot.command = vi.fn(() => {
                throw new Error("cmd fail");
            });
            // Should not throw
            new MessageManager(badBot, mockRuntime);
        });

        it("handleStartCommand sends welcome in private chat", async () => {
            (mockBot as any).botInfo = { username: "welcomebot" };
            const ctx = {
                chat: { type: "private" },
                sendMessage: vi.fn().mockResolvedValue(undefined),
                botInfo: (mockBot as any).botInfo,
            } as any;
            await (messageManager as any).handleStartCommand(ctx);
            expect(ctx.sendMessage).toHaveBeenCalledWith(
                "Welcome to " +
                    "welcomebot" +
                    "! Let's the DePIN revolution begin!"
            );
        });

        it("handleStartCommand catches error", async () => {
            const ctx = {
                chat: { type: "private" },
                sendMessage: vi.fn().mockRejectedValue(new Error("send fail")),
                botInfo: { username: "x" },
            } as any;
            await (messageManager as any).handleStartCommand(ctx);
            expect(ctx.sendMessage).toHaveBeenCalled();
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
            ).toHaveBeenCalledTimes(1);
            expect((mockRuntime as any).processActions).toHaveBeenCalledTimes(
                1
            );
            expect((mockRuntime as any).evaluate).toHaveBeenCalledTimes(1);
        });
    });

    describe("handleMessage - branching", () => {
        it("returns early when ctx.message or ctx.from is missing", async () => {
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

        it("returns early when out of scope", async () => {
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

        it("uses caption when present and proceeds through positive flow", async () => {
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

        it("appends image description to text when imageInfo is present", async () => {
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
            expect(firstCallArg.memory.content.attachments[0].text).toBe(
                "Desc"
            );
        });

        it("sets inReplyTo when replying to a message", async () => {
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

        it("returns early when response content is missing", async () => {
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
            // Early return prevents evaluate
            expect((mockRuntime as any).evaluate).not.toHaveBeenCalled();
        });
    });

    describe("_shouldRespondBasedOnContext", () => {
        beforeEach(() => {
            (mockRuntime as any).agentId = "agent-ctx";
            (mockRuntime as any).character = {
                clientConfig: { telegram: {} },
                templates: {},
            };
            (mockRuntime as any).messageManager = {
                getMemories: vi.fn().mockResolvedValue([]),
            };
            (mockBot as any).botInfo = { id: 999, username: "botname" };
        });

        it("returns false when message has no text or caption", async () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                photo: [{ file_id: "x" }],
            } as unknown as Message;

            const chatState: any = {
                currentHandler: (mockBot as any).botInfo.id.toString(),
                messages: [],
            };

            const res = await (
                messageManager as any
            )._shouldRespondBasedOnContext(message, chatState);
            expect(res).toBe(false);
        });

        it("returns true when bot is explicitly targeted", async () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "@botname hi",
            } as unknown as Message;

            const chatState: any = {
                currentHandler: (mockBot as any).botInfo.id.toString(),
                messages: [
                    { userId: "u1", content: { text: "hello" } },
                    { userId: "u2", content: { text: "world" } },
                ],
            };

            vi.spyOn(messageManager as any, "_isMessageForMe").mockReturnValue(
                true
            );
            const res = await (
                messageManager as any
            )._shouldRespondBasedOnContext(message, chatState);
            expect(res).toBe(true);
        });

        it("returns false when not current handler", async () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "hello",
            } as unknown as Message;

            const chatState: any = {
                currentHandler: "someone-else",
                messages: [{ userId: "u1", content: { text: "hello" } }],
            };

            vi.spyOn(messageManager as any, "_isMessageForMe").mockReturnValue(
                false
            );
            const res = await (
                messageManager as any
            )._shouldRespondBasedOnContext(message, chatState);
            expect(res).toBe(false);
        });

        it("returns false when there are no prior messages", async () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "hello",
            } as unknown as Message;

            const chatState: any = {
                currentHandler: (mockBot as any).botInfo.id.toString(),
                messages: [],
            };

            vi.spyOn(messageManager as any, "_isMessageForMe").mockReturnValue(
                false
            );
            const res = await (
                messageManager as any
            )._shouldRespondBasedOnContext(message, chatState);
            expect(res).toBe(false);
        });

        it("returns false when no last user message is found", async () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "current",
            } as unknown as Message;

            const chatState: any = {
                currentHandler: (mockBot as any).botInfo.id.toString(),
                messages: [
                    {
                        userId: (mockRuntime as any).agentId,
                        content: { text: "curr" },
                    },
                    {
                        userId: (mockRuntime as any).agentId,
                        content: { text: "prev" },
                    },
                ],
            };

            vi.spyOn(messageManager as any, "_isMessageForMe").mockReturnValue(
                false
            );
            const res = await (
                messageManager as any
            )._shouldRespondBasedOnContext(message, chatState);
            expect(res).toBe(false);
        });

        it("returns true when similarity >= threshold", async () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "current message",
            } as unknown as Message;

            const chatState: any = {
                currentHandler: (mockBot as any).botInfo.id.toString(),
                contextSimilarityThreshold: 0.5,
                messages: [
                    { userId: "u3", content: { text: "current message" } },
                    { userId: "u4", content: { text: "previous message" } },
                ],
            };

            vi.spyOn(messageManager as any, "_isMessageForMe").mockReturnValue(
                false
            );
            vi.spyOn(
                messageManager as any,
                "_analyzeContextSimilarity"
            ).mockResolvedValue(0.9);

            const res = await (
                messageManager as any
            )._shouldRespondBasedOnContext(message, chatState);
            expect(res).toBe(true);
        });

        it("returns false when similarity < threshold", async () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "current message",
            } as unknown as Message;

            const chatState: any = {
                currentHandler: (mockBot as any).botInfo.id.toString(),
                contextSimilarityThreshold: 0.8,
                messages: [
                    { userId: "u3", content: { text: "current message" } },
                    { userId: "u4", content: { text: "previous message" } },
                ],
            };

            vi.spyOn(messageManager as any, "_isMessageForMe").mockReturnValue(
                false
            );
            vi.spyOn(
                messageManager as any,
                "_analyzeContextSimilarity"
            ).mockResolvedValue(0.5);

            const res = await (
                messageManager as any
            )._shouldRespondBasedOnContext(message, chatState);
            expect(res).toBe(false);
        });

        it("uses runtime messageSimilarityThreshold when chatState threshold is absent (line 137)", async () => {
            (mockRuntime as any).character = {
                clientConfig: { telegram: { messageSimilarityThreshold: 0.7 } },
                templates: {},
            };
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "current message",
            } as unknown as Message;

            const chatState: any = {
                currentHandler: (mockBot as any).botInfo.id.toString(),
                messages: [
                    { userId: "u3", content: { text: "current message" } },
                    { userId: "u4", content: { text: "previous message" } },
                ],
            };

            vi.spyOn(messageManager as any, "_isMessageForMe").mockReturnValue(
                false
            );
            vi.spyOn(
                messageManager as any,
                "_analyzeContextSimilarity"
            ).mockResolvedValue(0.71);

            const res = await (
                messageManager as any
            )._shouldRespondBasedOnContext(message, chatState);
            expect(res).toBe(true);
        });

        it("accepts caption as message text source", async () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                caption: "caption content",
            } as unknown as Message;

            const chatState: any = {
                currentHandler: (mockBot as any).botInfo.id.toString(),
                messages: [
                    { userId: "u3", content: { text: "caption content" } },
                    { userId: "u4", content: { text: "previous" } },
                ],
            };

            vi.spyOn(messageManager as any, "_isMessageForMe").mockReturnValue(
                false
            );
            vi.spyOn(
                messageManager as any,
                "_analyzeContextSimilarity"
            ).mockResolvedValue(1);

            const res = await (
                messageManager as any
            )._shouldRespondBasedOnContext(message, chatState);
            expect(res).toBe(true);
        });
    });

    describe("_isMessageForMe", () => {
        beforeEach(() => {
            (mockRuntime as any).agentId = "agent-msg";
            (mockRuntime as any).character = {
                clientConfig: {
                    telegram: { shouldRespondOnlyToMentions: false },
                },
                templates: {},
            };
            (mockBot as any).botInfo = { id: 1, username: "testbot" };
        });

        it("returns false when bot username is missing", () => {
            (mockBot as any).botInfo = undefined;
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "hi",
            } as unknown as Message;

            const res = (messageManager as any)._isMessageForMe(message);
            expect(res).toBe(false);
        });

        it("returns false when message has no text or caption", () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                photo: [{ file_id: "p" }],
            } as unknown as Message;

            const res = (messageManager as any)._isMessageForMe(message);
            expect(res).toBe(false);
        });

        it("returns true when replying to the bot", () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "irrelevant",
                reply_to_message: {
                    from: { is_bot: true, username: "testbot" },
                },
            } as unknown as Message;

            const res = (messageManager as any)._isMessageForMe(message);
            expect(res).toBe(true);
        });

        it("returns true when mentioned with @username", () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "hello @testbot",
            } as unknown as Message;

            const res = (messageManager as any)._isMessageForMe(message);
            expect(res).toBe(true);
        });

        it("treats caption as message text for mention detection", () => {
            const message = {
                chat: { id: CHAT_ID, type: "group" },
                caption: "hello @testbot",
            } as unknown as Message;

            const res = (messageManager as any)._isMessageForMe(message);
            expect(res).toBe(true);
        });

        it("returns true for private chats", () => {
            const message = {
                chat: { id: CHAT_ID, type: "private" },
                text: "hello",
            } as unknown as Message;

            const res = (messageManager as any)._isMessageForMe(message);
            expect(res).toBe(true);
        });

        it("respects shouldRespondOnlyToMentions=true in groups", () => {
            (mockRuntime as any).character = {
                clientConfig: {
                    telegram: { shouldRespondOnlyToMentions: true },
                },
                templates: {},
            };

            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "hello there",
            } as unknown as Message;

            const res = (messageManager as any)._isMessageForMe(message);
            expect(res).toBe(false);
        });

        it("returns true when username appears (case-insensitive) and mentions-only is false", () => {
            (mockRuntime as any).character = {
                clientConfig: {
                    telegram: { shouldRespondOnlyToMentions: false },
                },
                templates: {},
            };

            const message = {
                chat: { id: CHAT_ID, type: "group" },
                text: "Hey TestBot, how's it going?",
            } as unknown as Message;

            const res = (messageManager as any)._isMessageForMe(message);
            expect(res).toBe(true);
        });

        it("returns true when chat type is undefined (line 169)", () => {
            const message = {
                chat: { id: CHAT_ID } as any,
                text: "hello",
            } as unknown as Message;

            const res = (messageManager as any)._isMessageForMe(message);
            expect(res).toBe(true);
        });
    });
});
