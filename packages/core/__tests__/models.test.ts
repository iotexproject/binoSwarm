import {
    getModelSettings,
    getEndpoint,
    models,
    getModel,
} from "../src/models.ts";
import { ModelProviderName, ModelClass } from "../src/types.ts";
import { describe, test, expect, vi } from "vitest";
// Mock settings
vi.mock("../settings", () => {
    return {
        default: {
            SMALL_OPENROUTER_MODEL: "nousresearch/hermes-3-llama-3.1-405b",
            LARGE_OPENROUTER_MODEL: "nousresearch/hermes-3-llama-3.1-405b",
            OPENROUTER_MODEL: "mock-default-model",
            OPENAI_API_KEY: "mock-openai-key",
            ANTHROPIC_API_KEY: "mock-anthropic-key",
            OPENROUTER_API_KEY: "mock-openrouter-key",
            ETERNALAI_MODEL: "mock-eternal-model",
            ETERNALAI_URL: "https://mock.eternal.ai",
            LLAMACLOUD_MODEL_SMALL: "mock-llama-small",
            LLAMACLOUD_MODEL_LARGE: "mock-llama-large",
            TOGETHER_MODEL_SMALL: "mock-together-small",
            TOGETHER_MODEL_LARGE: "mock-together-large",
        },
        loadEnv: vi.fn(),
    };
});

// Mock the ai-sdk modules
vi.mock("@ai-sdk/openai", () => ({
    openai: vi
        .fn()
        .mockImplementation((model) => ({ type: "openai", modelName: model })),
}));

vi.mock("@ai-sdk/anthropic", () => ({
    anthropic: vi.fn().mockImplementation((model) => ({
        type: "anthropic",
        modelName: model,
    })),
}));

vi.mock("@ai-sdk/deepseek", () => ({
    deepseek: vi.fn().mockImplementation((model) => ({
        type: "deepseek",
        modelName: model,
    })),
}));

vi.mock("@ai-sdk/xai", () => ({
    xai: vi.fn().mockImplementation((model) => ({
        type: "xai",
        modelName: model,
    })),
}));

