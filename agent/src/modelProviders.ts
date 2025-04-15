import {
    Character,
    elizaLogger,
    ModelProviderName,
    settings,
} from "@elizaos/core";

export function getTokenForProvider(
    provider: ModelProviderName,
    character: Character
): string | undefined {
    if (noKeyProviders.includes(provider)) {
        return "";
    }

    const config = providerKeyMap[provider];
    validateConfig(config, provider);

    if ("characterKeys" in config) {
        return handleMultipleKeys(config, character);
    }

    return handleSingleKey(config, character);
}

function handleMultipleKeys(config: any, character: Character) {
    for (const key of config.characterKeys) {
        if (character.settings?.secrets?.[key]) {
            return character.settings.secrets[key];
        }
    }

    for (const key of config.settingsKeys) {
        if (settings[key]) {
            return settings[key];
        }
    }

    return undefined;
}

function handleSingleKey(config: any, character: Character) {
    return (
        character.settings?.secrets?.[config.characterKey] ||
        settings[config.settingsKey]
    );
}

function validateConfig(config: any, provider: ModelProviderName) {
    if (!config) {
        const errorMessage = `Failed to get token - unsupported model provider: ${provider}`;
        elizaLogger.error(errorMessage);
        throw new Error(errorMessage);
    }
}

const noKeyProviders = [
    ModelProviderName.LLAMALOCAL,
    ModelProviderName.OLLAMA,
    ModelProviderName.GAIANET,
];

const providerKeyMap = {
    [ModelProviderName.OPENAI]: {
        characterKey: "OPENAI_API_KEY",
        settingsKey: "OPENAI_API_KEY",
    },
    [ModelProviderName.ETERNALAI]: {
        characterKey: "ETERNALAI_API_KEY",
        settingsKey: "ETERNALAI_API_KEY",
    },
    [ModelProviderName.LLAMACLOUD]: {
        characterKeys: [
            "LLAMACLOUD_API_KEY",
            "TOGETHER_API_KEY",
            "OPENAI_API_KEY",
        ],
        settingsKeys: [
            "LLAMACLOUD_API_KEY",
            "TOGETHER_API_KEY",
            "OPENAI_API_KEY",
        ],
    },
    [ModelProviderName.TOGETHER]: {
        characterKeys: [
            "LLAMACLOUD_API_KEY",
            "TOGETHER_API_KEY",
            "OPENAI_API_KEY",
        ],
        settingsKeys: [
            "LLAMACLOUD_API_KEY",
            "TOGETHER_API_KEY",
            "OPENAI_API_KEY",
        ],
    },
    [ModelProviderName.CLAUDE_VERTEX]: {
        characterKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
        settingsKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    },
    [ModelProviderName.ANTHROPIC]: {
        characterKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
        settingsKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    },
    [ModelProviderName.REDPILL]: {
        characterKey: "REDPILL_API_KEY",
        settingsKey: "REDPILL_API_KEY",
    },
    [ModelProviderName.OPENROUTER]: {
        characterKey: "OPENROUTER",
        settingsKey: "OPENROUTER_API_KEY",
    },
    [ModelProviderName.GROK]: {
        characterKey: "GROK_API_KEY",
        settingsKey: "GROK_API_KEY",
    },
    [ModelProviderName.HEURIST]: {
        characterKey: "HEURIST_API_KEY",
        settingsKey: "HEURIST_API_KEY",
    },
    [ModelProviderName.GROQ]: {
        characterKey: "GROQ_API_KEY",
        settingsKey: "GROQ_API_KEY",
    },
    [ModelProviderName.GALADRIEL]: {
        characterKey: "GALADRIEL_API_KEY",
        settingsKey: "GALADRIEL_API_KEY",
    },
    [ModelProviderName.FAL]: {
        characterKey: "FAL_API_KEY",
        settingsKey: "FAL_API_KEY",
    },
    [ModelProviderName.ALI_BAILIAN]: {
        characterKey: "ALI_BAILIAN_API_KEY",
        settingsKey: "ALI_BAILIAN_API_KEY",
    },
    [ModelProviderName.VOLENGINE]: {
        characterKey: "VOLENGINE_API_KEY",
        settingsKey: "VOLENGINE_API_KEY",
    },
    [ModelProviderName.GOOGLE]: {
        characterKey: "GOOGLE_GENERATIVE_AI_API_KEY",
        settingsKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    },
    [ModelProviderName.MISTRAL]: {
        characterKey: "MISTRAL_API_KEY",
        settingsKey: "MISTRAL_API_KEY",
    },
    [ModelProviderName.DEEPSEEK]: {
        characterKey: "DEEPSEEK_API_KEY",
        settingsKey: "DEEPSEEK_API_KEY",
    },
};
