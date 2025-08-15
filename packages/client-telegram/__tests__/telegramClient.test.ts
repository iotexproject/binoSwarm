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
    });
});
