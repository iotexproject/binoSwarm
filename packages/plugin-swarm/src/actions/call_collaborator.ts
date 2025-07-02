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
import { callAgentTool } from "../tools/call_agent_tool";
import { callCollaboratorTemplate } from "../templates/callCollaboratorTemplate";

export const callCollaboratorAction: Action = {
    name: "CALL_COLLABORATOR",
    description: "Call a collaborator to assist with a task.",
    examples: [],
    similes: [],
    validate: async (_runtime: IAgentRuntime) => {
        return true;
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

            state.collaborators = JSON.stringify([
                {
                    name: "BinoAI",
                    url: "https://bino.api.iotex.ai/fe48d47c-d0e7-0b69-a225-24be81967d59",
                    expertise: "IoTeX Ecosystem",
                },
            ]);

            const context = composeContext({
                state,
                template: callCollaboratorTemplate,
            });

            elizaLogger.info("callCollaboratorContext:", context);

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
