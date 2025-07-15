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
    InteractionLogger,
    AgentClient,
} from "@elizaos/core";
import { callAgentTool } from "../tools/callAgentTool";
import { callCollaboratorTemplate } from "../templates/callCollaboratorTemplate";

export const callCollaboratorAction: Action = {
    name: "CALL_COLLABORATOR",
    description:
        "Call a collaborator when the current agent's expertise is insufficient and a better available agent with more focused expertise in the user's question area exists.",
    examples: [],
    similes: [],
    validate: async (runtime: IAgentRuntime) => {
        return (
            !!process.env.EVM_PRIVATE_KEY &&
            !!runtime.character?.collaborators?.length
        );
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

        InteractionLogger.logAgentActionCalled({
            client: (options.tags?.[0] as AgentClient) || "unknown",
            agentId: runtime.agentId,
            userId: message.userId,
            roomId: message.roomId,
            messageId: message.id,
            actionName: callCollaboratorAction.name,
            tags: options.tags as string[],
        });

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
                message,
                functionId: "CALL_COLLABORATOR",
                tags: options.tags,
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
