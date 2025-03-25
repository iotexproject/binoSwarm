import { elizaLogger, AgentRuntime } from "@elizaos/core";

import { parseArgsAndLoadCharacters } from "./characterLoader";
import { initAndStartDirectClient } from "./server";
import { initializeStartupAgents } from "./agent";

const startAgents = async () => {
    const characters = await parseArgsAndLoadCharacters();
    const runtimes: AgentRuntime[] = [];

    await initializeStartupAgents(characters, runtimes);
    await initAndStartDirectClient(runtimes);

    elizaLogger.log(
        "Run `pnpm start:client` to start the client and visit the outputted URL (http://localhost:5173) to chat with your agents. When running multiple agents, use client with different port `SERVER_PORT=3001 pnpm start:client`"
    );
};

startAgents().catch((error) => {
    elizaLogger.error("Unhandled error in startAgents:", error);
    process.exit(1);
});
