import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTokenForProvider } from "../src/modelProviders";
import { ModelProviderName, settings, elizaLogger } from "@elizaos/core";

// Mock the core module
vi.mock("@elizaos/core", () => ({
    ModelProviderName: {
        LLAMALOCAL: "LLAMALOCAL",
        OLLAMA: "OLLAMA",
        OPENAI: "OPENAI",
        ANTHROPIC: "ANTHROPIC",
        GROK: "GROK",
        DEEPSEEK: "DEEPSEEK",
    },
    elizaLogger: {
        error: vi.fn(),
    },
    settings: {
        OPENAI_API_KEY: "openai-global-token",
        GROK_API_KEY: "grok-global-token",
        DEEPSEEK_API_KEY: "deepseek-global-token",
        ANTHROPIC_API_KEY: "anthropic-global-token",
        CLAUDE_API_KEY: "claude-global-token",
    },
}));

describe("getTokenForProvider", () => {
    const mockCharacter = {
        settings: {
            secrets: {},
        },
    };

    beforeEach(() => {
        vi.resetAllMocks();
        // Reset settings before each test
        Object.keys(settings).forEach((key) => {
            delete settings[key];
        });
        // Reset character secrets before each test
        mockCharacter.settings.secrets = {};
    });

    describe("Local models", () => {
        it("should return empty string for LLAMALOCAL", () => {
            expect(
                // @ts-expect-error: mocking the character
                getTokenForProvider(ModelProviderName.LLAMALOCAL, mockCharacter)
            ).toBe("");
        });

        it("should return empty string for OLLAMA", () => {
            expect(
                // @ts-expect-error: mocking the character
                getTokenForProvider(ModelProviderName.OLLAMA, mockCharacter)
            ).toBe("");
        });
    });

    describe("Cloud providers", () => {
        const providerTests = [
            {
                provider: ModelProviderName.OPENAI,
                settingKey: "OPENAI_API_KEY",
                characterToken: "openai-character-token",
                globalToken: "openai-global-token",
            },
            {
                provider: ModelProviderName.GROK,
                settingKey: "GROK_API_KEY",
                characterToken: "grok-character-token",
                globalToken: "grok-global-token",
            },
            {
                provider: ModelProviderName.DEEPSEEK,
                settingKey: "DEEPSEEK_API_KEY",
                characterToken: "deepseek-character-token",
                globalToken: "deepseek-global-token",
            },
        ];

        providerTests.forEach(
            ({ provider, settingKey, characterToken, globalToken }) => {
                describe(`${provider} provider`, () => {
                    it("should prefer character settings over global settings", () => {
                        mockCharacter.settings.secrets[settingKey] =
                            characterToken;
                        settings[settingKey] = globalToken;

                        expect(
                            // @ts-expect-error: mocking the character
                            getTokenForProvider(provider, mockCharacter)
                        ).toBe(characterToken);
                    });

                    it("should fall back to global settings when character settings are not available", () => {
                        settings[settingKey] = globalToken;

                        expect(
                            // @ts-expect-error: mocking the character
                            getTokenForProvider(provider, mockCharacter)
                        ).toBe(globalToken);
                    });

                    it("should return undefined when no token is configured", () => {
                        expect(
                            // @ts-expect-error: mocking the character
                            getTokenForProvider(provider, mockCharacter)
                        ).toBeUndefined();
                    });
                });
            }
        );

        describe("Anthropic provider", () => {
            it("should prefer ANTHROPIC_API_KEY from character settings", () => {
                // @ts-expect-error: mocking secrets
                mockCharacter.settings.secrets.ANTHROPIC_API_KEY =
                    "anthropic-character-token";
                // @ts-expect-error: mocking secrets
                mockCharacter.settings.secrets.CLAUDE_API_KEY =
                    "claude-character-token";
                settings.ANTHROPIC_API_KEY = "anthropic-global-token";
                settings.CLAUDE_API_KEY = "claude-global-token";

                expect(
                    getTokenForProvider(
                        ModelProviderName.ANTHROPIC,
                        // @ts-expect-error: mocking the character
                        mockCharacter
                    )
                ).toBe("anthropic-character-token");
            });

            it("should fall back to CLAUDE_API_KEY from character settings", () => {
                // @ts-expect-error: mocking secrets
                mockCharacter.settings.secrets.CLAUDE_API_KEY =
                    "claude-character-token";
                settings.ANTHROPIC_API_KEY = "anthropic-global-token";

                expect(
                    getTokenForProvider(
                        ModelProviderName.ANTHROPIC,
                        // @ts-expect-error: mocking the character
                        mockCharacter
                    )
                ).toBe("claude-character-token");
            });

            it("should fall back to global ANTHROPIC_API_KEY", () => {
                settings.ANTHROPIC_API_KEY = "anthropic-global-token";
                settings.CLAUDE_API_KEY = "claude-global-token";

                expect(
                    getTokenForProvider(
                        ModelProviderName.ANTHROPIC,
                        // @ts-expect-error: mocking the character
                        mockCharacter
                    )
                ).toBe("anthropic-global-token");
            });

            it("should fall back to global CLAUDE_API_KEY as last resort", () => {
                settings.CLAUDE_API_KEY = "claude-global-token";

                expect(
                    getTokenForProvider(
                        ModelProviderName.ANTHROPIC,
                        // @ts-expect-error: mocking the character
                        mockCharacter
                    )
                ).toBe("claude-global-token");
            });

            it("should return undefined when no token is configured", () => {
                expect(
                    getTokenForProvider(
                        ModelProviderName.ANTHROPIC,
                        // @ts-expect-error: mocking the character
                        mockCharacter
                    )
                ).toBeUndefined();
            });
        });
    });

    describe("Error handling", () => {
        it("should throw error for unsupported provider", () => {
            const unsupportedProvider = "UNSUPPORTED" as ModelProviderName;

            expect(() =>
                // @ts-expect-error: mocking the character
                getTokenForProvider(unsupportedProvider, mockCharacter)
            ).toThrow(
                `Failed to get token - unsupported model provider: ${unsupportedProvider}`
            );
            expect(elizaLogger.error).toHaveBeenCalledWith(
                `Failed to get token - unsupported model provider: ${unsupportedProvider}`
            );
        });
    });
});
