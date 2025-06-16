import {
    HandlerCallback,
    Memory,
    IAgentRuntime,
    State,
    type Action,
} from "@elizaos/core";

export const mcpAction: Action = {
    name: "call_mcp",
    description: "Call MCP",
    examples: [],
    similes: [],
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: any,
        _callback?: HandlerCallback
    ) => {
        console.log("CALL_MCP action executed with props:");
    },
};
