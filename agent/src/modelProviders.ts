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

const noKeyProviders = [ModelProviderName.LLAMALOCAL, ModelProviderName.OLLAMA];

const providerKeyMap = {
    [ModelProviderName.OPENAI]: {
        characterKey: "OPENAI_API_KEY",
        settingsKey: "OPENAI_API_KEY",
    },
    [ModelProviderName.ANTHROPIC]: {
        characterKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
        settingsKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    },
    [ModelProviderName.GROK]: {
        characterKey: "GROK_API_KEY",
        settingsKey: "GROK_API_KEY",
    },
    [ModelProviderName.DEEPSEEK]: {
        characterKey: "DEEPSEEK_API_KEY",
        settingsKey: "DEEPSEEK_API_KEY",
    },
};
