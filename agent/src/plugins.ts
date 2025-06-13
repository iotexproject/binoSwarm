import { Character, elizaLogger } from "@elizaos/core";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import { evmPlugin } from "@elizaos/plugin-evm";
import { imageGenerationPlugin } from "@elizaos/plugin-image-generation";
import { createNodePlugin } from "@elizaos/plugin-node";
import { webSearchPlugin } from "@elizaos/plugin-web-search";

export function buildPlugins(character: Character) {
    const nodePlugin = createNodePlugin();
    const plugins = [bootstrapPlugin, nodePlugin];

    loadOptionalPlugins(character, plugins);

    return plugins;
}

function getSecret(character: Character, secret: string) {
    return character.settings?.secrets?.[secret] || process.env[secret];
}

export async function handlePluginImporting(plugins: string[]) {
    if (plugins.length > 0) {
        return await importPlugins(plugins);
    } else {
        return [];
    }
}

function loadOptionalPlugins(character: Character, plugins) {
    addWebSearchPlugin(character, plugins);
    addEvmPlugin(character, plugins);
    addImgGenerationPlugin(character, plugins);
}

function addImgGenerationPlugin(character: Character, plugins) {
    const hasImageGenerationKey =
        getSecret(character, "FAL_API_KEY") ||
        getSecret(character, "OPENAI_API_KEY") ||
        getSecret(character, "VENICE_API_KEY") ||
        getSecret(character, "HEURIST_API_KEY") ||
        getSecret(character, "LIVEPEER_GATEWAY_URL");

    if (hasImageGenerationKey) {
        plugins.push(imageGenerationPlugin);
    }
}

function addEvmPlugin(character: Character, plugins) {
    const hasEvmKey = getSecret(character, "EVM_PUBLIC_KEY");
    const hasWalletKey = getSecret(character, "WALLET_PUBLIC_KEY");
    const isWalletKeyEvm = hasWalletKey && hasWalletKey.startsWith("0x");

    if (hasEvmKey || isWalletKeyEvm) {
        plugins.push(evmPlugin);
    }
}

function addWebSearchPlugin(character: Character, plugins) {
    if (getSecret(character, "TAVILY_API_KEY")) {
        plugins.push(webSearchPlugin);
    }
}

async function importPlugins(plugins: string[]) {
    elizaLogger.info("Plugins are: ", plugins);

    const importedPlugins = await Promise.all(
        plugins.map(async (plugin) => {
            return await importPlugin(plugin);
        })
    );
    return importedPlugins;
}

async function importPlugin(plugin: string) {
    try {
        const importedPlugin = await import(plugin);
        const functionName = buildPluginFunctionName(plugin);
        return importedPlugin.default || importedPlugin[functionName];
    } catch (importError) {
        elizaLogger.error(`Failed to import plugin: ${plugin}`, importError);
        return [];
    }
}

function buildPluginFunctionName(plugin: string) {
    return (
        plugin
            .replace("@elizaos/plugin-", "")
            .replace(/-./g, (x) => x[1].toUpperCase()) + "Plugin"
    );
}