describe("Model Provider Configuration", () => {
    describe("OpenAI Provider", () => {
        test("should have correct endpoint", () => {
            expect(models[ModelProviderName.OPENAI].endpoint).toBe(
                "https://api.openai.com/v1"
            );
        });

        test("should have correct model mappings", () => {
            const openAIModels = models[ModelProviderName.OPENAI].model;
            expect(openAIModels?.[ModelClass.SMALL]?.name).toBe("gpt-4o-mini");
            expect(openAIModels?.[ModelClass.MEDIUM]?.name).toBe("gpt-4o");
            expect(openAIModels?.[ModelClass.LARGE]?.name).toBe("gpt-4o");
            expect(openAIModels?.[ModelClass.EMBEDDING]?.name).toBe(
                "text-embedding-3-small"
            );
            expect(openAIModels?.[ModelClass.IMAGE]?.name).toBe("dall-e-3");
        });

        test("should have correct settings configuration", () => {
            const smallModel =
                models[ModelProviderName.OPENAI].model?.[ModelClass.SMALL];
            expect(smallModel?.maxInputTokens).toBe(128000);
            expect(smallModel?.maxOutputTokens).toBe(8192);
            expect(smallModel?.temperature).toBe(0.6);
            expect(smallModel?.frequency_penalty).toBe(0.0);
            expect(smallModel?.presence_penalty).toBe(0.0);
            expect(smallModel?.stop).toEqual([]);
        });
    });

    describe("Anthropic Provider", () => {
        test("should have correct endpoint", () => {
            expect(models[ModelProviderName.ANTHROPIC].endpoint).toBe(
                "https://api.anthropic.com/v1"
            );
        });

        test("should have correct model mappings", () => {
            const anthropicModels = models[ModelProviderName.ANTHROPIC].model;
            expect(anthropicModels?.[ModelClass.SMALL]?.name).toBe(
                "claude-3-5-haiku-20241022"
            );
            expect(anthropicModels?.[ModelClass.MEDIUM]?.name).toBe(
                "claude-3-5-sonnet-20241022"
            );
            expect(anthropicModels?.[ModelClass.LARGE]?.name).toBe(
                "claude-3-5-sonnet-20241022"
            );
        });

        test("should have correct settings configuration", () => {
            const smallModel =
                models[ModelProviderName.ANTHROPIC].model?.[ModelClass.SMALL];
            expect(smallModel?.maxInputTokens).toBe(200000);
            expect(smallModel?.maxOutputTokens).toBe(4096);
            expect(smallModel?.temperature).toBe(0.7);
            expect(smallModel?.frequency_penalty).toBe(0.4);
            expect(smallModel?.presence_penalty).toBe(0.4);
            expect(smallModel?.stop).toEqual([]);
        });
    });

    describe("DeepSeek Provider", () => {
        test("should have correct endpoint", () => {
            expect(models[ModelProviderName.DEEPSEEK]?.endpoint).toBe(
                "https://api.deepseek.com"
            );
        });

        test("should have correct model mappings", () => {
            const deepSeekModels = models[ModelProviderName.DEEPSEEK]?.model;
            expect(deepSeekModels?.[ModelClass.SMALL]?.name).toBe(
                "deepseek-chat"
            );
            expect(deepSeekModels?.[ModelClass.MEDIUM]?.name).toBe(
                "deepseek-chat"
            );
            expect(deepSeekModels?.[ModelClass.LARGE]?.name).toBe(
                "deepseek-chat"
            );
        });

        test("should have correct settings configuration", () => {
            const smallModel =
                models[ModelProviderName.DEEPSEEK]?.model?.[ModelClass.SMALL];
            expect(smallModel?.maxInputTokens).toBe(128000);
            expect(smallModel?.maxOutputTokens).toBe(8192);
            expect(smallModel?.temperature).toBe(0.7);
            expect(smallModel?.frequency_penalty).toBe(0.0);
            expect(smallModel?.presence_penalty).toBe(0.0);
            expect(smallModel?.stop).toEqual([]);
        });
    });

    describe("Grok Provider", () => {
        test("should have correct endpoint", () => {
            expect(models[ModelProviderName.GROK]?.endpoint).toBe(
                "https://api.x.ai/v1"
            );
        });

        test("should have correct model mappings", () => {
            const grokModels = models[ModelProviderName.GROK]?.model;
            expect(grokModels?.[ModelClass.SMALL]?.name).toBe(
                "grok-3-mini-latest"
            );
            expect(grokModels?.[ModelClass.MEDIUM]?.name).toBe("grok-3-latest");
            expect(grokModels?.[ModelClass.LARGE]?.name).toBe("grok-3-latest");
        });

        test("should have correct settings configuration", () => {
            const smallModel =
                models[ModelProviderName.GROK]?.model?.[ModelClass.SMALL];
            expect(smallModel?.maxInputTokens).toBe(128000);
            expect(smallModel?.maxOutputTokens).toBe(8192);
            expect(smallModel?.temperature).toBe(0.7);
            expect(smallModel?.frequency_penalty).toBe(0.4);
            expect(smallModel?.presence_penalty).toBe(0.4);
            expect(smallModel?.stop).toEqual([]);
        });
    });

    describe("OLLAMA Provider", () => {
        test("should have correct endpoint", () => {
            expect(models[ModelProviderName.OLLAMA]?.endpoint).toBe(
                "http://localhost:11434"
            );
        });

        test("should have correct model mappings", () => {
            const ollamaModels = models[ModelProviderName.OLLAMA]?.model;
            expect(ollamaModels?.[ModelClass.SMALL]?.name).toBe("llama3.2");
            expect(ollamaModels?.[ModelClass.MEDIUM]?.name).toBe("hermes3");
            expect(ollamaModels?.[ModelClass.LARGE]?.name).toBe("hermes3:70b");
            expect(ollamaModels?.[ModelClass.EMBEDDING]?.name).toBe(
                "mxbai-embed-large"
            );
        });

        test("should have correct settings configuration", () => {
            const smallModel =
                models[ModelProviderName.OLLAMA]?.model?.[ModelClass.SMALL];
            expect(smallModel?.maxInputTokens).toBe(128000);
            expect(smallModel?.maxOutputTokens).toBe(8192);
            expect(smallModel?.temperature).toBe(0.7);
            expect(smallModel?.frequency_penalty).toBe(0.4);
            expect(smallModel?.presence_penalty).toBe(0.4);
            expect(smallModel?.stop).toEqual([]);
        });
    });

    describe("LLAMALOCAL Provider", () => {
        test("should have correct model mappings", () => {
            const llamaLocalModels =
                models[ModelProviderName.LLAMALOCAL]?.model;
            expect(llamaLocalModels?.[ModelClass.SMALL]?.name).toBe(
                "NousResearch/Hermes-3-Llama-3.1-8B-GGUF/resolve/main/Hermes-3-Llama-3.1-8B.Q8_0.gguf?download=true"
            );
            expect(llamaLocalModels?.[ModelClass.MEDIUM]?.name).toBe(
                "NousResearch/Hermes-3-Llama-3.1-8B-GGUF/resolve/main/Hermes-3-Llama-3.1-8B.Q8_0.gguf?download=true"
            );
            expect(llamaLocalModels?.[ModelClass.LARGE]?.name).toBe(
                "NousResearch/Hermes-3-Llama-3.1-8B-GGUF/resolve/main/Hermes-3-Llama-3.1-8B.Q8_0.gguf?download=true"
            );
            expect(llamaLocalModels?.[ModelClass.EMBEDDING]?.name).toBe(
                "togethercomputer/m2-bert-80M-32k-retrieval"
            );
        });

        test("should have correct settings configuration", () => {
            const smallModel =
                models[ModelProviderName.LLAMALOCAL]?.model?.[ModelClass.SMALL];
            expect(smallModel?.maxInputTokens).toBe(32768);
            expect(smallModel?.maxOutputTokens).toBe(8192);
            expect(smallModel?.temperature).toBe(0.7);
            expect(smallModel?.repetition_penalty).toBe(0.4);
            expect(smallModel?.stop).toEqual(["<|eot_id|>", "<|eom_id|>"]);
        });
    });
});

