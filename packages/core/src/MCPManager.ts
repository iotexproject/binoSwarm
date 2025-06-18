import { experimental_createMCPClient as createMCPClient, ToolSet } from "ai";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "ai/mcp-stdio";
import { Character, MCPServerConfig } from "./types";
import { elizaLogger } from "./logger";

export class MCPManager {
    private mcpClients: any[] = [];

    constructor() {
        // Constructor initializes an empty array for MCP clients.
    }

    private async initializeStdioClient(serverConfig: MCPServerConfig) {
        return await createMCPClient({
            transport: new StdioMCPTransport({
                command: serverConfig.command!,
                args: serverConfig.args!,
            }),
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

    public async initialize(character: Character) {
        if (!character.mcpServers) {
            elizaLogger.warn("No MCP servers configured for this character.");
            return;
        }

        for (const serverName in character.mcpServers) {
            const serverConfig = character.mcpServers[serverName];
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
                    continue;
                }
                elizaLogger.debug(`${serverName} initialized`);
                this.mcpClients.push(client);
            } catch (error) {
                elizaLogger.error(
                    `Failed to initialize MCP client for ${serverName}:`,
                    error
                );
            }
        }
    }

    public async close() {
        for (const mcpClient of this.mcpClients) {
            elizaLogger.debug("closing mcpClient");
            await mcpClient.close();
        }
        this.mcpClients = [];
    }

    public async getTools() {
        const allTools: ToolSet = {};
        for (const mcpClient of this.mcpClients) {
            const tools = await mcpClient.tools();
            for (const toolName in tools) {
                allTools[toolName] = tools[toolName];
            }
        }
        elizaLogger.debug("allTools", allTools);
        return allTools;
    }
}
