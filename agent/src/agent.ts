import {
    stringToUuid,
    AgentRuntime,
    Character,
    CacheStore,
    IDatabaseAdapter,
    elizaLogger,
    IDatabaseCacheAdapter,
} from "@elizaos/core";

import { parseArgsAndLoadCharacters } from "./characterLoader";
import { initAndStartDirectClient } from "./server";
import { getTokenForProvider } from "./modelProviders";
import { initializeDatabase } from "./db";
import { initializeCache } from "./cache";
import { initializeClients } from "./clients";
import { buildPlugins } from "./plugins";

export const startAgents = async () => {
    const characters = await parseArgsAndLoadCharacters();
    const runtimes: AgentRuntime[] = [];

    await initializeStartupAgents(characters, runtimes);
    await initAndStartDirectClient(runtimes);

    elizaLogger.log(
        "Run `pnpm start:client` to start the client and visit the outputted URL (http://localhost:5173) to chat with your agents. When running multiple agents, use client with different port `SERVER_PORT=3001 pnpm start:client`"
    );
};

async function initializeStartupAgents(
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

        db = initializeDatabase();

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

    elizaLogger.log(`Creating runtime for character ${character.name}`);
    return new AgentRuntime({
        databaseAdapter: db,
        token,
        modelProvider: character.modelProvider,
        evaluators: [],
        character,
        plugins,
        providers: [],
        actions: [],
        services: [],
        managers: [],
        cacheManager,
        fetch: logFetch,
    });
}

const logFetch = async (url: string, options: any) => {
    elizaLogger.debug(`Fetching ${url}`);
    return fetch(url, options);
};
