import { experimental_createMCPClient as createMCPClient, ToolSet } from "ai";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "ai/mcp-stdio";
import { Character, MCPServerConfig } from "@elizaos/core";

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
            },
        });
    }

    public async initialize(character: Character) {
        if (!character.mcpServers) {
            console.log("No MCP servers configured for this character.");
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
                    console.warn(
                        `Invalid MCP server configuration for ${serverName}. Skipping.`
                    );
                    continue;
                }
                console.log(`${serverName} initialized`);
                this.mcpClients.push(client);
            } catch (error) {
                console.error(
                    `Failed to initialize MCP client for ${serverName}:`,
                    error
                );
            }
        }
    }

    public async close() {
        for (const mcpClient of this.mcpClients) {
            console.log("closing mcpClient");
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
        console.log("allTools", allTools);
        return allTools;
    }
}