describe("Model Retrieval Functions", () => {
    describe("getModel function", () => {
        test("should retrieve correct models for different providers and classes", () => {
            expect(
                models[ModelProviderName.OPENAI].model?.[ModelClass.SMALL]?.name
            ).toBe("gpt-4o-mini");
            expect(
                models[ModelProviderName.ANTHROPIC].model?.[ModelClass.MEDIUM]
                    ?.name
            ).toBe("claude-3-5-sonnet-20241022");
        });
        test("should throw error for invalid model provider", () => {
            const model = getModelSettings(
                "INVALID_PROVIDER" as any,
                ModelClass.SMALL
            );
            expect(model).toBeUndefined();
        });
    });

    describe("getEndpoint function", () => {
        test("should retrieve correct endpoints for different providers", () => {
            expect(getEndpoint(ModelProviderName.OPENAI)).toBe(
                "https://api.openai.com/v1"
            );
            expect(getEndpoint(ModelProviderName.ANTHROPIC)).toBe(
                "https://api.anthropic.com/v1"
            );
        });

        test("should throw error for invalid provider", () => {
            expect(() => getEndpoint("INVALID_PROVIDER" as any)).toThrow();
        });
    });

    describe("getModel function", () => {
        test("should return OpenAI model when OpenAI provider is specified", () => {
            const result = getModel(ModelProviderName.OPENAI, "gpt-4");
            expect(result).toEqual({ type: "openai", modelName: "gpt-4" });
        });

        test("should return Anthropic model when Anthropic provider is specified", () => {
            const result = getModel(ModelProviderName.ANTHROPIC, "claude-3");
            expect(result).toEqual({
                type: "anthropic",
                modelName: "claude-3",
            });
        });

        test("should return DeepSeek model when DeepSeek provider is specified", () => {
            const result = getModel(
                ModelProviderName.DEEPSEEK,
                "deepseek-coder"
            );
            expect(result).toEqual({
                type: "deepseek",
                modelName: "deepseek-coder",
            });
        });

        test("should return Grok model when Grok provider is specified", () => {
            const result = getModel(
                ModelProviderName.GROK,
                "grok-3-mini-latest"
            );
            expect(result).toEqual({
                type: "xai",
                modelName: "grok-3-mini-latest",
            });
        });

        test("should throw error for unsupported provider", () => {
            // Test for OLLAMA which is not in the modelProviders map
            expect(() => {
                getModel(ModelProviderName.OLLAMA, "llama3.2");
            }).toThrow(`Unsupported provider: ${ModelProviderName.OLLAMA}`);

            // Test for LLAMALOCAL which is not in the modelProviders map
            expect(() => {
                getModel(ModelProviderName.LLAMALOCAL, "hermes3");
            }).toThrow(`Unsupported provider: ${ModelProviderName.LLAMALOCAL}`);

            // Test for completely unknown provider
            expect(() => {
                getModel(
                    "UNSUPPORTED_PROVIDER" as ModelProviderName,
                    "any-model"
                );
            }).toThrow("Unsupported provider: UNSUPPORTED_PROVIDER");
        });
    });
});

describe("Model Settings Validation", () => {
    test("all providers should have required settings", () => {
        Object.values(ModelProviderName).forEach((provider) => {
            const providerConfig = models[provider];
            if (!providerConfig || !providerConfig.model) {
                return; // Skip providers that are not fully configured
            }
            const smallModel = providerConfig.model[ModelClass.SMALL];
            if (!smallModel) {
                return; // Skip if small model is not configured
            }
            expect(smallModel.maxInputTokens).toBeGreaterThan(0);
            expect(smallModel.maxOutputTokens).toBeGreaterThan(0);
            expect(smallModel.temperature).toBeDefined();
        });
    });

    test("all providers should have model mappings for basic model classes", () => {
        Object.values(ModelProviderName).forEach((provider) => {
            const providerConfig = models[provider];
            if (!providerConfig || !providerConfig.model) {
                return; // Skip providers that are not fully configured
            }
            if (providerConfig.model[ModelClass.SMALL]) {
                expect(
                    providerConfig.model[ModelClass.SMALL].name
                ).toBeDefined();
            }
            if (providerConfig.model[ModelClass.MEDIUM]) {
                expect(
                    providerConfig.model[ModelClass.MEDIUM].name
                ).toBeDefined();
            }
            if (providerConfig.model[ModelClass.LARGE]) {
                expect(
                    providerConfig.model[ModelClass.LARGE].name
                ).toBeDefined();
            }
        });
    });
});
