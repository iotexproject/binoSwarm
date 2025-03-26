import { DirectClient } from "@elizaos/client-direct";
import { settings, elizaLogger, AgentRuntime } from "@elizaos/core";
import net from "net";

export async function initAndStartDirectClient(runtimes: AgentRuntime[]) {
    const directClient = new DirectClient();

    runtimes.forEach((runtime) => {
        directClient.registerAgent(runtime);
    });

    const serverPort = await setupServer();
    directClient.start(serverPort);
}

async function setupServer() {
    const initialServerPort = parseInt(settings.SERVER_PORT || "3000");
    let serverPort = initialServerPort;
    while (!(await checkPortAvailable(serverPort))) {
        elizaLogger.warn(
            `Port ${serverPort} is in use, trying ${serverPort + 1}`
        );
        serverPort++;
    }

    if (serverPort !== initialServerPort) {
        elizaLogger.log(`Server started on alternate port ${serverPort}`);
    }

    return serverPort;
}

const checkPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                resolve(false);
            }
        });

        server.once("listening", () => {
            server.close();
            resolve(true);
        });

        server.listen(port);
    });
};

// Review this, possible way to dynamically add agents to the direct client
// function setupDirectClient(directClient: DirectClient) {
//     directClient.startAgent = async (character: any) => {
//         character.plugins = await handlePluginImporting(character.plugins);
//         const runtime = await startAgent(character);
//         directClient.registerAgent(runtime);
//         return runtime;
//     };
// }
