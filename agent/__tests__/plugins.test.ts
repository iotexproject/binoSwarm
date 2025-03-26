import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildPlugins, handlePluginImporting } from "../src/plugins";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import { evmPlugin } from "@elizaos/plugin-evm";
import { imageGenerationPlugin } from "@elizaos/plugin-image-generation";
import { createNodePlugin } from "@elizaos/plugin-node";
import { teePlugin } from "@elizaos/plugin-tee";
import { webSearchPlugin } from "@elizaos/plugin-web-search";
import { elizaLogger, ModelProviderName } from "@elizaos/core";

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
    ModelProviderName: {
        OPENAI: "OPENAI",
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
            bio: ["test"],
            lore: ["test"],
            modelProvider: ModelProviderName.OPENAI,
            name: "test",
            messageExamples: [],
            postExamples: [],
            topics: [],
            adjectives: [],
            settings: {
                secrets: {},
            },
            clients: [],
            plugins: [],
            style: {
                all: [],
                chat: [],
                post: [],
            },
        };

        beforeEach(() => {
            mockCharacter.settings.secrets = {};
        });

        it("should always include bootstrap and node plugins", () => {
            const result = buildPlugins(mockCharacter);

            expect(result).toContain(bootstrapPlugin);
            expect(createNodePlugin).toHaveBeenCalled();
        });

        it("should include webSearchPlugin when TAVILY_API_KEY is present", () => {
            process.env.TAVILY_API_KEY = "test-key";

            const result = buildPlugins(mockCharacter);

            expect(result).toContain(webSearchPlugin);
        });

        it("should include evmPlugin when EVM_PUBLIC_KEY is present", () => {
            process.env.EVM_PUBLIC_KEY = "test-key";

            const result = buildPlugins(mockCharacter);

            expect(result).toContain(evmPlugin);
        });

        it("should include evmPlugin when WALLET_PUBLIC_KEY starts with 0x", () => {
            process.env.WALLET_PUBLIC_KEY = "0xtest-key";

            const result = buildPlugins(mockCharacter);

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

                const result = buildPlugins(mockCharacter);

                expect(result).toContain(imageGenerationPlugin);
            });
        });

        it("should include teePlugin when teeMode is not OFF and walletSecretSalt is provided", () => {
            process.env.TEE_MODE = "enabled";
            process.env.WALLET_SECRET_SALT = "salt";

            const result = buildPlugins(mockCharacter);

            expect(result).toContain(teePlugin);
        });

        it("should not include optional plugins when conditions are not met", () => {
            const result = buildPlugins(mockCharacter);

            expect(result).not.toContain(webSearchPlugin);
            expect(result).not.toContain(evmPlugin);
            expect(result).not.toContain(imageGenerationPlugin);
            expect(result).not.toContain(teePlugin);
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
