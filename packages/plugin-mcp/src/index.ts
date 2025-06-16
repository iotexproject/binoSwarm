export * from "./actions";

import type { Plugin } from "@elizaos/core";

import { mcpAction } from "./actions";

export const mcpPlugin: Plugin = {
    name: "mcp",
    description: "MCP plugin",
    providers: [],
    evaluators: [],
    services: [],
    actions: [mcpAction],
};
