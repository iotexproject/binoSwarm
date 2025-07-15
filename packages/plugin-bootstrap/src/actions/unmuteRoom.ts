import { composeContext } from "@elizaos/core";
import { generateTrueOrFalse } from "@elizaos/core";
import {
    Action,
    ActionExample,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    InteractionLogger,
    AgentClient,
} from "@elizaos/core";
import { shouldUnmuteTemplate } from "../templates";

export const unmuteRoomAction: Action = {
    name: "UNMUTE_ROOM",
    similes: [
        "UNMUTE_CHAT",
        "UNMUTE_CONVERSATION",
        "UNMUTE_ROOM",
        "UNMUTE_THREAD",
    ],
    description:
        "Unmutes a room, allowing the agent to consider responding to messages again.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const roomId = message.roomId;
        const userState = await runtime.databaseAdapter.getParticipantUserState(
            roomId,
            runtime.agentId
        );
        return userState === "MUTED";
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        options: any,
    ) => {
        async function _shouldUnmute(state: State, message: Memory): Promise<boolean> {
            const shouldUnmuteContext = composeContext({
                state,
                template: shouldUnmuteTemplate, // Define this template separately
            });

            const response = generateTrueOrFalse({
                context: shouldUnmuteContext,
                runtime,
                modelClass: ModelClass.SMALL,
                message,
                tags: ["unmute-room-action", "should-unmute"],
            });

            return response;
        }

        const state = await runtime.composeState(message);

        InteractionLogger.logAgentActionCalled({
            client: (options.tags?.[0] as AgentClient) || "unknown",
            agentId: runtime.agentId,
            userId: message.userId,
            roomId: message.roomId,
            messageId: message.id,
            actionName: unmuteRoomAction.name,
            tags: options.tags || ["bootstrap", "unmute-room"],
        });

        if (await _shouldUnmute(state, message)) {
            await runtime.databaseAdapter.setParticipantUserState(
                message.roomId,
                runtime.agentId,
                null
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "{{user3}}, you can unmute this channel now",
                },
            },
            {
                user: "{{user3}}",
                content: {
                    text: "Done",
                    action: "UNMUTE_ROOM",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I could use some help troubleshooting this bug.",
                },
            },
            {
                user: "{{user3}}",
                content: {
                    text: "Can you post the specific error message",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "{{user2}}, please unmute this room. We could use your input again.",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Sounds good",
                    action: "UNMUTE_ROOM",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "{{user2}} wait you should come back and chat in here",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "im back",
                    action: "UNMUTE_ROOM",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "unmute urself {{user2}}",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "unmuted",
                    action: "UNMUTE_ROOM",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "ay {{user2}} get back in here",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "sup yall",
                    action: "UNMUTE_ROOM",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
