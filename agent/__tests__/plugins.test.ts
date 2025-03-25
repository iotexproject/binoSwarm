import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildPlugins, getSecret, handlePluginImporting } from "../src/plugins";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import { evmPlugin } from "@elizaos/plugin-evm";
import { imageGenerationPlugin } from "@elizaos/plugin-image-generation";
import { createNodePlugin } from "@elizaos/plugin-node";
import { TEEMode, teePlugin } from "@elizaos/plugin-tee";
import { webSearchPlugin } from "@elizaos/plugin-web-search";
import { elizaLogger, Service } from "@elizaos/core";

// Mock all plugin imports
vi.mock("@elizaos/plugin-bootstrap", () => ({
    bootstrapPlugin: { name: "bootstrapPlugin" },
}));

vi.mock("@elizaos/plugin-evm", () => ({
    evmPlugin: { name: "evmPlugin" },
}));

vi.mock("@elizaos/plugin-image-generation", () => ({
    imageGenerationPlugin: { name: "imageGenerationPlugin" },
}));

vi.mock("@elizaos/plugin-node", () => ({
    createNodePlugin: vi.fn(() => ({ name: "nodePlugin" })),
}));

vi.mock("@elizaos/plugin-tee", () => ({
    teePlugin: { name: "teePlugin" },
    TEEMode: {
        OFF: "off",
    },
}));

vi.mock("@elizaos/plugin-web-search", () => ({
    webSearchPlugin: { name: "webSearchPlugin" },
}));

vi.mock("@elizaos/core", () => ({
    elizaLogger: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe("Plugin Management", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetAllMocks();
        process.env = { ...originalEnv };
    });

    describe("buildPlugins", () => {
        const mockCharacter = {
            settings: {
                secrets: {},
            },
        };

        beforeEach(() => {
            mockCharacter.settings.secrets = {};
        });

        it("should always include bootstrap and node plugins", () => {
            // @ts-expect-error: mocking the character
            const result = buildPlugins(mockCharacter, TEEMode.OFF, "");

            expect(result).toContain(bootstrapPlugin);
            expect(createNodePlugin).toHaveBeenCalled();
        });

        it("should include webSearchPlugin when TAVILY_API_KEY is present", () => {
            // @ts-expect-error: mocking secrets
            mockCharacter.settings.secrets.TAVILY_API_KEY = "test-key";

            // @ts-expect-error: mocking the character
            const result = buildPlugins(mockCharacter, TEEMode.OFF, "");

            expect(result).toContain(webSearchPlugin);
        });

        it("should include evmPlugin when EVM_PUBLIC_KEY is present", () => {
            // @ts-expect-error: mocking secrets
            mockCharacter.settings.secrets.EVM_PUBLIC_KEY = "test-key";

            // @ts-expect-error: mocking the character
            const result = buildPlugins(mockCharacter, TEEMode.OFF, "");

            expect(result).toContain(evmPlugin);
        });

        it("should include evmPlugin when WALLET_PUBLIC_KEY starts with 0x", () => {
            // @ts-expect-error: mocking secrets
            mockCharacter.settings.secrets.WALLET_PUBLIC_KEY = "0xtest-key";

            // @ts-expect-error: mocking the character
            const result = buildPlugins(mockCharacter, TEEMode.OFF, "");

            expect(result).toContain(evmPlugin);
        });

        it("should include imageGenerationPlugin when any supported API key is present", () => {
            const apiKeys = [
                "FAL_API_KEY",
                "OPENAI_API_KEY",
                "VENICE_API_KEY",
                "HEURIST_API_KEY",
                "LIVEPEER_GATEWAY_URL",
            ];

            apiKeys.forEach((key) => {
                mockCharacter.settings.secrets = {};
                mockCharacter.settings.secrets[key] = "test-key";

                // @ts-expect-error: mocking the character
                const result = buildPlugins(mockCharacter, TEEMode.OFF, "");

                expect(result).toContain(imageGenerationPlugin);
            });
        });

        it("should include teePlugin when teeMode is not OFF and walletSecretSalt is provided", () => {
            // @ts-expect-error: mocking the character
            const result = buildPlugins(mockCharacter, "enabled", "salt");

            expect(result).toContain(teePlugin);
        });

        it("should not include optional plugins when conditions are not met", () => {
            // @ts-expect-error: mocking the character
            const result = buildPlugins(mockCharacter, TEEMode.OFF, "");

            expect(result).not.toContain(webSearchPlugin);
            expect(result).not.toContain(evmPlugin);
            expect(result).not.toContain(imageGenerationPlugin);
            expect(result).not.toContain(teePlugin);
        });
    });

    describe("getSecret", () => {
        const mockCharacter = {
            settings: {
                secrets: {
                    TEST_SECRET: "character-secret",
                },
            },
        };

        it("should prefer character secrets over environment variables", () => {
            process.env.TEST_SECRET = "env-secret";

            // @ts-expect-error: mocking the character
            expect(getSecret(mockCharacter, "TEST_SECRET")).toBe(
                "character-secret"
            );
        });

        it("should fall back to environment variables", () => {
            process.env.ENV_ONLY_SECRET = "env-secret";

            // @ts-expect-error: mocking the character
            expect(getSecret(mockCharacter, "ENV_ONLY_SECRET")).toBe(
                "env-secret"
            );
        });

        it("should return undefined when secret is not found", () => {
            // @ts-expect-error: mocking the character
            expect(getSecret(mockCharacter, "NON_EXISTENT_SECRET")).toBe(
                undefined
            );
        });
    });

    describe("handlePluginImporting", () => {
        it("should return empty array when no plugins are provided", async () => {
            const result = await handlePluginImporting([]);

            expect(result).toEqual([]);
        });

        it("should handle plugin import errors", async () => {
            const plugins = ["@elizaos/plugin-non-existent"];
            const result = await handlePluginImporting(plugins);

            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Failed to import plugin: @elizaos/plugin-non-existent",
                expect.any(Error)
            );
            expect(result).toEqual([[]]);
        });
    });
});
