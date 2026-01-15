import { experimental_createMCPClient as createMCPClient, ToolSet } from "ai";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "ai/mcp-stdio";
import { Character, MCPServerConfig } from "./types";
import { elizaLogger } from "./logger";

export class MCPManager {
    private clients: any[] = [];

    constructor() {
        // Constructor initializes an empty array for MCP clients.
    }

    private resolveStdioEnv(
        serverConfig: MCPServerConfig
    ): Record<string, string> {
        if (!serverConfig.env) {
            return {};
        }

        const resolvedEnv: Record<string, string> = {};
        for (const [envKey, processEnvVarName] of Object.entries(
            serverConfig.env
        )) {
            const value = process.env[processEnvVarName];
            if (value === undefined) {
                elizaLogger.warn(
                    `MCP server env variable ${processEnvVarName} (mapped to ${envKey}) not found in process.env. Skipping.`
                );
                continue;
            }
            resolvedEnv[envKey] = value;
        }
        return resolvedEnv;
    }

    private async initializeStdioClient(serverConfig: MCPServerConfig) {
        const env = this.resolveStdioEnv(serverConfig);
        const transportConfig: {
            command: string;
            args: string[];
            env?: Record<string, string>;
        } = {
            command: serverConfig.command!,
            args: serverConfig.args!,
        };
        if (Object.keys(env).length > 0) {
            transportConfig.env = env;
        }
        return await createMCPClient({
            transport: new StdioMCPTransport(transportConfig),
            onUncaughtError(error) {
                elizaLogger.error("MCP STDIO uncaught error:", error);
            },
        });
    }

    private async initializeSseClient(serverConfig: MCPServerConfig) {
        return await createMCPClient({
            transport: {
                type: "sse",
                url: serverConfig.url!,
                onerror(error) {
                    elizaLogger.error("MCP SSE error:", error);
                },
            },
            onUncaughtError(error) {
                elizaLogger.error("MCP SSE uncaught error:", error);
            },
        });
    }

    private async initializeClient(
        serverName: string,
        serverConfig: MCPServerConfig
    ) {
        try {
            let client;
            if (serverConfig.url) {
                client = await this.initializeSseClient(serverConfig);
            } else if (serverConfig.command && serverConfig.args) {
                client = await this.initializeStdioClient(serverConfig);
            } else {
                elizaLogger.warn(
                    `Invalid MCP server configuration for ${serverName}. Skipping.`
                );
                return null;
            }
            elizaLogger.debug(`Initialized new MCP client for ${serverName}`);
            return client;
        } catch (error) {
            elizaLogger.error(
                `Failed to initialize MCP client for ${serverName}:`,
                error
            );
            return null; // Return null on error so Promise.all can still resolve
        }
    }

    public async initialize(character: Character): Promise<any[]> {
        if (!character.mcpServers) {
            elizaLogger.warn("No MCP servers configured for this character.");
            return [];
        }

        const promises: Promise<any>[] = [];
        for (const serverName in character.mcpServers) {
            const serverConfig = character.mcpServers[serverName];
            promises.push(this.initializeClient(serverName, serverConfig));
        }

        this.clients = (await Promise.all(promises)).filter(
            (client) => client !== null
        );
        return this.clients;
    }

    public async getTools() {
        return await this.getToolsForClients(this.clients);
    }

    public async getToolsForClients(clients: any[]): Promise<ToolSet> {
        const allTools: ToolSet = {};
        for (const mcpClient of clients) {
            const tools = await mcpClient.tools();
            for (const toolName in tools) {
                allTools[toolName] = tools[toolName];
            }
        }
        return allTools;
    }

    public close() {
        elizaLogger.debug("Stopping all MCP clients.");
        this.closeClients(this.clients);
        this.clients = [];
    }

    public closeClients(clients: any[]) {
        for (const mcpClient of clients) {
            mcpClient.close();
        }
    }
}
