import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { deepseek } from "@ai-sdk/deepseek";
import { xai } from "@ai-sdk/xai";
import type { LanguageModelV1 } from "ai";

import settings from "./settings.ts";
import {
    EmbeddingModelSettings,
    ImageModelSettings,
    ModelClass,
    ModelProviderName,
    Models,
    ModelSettings,
} from "./types.ts";

export const models: Models = {
    [ModelProviderName.OPENAI]: {
        endpoint: settings.OPENAI_API_URL || "https://api.openai.com/v1",
        model: {
            [ModelClass.SMALL]: {
                name: settings.SMALL_OPENAI_MODEL || "gpt-4o-mini",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.6,
            },
            [ModelClass.MEDIUM]: {
                name: settings.MEDIUM_OPENAI_MODEL || "gpt-4o",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.6,
            },
            [ModelClass.LARGE]: {
                name: settings.LARGE_OPENAI_MODEL || "gpt-4o",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.6,
            },
            [ModelClass.EMBEDDING]: {
                name:
                    settings.EMBEDDING_OPENAI_MODEL || "text-embedding-3-small",
                dimensions: 1536,
            },
            [ModelClass.IMAGE]: {
                name: settings.IMAGE_OPENAI_MODEL || "dall-e-3",
            },
        },
    },
    [ModelProviderName.ANTHROPIC]: {
        endpoint: "https://api.anthropic.com/v1",
        model: {
            [ModelClass.SMALL]: {
                name:
                    settings.SMALL_ANTHROPIC_MODEL ||
                    "claude-3-5-haiku-20241022",
                stop: [],
                maxInputTokens: 200000,
                maxOutputTokens: 4096,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.MEDIUM]: {
                name:
                    settings.MEDIUM_ANTHROPIC_MODEL ||
                    "claude-3-5-sonnet-20241022",
                stop: [],
                maxInputTokens: 200000,
                maxOutputTokens: 4096,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },

            [ModelClass.LARGE]: {
                name:
                    settings.LARGE_ANTHROPIC_MODEL ||
                    "claude-3-5-sonnet-20241022",
                stop: [],
                maxInputTokens: 200000,
                maxOutputTokens: 4096,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
        },
    },
    [ModelProviderName.GROK]: {
        endpoint: "https://api.x.ai/v1",
        model: {
            [ModelClass.SMALL]: {
                name: settings.SMALL_GROK_MODEL || "grok-3-mini-latest",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.MEDIUM]: {
                name: settings.MEDIUM_GROK_MODEL || "grok-3-latest",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.LARGE]: {
                name: settings.LARGE_GROK_MODEL || "grok-3-latest",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
        },
    },
    [ModelProviderName.LLAMALOCAL]: {
        model: {
            [ModelClass.SMALL]: {
                name: "NousResearch/Hermes-3-Llama-3.1-8B-GGUF/resolve/main/Hermes-3-Llama-3.1-8B.Q8_0.gguf?download=true",
                stop: ["<|eot_id|>", "<|eom_id|>"],
                maxInputTokens: 32768,
                maxOutputTokens: 8192,
                repetition_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.MEDIUM]: {
                name: "NousResearch/Hermes-3-Llama-3.1-8B-GGUF/resolve/main/Hermes-3-Llama-3.1-8B.Q8_0.gguf?download=true", // TODO: ?download=true
                stop: ["<|eot_id|>", "<|eom_id|>"],
                maxInputTokens: 32768,
                maxOutputTokens: 8192,
                repetition_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.LARGE]: {
                name: "NousResearch/Hermes-3-Llama-3.1-8B-GGUF/resolve/main/Hermes-3-Llama-3.1-8B.Q8_0.gguf?download=true", // "RichardErkhov/NousResearch_-_Meta-Llama-3.1-70B-gguf", // TODO:
                stop: ["<|eot_id|>", "<|eom_id|>"],
                maxInputTokens: 32768,
                maxOutputTokens: 8192,
                repetition_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.EMBEDDING]: {
                name: "togethercomputer/m2-bert-80M-32k-retrieval",
            },
        },
    },
    [ModelProviderName.OLLAMA]: {
        endpoint: settings.OLLAMA_SERVER_URL || "http://localhost:11434",
        model: {
            [ModelClass.SMALL]: {
                name:
                    settings.SMALL_OLLAMA_MODEL ||
                    settings.OLLAMA_MODEL ||
                    "llama3.2",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },
            [ModelClass.MEDIUM]: {
                name:
                    settings.MEDIUM_OLLAMA_MODEL ||
                    settings.OLLAMA_MODEL ||
                    "hermes3",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },

            [ModelClass.LARGE]: {
                name:
                    settings.LARGE_OLLAMA_MODEL ||
                    settings.OLLAMA_MODEL ||
                    "hermes3:70b",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.4,
                presence_penalty: 0.4,
                temperature: 0.7,
            },

            [ModelClass.EMBEDDING]: {
                name: settings.OLLAMA_EMBEDDING_MODEL || "mxbai-embed-large",
                dimensions: 1024,
            },
        },
    },
    [ModelProviderName.DEEPSEEK]: {
        endpoint: settings.DEEPSEEK_API_URL || "https://api.deepseek.com",
        model: {
            [ModelClass.SMALL]: {
                name: settings.SMALL_DEEPSEEK_MODEL || "deepseek-chat",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.7,
            },
            [ModelClass.MEDIUM]: {
                name: settings.MEDIUM_DEEPSEEK_MODEL || "deepseek-chat",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.7,
            },
            [ModelClass.LARGE]: {
                name: settings.LARGE_DEEPSEEK_MODEL || "deepseek-chat",
                stop: [],
                maxInputTokens: 128000,
                maxOutputTokens: 8192,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                temperature: 0.7,
            },
        },
    },
};

export function getModelSettings(
    provider: ModelProviderName,
    type: ModelClass
): ModelSettings | undefined {
    return models[provider]?.model[type] as ModelSettings | undefined;
}

export function getImageModelSettings(
    provider: ModelProviderName
): ImageModelSettings | undefined {
    return models[provider]?.model[ModelClass.IMAGE] as
        | ImageModelSettings
        | undefined;
}

export function getEmbeddingModelSettings(
    provider: ModelProviderName
): EmbeddingModelSettings | undefined {
    return models[provider]?.model[ModelClass.EMBEDDING] as
        | EmbeddingModelSettings
        | undefined;
}

export function getEndpoint(provider: ModelProviderName) {
    return models[provider].endpoint;
}

export function getModel(
    provider: ModelProviderName,
    model: string
): LanguageModelV1 {
    const modelProviders = {
        [ModelProviderName.OPENAI]: openai,
        [ModelProviderName.ANTHROPIC]: anthropic,
        [ModelProviderName.DEEPSEEK]: deepseek,
        [ModelProviderName.GROK]: xai,
    };

    const modelProvider = modelProviders[provider];

    if (!modelProvider) {
        throw new Error(`Unsupported provider: ${provider}`);
    }

    return modelProvider(model);
}
