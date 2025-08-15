import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock external type-imported module to avoid runtime resolution
vi.mock("@elizaos/core", () => ({
    elizaLogger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
    },
    Client: {},
    IAgentRuntime: {},
}));

describe("validateTelegramConfig", function () {
    const ORIGINAL_ENV = process.env.TELEGRAM_BOT_TOKEN;

    beforeEach(function () {
        vi.clearAllMocks();
        if (ORIGINAL_ENV === undefined) {
            delete process.env.TELEGRAM_BOT_TOKEN;
        } else {
            process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_ENV;
        }
    });

    it("returns config when token is provided by runtime settings", async function () {
        const { validateTelegramConfig } = await import(
            "../src/environment.ts"
        );
        delete process.env.TELEGRAM_BOT_TOKEN;
        const runtime: any = {
            getSetting: vi.fn((key: string) =>
                key === "TELEGRAM_BOT_TOKEN" ? "RUNTIME_TOKEN" : undefined
            ),
        };

        const config = await validateTelegramConfig(runtime);
        expect(config).toEqual({ TELEGRAM_BOT_TOKEN: "RUNTIME_TOKEN" });
        expect(runtime.getSetting).toHaveBeenCalledWith("TELEGRAM_BOT_TOKEN");
    });

    it("falls back to environment variable when runtime setting is missing", async function () {
        const { validateTelegramConfig } = await import(
            "../src/environment.ts"
        );
        process.env.TELEGRAM_BOT_TOKEN = "ENV_TOKEN";
        const runtime: any = {
            getSetting: vi.fn(() => undefined),
        };

        const config = await validateTelegramConfig(runtime);
        expect(config).toEqual({ TELEGRAM_BOT_TOKEN: "ENV_TOKEN" });
    });

    it("treats empty runtime setting as missing and uses environment variable", async function () {
        const { validateTelegramConfig } = await import(
            "../src/environment.ts"
        );
        process.env.TELEGRAM_BOT_TOKEN = "ENV_TOKEN";
        const runtime: any = {
            getSetting: vi.fn(() => ""),
        };

        const config = await validateTelegramConfig(runtime);
        expect(config).toEqual({ TELEGRAM_BOT_TOKEN: "ENV_TOKEN" });
    });

    it("throws a formatted error when token is not provided by runtime or env", async function () {
        const { validateTelegramConfig } = await import(
            "../src/environment.ts"
        );
        delete process.env.TELEGRAM_BOT_TOKEN;
        const runtime: any = {
            getSetting: vi.fn(() => undefined),
        };

        await expect(validateTelegramConfig(runtime)).rejects.toThrow(
            /Telegram configuration validation failed:/
        );
    });

    it("rethrows non-validation errors from runtime access", async function () {
        const { validateTelegramConfig } = await import(
            "../src/environment.ts"
        );
        delete process.env.TELEGRAM_BOT_TOKEN;
        const runtime: any = {
            getSetting: vi.fn(() => {
                throw new Error("boom");
            }),
        };

        await expect(validateTelegramConfig(runtime)).rejects.toThrow(/boom/);
    });
});
