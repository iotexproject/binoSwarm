# Model Context Provider (MCP) Plugin

The Model Context Provider (MCP) plugin empowers your agent to interact with external systems and data providers, known as MCP servers. This extends the agent's capabilities beyond its foundational knowledge base, allowing it to access real-time data, execute commands, and perform actions through a decentralized network of services.

## Enabling the MCP Plugin

Follow these steps to enable and configure the MCP plugin for your agent:

### Step 1: Update `character.json`

To integrate the MCP plugin, you must add it to your agent's `character.json` file. This involves two key modifications:

1. **Add to `plugins` array**: Include `@elizaos/plugin-mcp` in the `plugins` array, ensuring the system loads the plugin.

    ```json
    {
        "name": "your-agent-name",
        "clients": ["discord"],
        "plugins": ["@elizaos/plugin-mcp"]
        // ... existing code ...
    }
    ```

2. **Configure `mcpServers`**: After the `"settings"` object, add an `"mcpServers"` block. This block defines the external MCP servers your agent can connect to. Each server configuration specifies a unique name (e.g., `"airbnb"`), the command to execute the server, and any necessary arguments.

    ```json
    {
        "name": "your-agent-name",
        // ... existing code ...
        "settings": {
            "secrets": {
                // ... existing code ...
            },
            "chains": {
                // ... existing code ...
            },
            "ragKnowledge": true
        },
        "mcpServers": {
            "airbnb": {
                "description": "Airbnb MCP server, capabilities include: ... ",
                "command": "npx",
                "args": ["-y", "@somedev/mcp-server-example"]
            },
            "sentai": {
                "description": "Sentai MCP server, capabilities include: ... ",
                "url": "https://somemcpexample.ai/sse"
            }
            // Add more MCP servers here as needed
        }
    }
    ```

### Step 2: Add Placeholders to Message Handler Templates

For your agent to properly utilize the available MCP tools, you must include specific placeholders in your message handler templates (e.g., for Discord, Twitter, Telegram, or a default message handler). This allows the agent's response generation to incorporate the tools provided by the MCP servers.

Add the following placeholder within the appropriate section of your message handler templates:

```
...<availableMCPTools>{{availableMCPTools}}</availableMCPTools>...
```

This placeholder will expose the available MCP tools to your agent, enabling it to reference and use them in its interactions. Make sure to place it where the agent's context for available actions is defined.

## Discovering MCP Servers

You can find a variety of pre-built MCP servers to extend your agent's capabilities from the following resources:

- [https://github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)
- [https://github.com/punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)
- [https://mcp.composio.dev](https://mcp.composio.dev)
