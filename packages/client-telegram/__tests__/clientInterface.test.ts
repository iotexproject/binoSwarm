import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be declared before importing the module under test
vi.mock("@elizaos/core", () => {
    const elizaLogger = {
        success: vi.fn(),
        warn: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    };
    return {
        elizaLogger,
        // These are types at compile-time, but we export stubs to satisfy ESM runtime
        Client: {},
        IAgentRuntime: {},
    };
});

const validateTelegramConfigMock = vi.fn().mockResolvedValue({
    TELEGRAM_BOT_TOKEN: "TOKEN_FROM_ENV",
});

vi.mock("../src/environment.ts", () => ({
    validateTelegramConfig: validateTelegramConfigMock,
}));

const startSpy = vi.fn().mockResolvedValue(undefined);

class TelegramClientMock {
    static lastInstance: any;
    runtime: any;
    token: string;
    start = startSpy;
    stop = vi.fn();
    constructor(runtime: any, token: string) {
        this.runtime = runtime;
        this.token = token;
        TelegramClientMock.lastInstance = this;
    }
}

vi.mock("../src/telegramClient.ts", () => ({
    TelegramClient: TelegramClientMock,
}));

describe("TelegramClientInterface", function () {
    beforeEach(function () {
        vi.clearAllMocks();
        TelegramClientMock.lastInstance = undefined;
        startSpy.mockResolvedValue(undefined);
        validateTelegramConfigMock.mockResolvedValue({
            TELEGRAM_BOT_TOKEN: "TOKEN_FROM_ENV",
        });
    });

    it("start() validates config, constructs client with token from runtime, starts it, and logs success", async function () {
        const { TelegramClientInterface } = await import("../src/index.ts");
        const core = await import("@elizaos/core");

        const runtime: any = {
            getSetting: vi.fn((key: string) =>
                key === "TELEGRAM_BOT_TOKEN" ? "TOKEN_FROM_RUNTIME" : undefined
            ),
            character: { name: "Alice", clientConfig: {} },
        };

        const client = await TelegramClientInterface.start(runtime);

        expect(validateTelegramConfigMock).toHaveBeenCalledTimes(1);
        expect(validateTelegramConfigMock).toHaveBeenCalledWith(runtime);

        expect(TelegramClientMock.lastInstance).toBeDefined();
        expect(TelegramClientMock.lastInstance.runtime).toBe(runtime);
        expect(TelegramClientMock.lastInstance.token).toBe(
            "TOKEN_FROM_RUNTIME"
        );

        expect(startSpy).toHaveBeenCalledTimes(1);
        expect(client).toBe(TelegramClientMock.lastInstance);

        expect(core.elizaLogger.success).toHaveBeenCalledTimes(1);
        expect(core.elizaLogger.success).toHaveBeenCalledWith(
            expect.stringContaining("Alice")
        );
    });

    it("stop() logs a warning and resolves", async function () {
        const { TelegramClientInterface } = await import("../src/index.ts");
        const core = await import("@elizaos/core");

        const runtime: any = {
            character: { name: "Bob" },
            getSetting: vi.fn(),
        };
        const result = await TelegramClientInterface.stop(runtime);

        expect(result).toBeUndefined();
        expect(core.elizaLogger.warn).toHaveBeenCalledTimes(1);
        expect(core.elizaLogger.warn).toHaveBeenCalledWith(
            "Telegram client does not support stopping yet"
        );
    });

    it("start() propagates configuration errors and does not construct the client", async function () {
        const { TelegramClientInterface } = await import("../src/index.ts");
        validateTelegramConfigMock.mockRejectedValueOnce(
            new Error("bad config")
        );

        const runtime: any = {
            getSetting: vi.fn(() => "IGNORED"),
            character: { name: "Eve", clientConfig: {} },
        };

        await expect(TelegramClientInterface.start(runtime)).rejects.toThrow(
            /bad config/
        );
        expect(TelegramClientMock.lastInstance).toBeUndefined();
    });

    it("start() propagates client start errors and does not log success", async function () {
        const { TelegramClientInterface } = await import("../src/index.ts");
        const core = await import("@elizaos/core");

        startSpy.mockRejectedValueOnce(new Error("start failed"));

        const runtime: any = {
            getSetting: vi.fn(() => "TOKEN"),
            character: { name: "Mallory", clientConfig: {} },
        };

        await expect(TelegramClientInterface.start(runtime)).rejects.toThrow(
            /start failed/
        );
        expect(core.elizaLogger.success).not.toHaveBeenCalled();
    });
});
