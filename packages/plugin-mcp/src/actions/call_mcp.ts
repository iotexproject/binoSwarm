import {
    HandlerCallback,
    Memory,
    IAgentRuntime,
    State,
    type Action,
    composeContext,
    ModelClass,
    generateTextWithTools,
    Content,
    elizaLogger,
} from "@elizaos/core";

import { mcpTemplate } from "../templates/mcpTemplate";

export const mcpAction: Action = {
    name: "CALL_MCP_TOOLS",
    description:
        "Call MCP Tools. Only call this action if you see a list of available tools in the <availableMCPTools> tag.",
    examples: [],
    similes: [],
    validate: async (runtime: IAgentRuntime) => {
        return Object.keys(runtime.character.mcpServers).length > 0;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback?: HandlerCallback
    ) => {
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const context = composeContext({
            state,
            template: mcpTemplate,
        });

        try {
            const result = await generateTextWithTools({
                runtime,
                context,
                modelClass: ModelClass.LARGE,
                tools: [],
                message,
                functionId: "CALL_MCP_TOOLS",
                tags: options.tags,
            });

            const response: Content = {
                text: result,
                inReplyTo: message.id,
            };

            if (callback) {
                callback(response);
            }

            return true;
        } catch (error) {
            elizaLogger.error("Error in CALL_MCP_TOOLS action:", error);
            callback?.({
                text: "Could not call MCP Tools for ya, try rephrasing your question.",
                inReplyTo: message.id,
            });
            return false;
        }
    },
};
