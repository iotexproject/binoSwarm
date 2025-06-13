import {
    stringToUuid,
    AgentRuntime,
    Character,
    CacheStore,
    IDatabaseAdapter,
    elizaLogger,
    IDatabaseCacheAdapter,
} from "@elizaos/core";

import { getTokenForProvider } from "./modelProviders";
import { initializeDatabase } from "./db";
import { initializeCache } from "./cache";
import { initializeClients } from "./clients";
import { buildPlugins } from "./plugins";
import { mergeCharacterTraits } from "./merge";
import { MCPManager } from "./mcps";

export async function initializeStartupAgents(
    characters: Character[],
    runtimes: AgentRuntime[]
) {
    try {
        for (const character of characters) {
            const runtime = await startAgent(character);
            runtimes.push(runtime);
        }
    } catch (error) {
        elizaLogger.error("Error starting agents:", error);
    }
}

async function startAgent(character: Character): Promise<AgentRuntime> {
    let db: IDatabaseAdapter & IDatabaseCacheAdapter;
    try {
        character.id ??= stringToUuid(character.name);
        character.username ??= character.name;

        db = await initializeDatabase();

        const runtime = await createAgent(character, db);
        await runtime.initialize();
        runtime.clients = await initializeClients(character, runtime);

        elizaLogger.debug(
            `Initialized ${character.name} as ${runtime.agentId}`
        );

        return runtime;
    } catch (error) {
        elizaLogger.error(
            `Error starting agent for character ${character.name}:`,
            error
        );
        elizaLogger.error(error);
        if (db) {
            await db.close();
        }
        throw error;
    }
}

export async function createAgent(
    character: Character,
    db: IDatabaseAdapter & IDatabaseCacheAdapter
): Promise<AgentRuntime> {
    const token = getTokenForProvider(character.modelProvider, character);
    const cacheManager = initializeCache(
        process.env.CACHE_STORE ?? CacheStore.DATABASE,
        character,
        "",
        db
    );
    const plugins = buildPlugins(character);
    const mcpManager = new MCPManager();
    await mcpManager.initialize(character);
    const enrichedCharacter = await mergeCharacterWithDbTraits(character, db);

    elizaLogger.log(`Creating runtime for character ${enrichedCharacter.name}`);
    return new AgentRuntime({
        databaseAdapter: db,
        token,
        modelProvider: enrichedCharacter.modelProvider,
        evaluators: [],
        character: enrichedCharacter,
        plugins,
        providers: [],
        actions: [],
        services: [],
        managers: [],
        cacheManager,
        fetch: logFetch,
        mcpManager,
    });
}

const logFetch = async (url: string, options: any) => {
    elizaLogger.debug(`Fetching ${url}`);
    return fetch(url, options);
};

async function mergeCharacterWithDbTraits(
    character: Character,
    db: IDatabaseAdapter & IDatabaseCacheAdapter
): Promise<Character> {
    const characterTraits = await db.getCharacterDbTraits(character.id);

    if (!characterTraits) {
        return character;
    }

    if (characterTraits.agent_id !== character.id) {
        throw new Error(
            `Character ${character.id} has agent_id ${characterTraits.agent_id} but expected ${character.id}`
        );
    }

    return mergeCharacterTraits(character, characterTraits);
}
