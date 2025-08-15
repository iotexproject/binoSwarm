import { describe, it, expect, vi, beforeEach } from "vitest";
import { TelegramClient } from "../src/telegramClient";
import { IAgentRuntime } from "@elizaos/core";

// Mock Telegraf to capture handler registrations
vi.mock("telegraf", () => {
    const mockBot = {
        launch: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        telegram: {
            getMe: vi.fn().mockResolvedValue({ username: "test_bot" }),
        },
        on: vi.fn(),
        command: vi.fn(),
        use: vi.fn(),
        catch: vi.fn(),
    };

    return {
        Telegraf: vi.fn(() => mockBot),
    };
});

describe("TelegramClient", () => {
    let mockRuntime: IAgentRuntime;
    let client: TelegramClient;
    const TEST_BOT_TOKEN = "test_bot_token";

    beforeEach(() => {
        vi.clearAllMocks();
        const runtime: any = {
            getSetting: vi.fn(),
            character: {
                clientConfig: {
                    telegram: {
                        shouldOnlyJoinInAllowedGroups: false,
                        allowedGroupIds: [],
                    },
                },
            },
        };
        mockRuntime = runtime as unknown as IAgentRuntime;
        client = new TelegramClient(mockRuntime, TEST_BOT_TOKEN);
        // Ensure default getMe implementation returns valid bot info
        const bot = (client as any)["bot"] as any;
        if (bot?.telegram?.getMe?.mockResolvedValue) {
            bot.telegram.getMe.mockResolvedValue({ username: "test_bot" });
        }
    });

    describe("initialization", () => {
        it("should create a new instance with the provided runtime and token", () => {
            expect(client).toBeInstanceOf(TelegramClient);
        });
    });

    describe("bot lifecycle", () => {
        it("should start the bot successfully", async () => {
            const mockBot = client["bot"];
            const launchSpy = vi.spyOn(mockBot, "launch");
            const getMeSpy = vi.spyOn(mockBot.telegram, "getMe");

            await client.start();

            expect(launchSpy).toHaveBeenCalledWith({
                dropPendingUpdates: true,
            });
            expect(getMeSpy).toHaveBeenCalled();
        });

        it("should get bot info after launch", async () => {
            const mockBot = client["bot"];
            const getMeSpy = vi.spyOn(mockBot.telegram, "getMe");

            await client.start();

            expect(getMeSpy).toHaveBeenCalled();
        });
    });

    describe("setupMessageHandlers and isGroupAuthorized via start", () => {
        it("registers message handlers on start", async () => {
            const mockBot = client["bot"] as any;

            await client.start();

            expect(mockBot.on).toHaveBeenCalled();
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            // Expect handlers for message/photo/document
            expect(calls.some(([evt]) => evt === "message")).toBe(true);
            expect(calls.some(([evt]) => evt === "photo")).toBe(true);
            expect(calls.some(([evt]) => evt === "document")).toBe(true);
            // Also expect one registration using a filter (non-string first arg)
            expect(calls.some(([evt]) => typeof evt !== "string")).toBe(true);
        });

        it("skips handling and leaves unauthorized group", async () => {
            // Configure runtime to restrict to allowed groups
            (mockRuntime as any).character.clientConfig.telegram = {
                shouldOnlyJoinInAllowedGroups: true,
                allowedGroupIds: ["999"],
            };

            await client.start();

            const mockBot = client["bot"] as any;
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            const newMembersCall = calls.find(
                ([evt]) => typeof evt !== "string"
            );
            expect(newMembersCall).toBeTruthy();
            const newMembersHandler = (newMembersCall as any[])[1] as Function;

            const ctx: any = {
                chat: { id: 123 },
                from: { id: 1 },
                botInfo: { id: 2 },
                message: {
                    new_chat_members: [
                        { id: 2 }, // simulate bot added
                    ],
                },
                reply: vi.fn().mockResolvedValue(undefined),
                leaveChat: vi.fn().mockResolvedValue(undefined),
            };

            // Spy on internal messageManager.handleMessage
            const handleSpy = vi.spyOn(
                (client as any).messageManager,
                "handleMessage"
            );
            await newMembersHandler(ctx);
            expect(handleSpy).not.toHaveBeenCalled();
            expect(ctx.reply).toHaveBeenCalledWith("Not authorized. Leaving.");
            expect(ctx.leaveChat).toHaveBeenCalled();
        });

        it("handles message when group is authorized", async () => {
            (mockRuntime as any).character.clientConfig.telegram = {
                shouldOnlyJoinInAllowedGroups: true,
                allowedGroupIds: ["123"],
            };

            await client.start();

            const mockBot = client["bot"] as any;
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            const messageCall = calls.find(([evt]) => evt === "message");
            expect(messageCall).toBeTruthy();
            const messageHandler = (messageCall as any[])[1] as Function;

            const ctx: any = {
                chat: { id: 123 },
                from: { id: 1 },
                botInfo: { id: 2 },
                reply: vi.fn().mockResolvedValue(undefined),
                leaveChat: vi.fn().mockResolvedValue(undefined),
            };

            const handleSpy = vi.spyOn(
                (client as any).messageManager,
                "handleMessage"
            );
            await messageHandler(ctx);
            expect(handleSpy).toHaveBeenCalledWith(ctx);
            expect(ctx.leaveChat).not.toHaveBeenCalled();
        });

        it("ignores messages sent by the bot itself", async () => {
            (mockRuntime as any).character.clientConfig.telegram = {
                shouldOnlyJoinInAllowedGroups: false,
                allowedGroupIds: [],
            };

            await client.start();

            const mockBot = client["bot"] as any;
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            const messageCall = calls.find(([evt]) => evt === "message");
            expect(messageCall).toBeTruthy();
            const messageHandler = (messageCall as any[])[1] as Function;

            const ctx: any = {
                chat: { id: 123 },
                from: { id: 42 },
                botInfo: { id: 42 },
                reply: vi.fn().mockResolvedValue(undefined),
                leaveChat: vi.fn().mockResolvedValue(undefined),
            };

            const handleSpy = vi.spyOn(
                (client as any).messageManager,
                "handleMessage"
            );
            await messageHandler(ctx);
            expect(handleSpy).not.toHaveBeenCalled();
            expect(ctx.leaveChat).not.toHaveBeenCalled();
        });

        it("handles message when restrictions are off (early allow)", async () => {
            (mockRuntime as any).character.clientConfig.telegram = {
                shouldOnlyJoinInAllowedGroups: false,
                allowedGroupIds: [],
            };

            await client.start();

            const mockBot = client["bot"] as any;
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            const messageCall = calls.find(([evt]) => evt === "message");
            expect(messageCall).toBeTruthy();
            const messageHandler = (messageCall as any[])[1] as Function;

            const handleSpy = vi.spyOn(
                (client as any).messageManager,
                "handleMessage"
            );

            const ctx: any = {
                chat: { id: 456 },
                from: { id: 7 },
                botInfo: { id: 42 },
                reply: vi.fn().mockResolvedValue(undefined),
                leaveChat: vi.fn().mockResolvedValue(undefined),
            };

            await messageHandler(ctx);
            expect(handleSpy).toHaveBeenCalledWith(ctx);
        });

        it("new_chat_members handler catches unexpected errors", async () => {
            await client.start();

            const mockBot = client["bot"] as any;
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            const newMembersCall = calls.find(
                ([evt]) => typeof evt !== "string"
            );
            expect(newMembersCall).toBeTruthy();
            const newMembersHandler = (newMembersCall as any[])[1] as Function;

            // Missing message.new_chat_members will cause a thrown error inside handler
            const badCtx: any = {
                botInfo: { id: 1 },
            };

            await newMembersHandler(badCtx);
        });

        it("message handler catch: replies on non-403 errors", async () => {
            await client.start();

            const mockBot = client["bot"] as any;
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            const messageCall = calls.find(([evt]) => evt === "message");
            expect(messageCall).toBeTruthy();
            const messageHandler = (messageCall as any[])[1] as Function;

            vi.spyOn(
                (client as any).messageManager,
                "handleMessage"
            ).mockRejectedValue(new Error("boom"));

            const ctx: any = {
                chat: { id: 1 },
                from: { id: 2 },
                botInfo: { id: 3 },
                reply: vi.fn().mockResolvedValue(undefined),
            };

            await messageHandler(ctx);
            expect(ctx.reply).toHaveBeenCalledWith(
                "An error occurred while processing your message."
            );
        });

        it("message handler catch: skips reply on 403 errors", async () => {
            await client.start();

            const mockBot = client["bot"] as any;
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            const messageCall = calls.find(([evt]) => evt === "message");
            expect(messageCall).toBeTruthy();
            const messageHandler = (messageCall as any[])[1] as Function;

            vi.spyOn(
                (client as any).messageManager,
                "handleMessage"
            ).mockRejectedValue({ response: { error_code: 403 } });

            const ctx: any = {
                chat: { id: 1 },
                from: { id: 2 },
                botInfo: { id: 3 },
                reply: vi.fn().mockResolvedValue(undefined),
            };

            await messageHandler(ctx);
            expect(ctx.reply).not.toHaveBeenCalled();
        });

        it("message handler catch: reply failure is caught", async () => {
            await client.start();

            const mockBot = client["bot"] as any;
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            const messageCall = calls.find(([evt]) => evt === "message");
            expect(messageCall).toBeTruthy();
            const messageHandler = (messageCall as any[])[1] as Function;

            vi.spyOn(
                (client as any).messageManager,
                "handleMessage"
            ).mockRejectedValue(new Error("boom"));

            const ctx: any = {
                chat: { id: 1 },
                from: { id: 2 },
                botInfo: { id: 3 },
                reply: vi.fn().mockRejectedValue(new Error("send-fail")),
            };

            await messageHandler(ctx);
            // no throw expected; nested catch handles it
            expect(ctx.reply).toHaveBeenCalled();
        });

        it("photo handler runs", async () => {
            await client.start();

            const mockBot = client["bot"] as any;
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            const photoCall = calls.find(([evt]) => evt === "photo");
            expect(photoCall).toBeTruthy();
            const photoHandler = (photoCall as any[])[1] as Function;

            const ctx: any = { message: { caption: "hi" } };
            await photoHandler(ctx);
        });

        it("document handler runs", async () => {
            await client.start();

            const mockBot = client["bot"] as any;
            const calls = (mockBot.on as any).mock.calls as Array<any[]>;
            const documentCall = calls.find(([evt]) => evt === "document");
            expect(documentCall).toBeTruthy();
            const documentHandler = (documentCall as any[])[1] as Function;

            const ctx: any = { message: { document: { file_name: "f" } } };
            await documentHandler(ctx);
        });

        it("bot.catch global handler replies", async () => {
            await client.start();

            const mockBot = client["bot"] as any;
            const catchCalls = (mockBot.catch as any).mock.calls as Array<
                any[]
            >;
            expect(catchCalls.length).toBeGreaterThan(0);
            const globalCatch = catchCalls[0][0] as Function;

            const ctx: any = { updateType: "message", reply: vi.fn() };
            await globalCatch(new Error("x"), ctx);
            expect(ctx.reply).toHaveBeenCalledWith(
                "An unexpected error occurred. Please try again later."
            );
        });

        it("start propagates initialize errors", async () => {
            const mockBot = client["bot"] as any;
            vi.spyOn(mockBot, "launch").mockImplementation(() => {
                return Promise.resolve(undefined);
            });
            const getMeSpy = vi
                .spyOn(mockBot.telegram, "getMe")
                .mockRejectedValue(new Error("init-fail"));
            await expect(client.start()).rejects.toThrow("init-fail");
            getMeSpy.mockRestore();
        });

        it("shutdown handlers stop the bot", async () => {
            const captured: Record<string, Function> = {};
            const onceSpy = vi
                .spyOn(process, "once")
                .mockImplementation((signal: any, cb: any) => {
                    captured[String(signal)] = cb;
                    return process as any;
                });

            await client.start();

            const mockBot = client["bot"] as any;
            const stopSpy = vi.spyOn(mockBot, "stop");

            await captured["SIGINT"]?.("SIGINT");
            expect(stopSpy).toHaveBeenCalled();

            onceSpy.mockRestore();
        });
    });
});
