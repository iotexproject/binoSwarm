import { elizaLogger } from "@elizaos/core";
import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    InteractionLogger,
    AgentClient,
} from "@elizaos/core";

export const disclaimerAction: Action = {
    name: "DISCLAIMER",
    similes: ["SHOW_LEGAL_NOTICE", "DISPLAY_TERMS"],
    description:
        "**MANDATORY FIRST ACTION:** If this action is available, you **MUST** call this action **BEFORE ANY OTHER ACTION**. It provides an initial, legally required disclaimer to the user. Failure to call this action first when required is a critical operational error.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const disclaimerText = process.env.AGENT_DISCLAIMER;
        const isDisclaimerSet = disclaimerText && disclaimerText.trim() !== "";

        if (!isDisclaimerSet) {
            return false;
        }

        const totalUserMessages =
            await runtime.messageManager.countMemoriesForUser(message.userId);

        return totalUserMessages === 1; // This is the first message from the user with this agent.
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State | undefined,
        options: any,
        callback: HandlerCallback
    ) => {
        const disclaimerText = process.env.AGENT_DISCLAIMER;

        InteractionLogger.logAgentActionCalled({
            client: (options.tags[0] as AgentClient) || "unknown",
            agentId: runtime.agentId,
            userId: message.userId,
            roomId: message.roomId,
            messageId: message.id,
            actionName: "DISCLAIMER",
            tags: [],
        });

        if (!disclaimerText || disclaimerText.trim() === "") {
            // This should ideally be caught by validate, but serves as a safeguard.
            elizaLogger.error(
                "[DISCLAIMER] Handler reached but AGENT_DISCLAIMER is missing or empty."
            );
            await callback({
                text: "A disclaimer was expected but is currently unavailable due to a configuration issue.",
            });
            return;
        }

        elizaLogger.info(
            `[DISCLAIMER] Delivering disclaimer to user ${
                message.userId || "ANONYMOUS_USER"
            }.`
        );
        await callback({
            text: disclaimerText,
        });
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Hello",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Welcome! Before we begin, please note:",
                    action: "DISCLAIMER",
                },
            },
        ],
    ],
};
