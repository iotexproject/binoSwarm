import {
    HandlerCallback,
    Memory,
    IAgentRuntime,
    State,
    type Action,
    Content,
    elizaLogger,
    composeContext,
    ModelClass,
    generateTextWithTools,
} from "@elizaos/core";
import { callAgentTool } from "../tools/callAgentTool";
import { callCollaboratorTemplate } from "../templates/callCollaboratorTemplate";

export const callCollaboratorAction: Action = {
    name: "CALL_COLLABORATOR",
    description:
        "Call a collaborator when the current agent's expertise is insufficient and a better available agent with more focused expertise in the user's question area exists.",
    examples: [],
    similes: [],
    validate: async (_runtime: IAgentRuntime) => {
        return !!process.env.EVM_PRIVATE_KEY;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback?: HandlerCallback
    ) => {
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        try {
            if (!callback) {
                return false;
            }

            const context = composeContext({
                state,
                template: callCollaboratorTemplate,
            });

            const result = await generateTextWithTools({
                runtime,
                context,
                enableGlobalMcp: false,
                modelClass: ModelClass.LARGE,
                tools: [callAgentTool],
            });

            const response: Content = {
                text: result,
                inReplyTo: message.id,
            };

            callback(response);

            return true;
        } catch (error) {
            elizaLogger.error("Error in CALL_COLLABORATOR action:", error);
            callback?.({
                text: "Could not call collaborator for you, try rephrasing your question.",
                inReplyTo: message.id,
            });
            return false;
        }
    },
};
