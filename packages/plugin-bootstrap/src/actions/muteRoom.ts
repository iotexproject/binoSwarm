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
import { shouldMuteTemplate } from "../templates";

export const muteRoomAction: Action = {
    name: "MUTE_ROOM",
    similes: [
        "MUTE_CHAT",
        "MUTE_CONVERSATION",
        "MUTE_ROOM",
        "MUTE_THREAD",
        "MUTE_CHANNEL",
    ],
    description:
        "Mutes a room, ignoring all messages unless explicitly mentioned. Only do this if explicitly asked to, or if you're annoying people.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const roomId = message.roomId;
        const userState = await runtime.databaseAdapter.getParticipantUserState(
            roomId,
            runtime.agentId
        );
        return userState !== "MUTED";
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        options: any
    ) => {
        async function _shouldMute(
            state: State,
            message: Memory
        ): Promise<boolean> {
            const shouldMuteContext = composeContext({
                state,
                template: shouldMuteTemplate, // Define this template separately
            });

            const response = await generateTrueOrFalse({
                runtime,
                context: shouldMuteContext,
                modelClass: ModelClass.SMALL,
                message,
                tags: ["mute-room-action", "should-mute"],
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
            actionName: muteRoomAction.name,
            tags: options.tags || ["bootstrap", "mute-room"],
        });

        if (await _shouldMute(state, message)) {
            await runtime.databaseAdapter.setParticipantUserState(
                message.roomId,
                runtime.agentId,
                "MUTED"
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "{{user3}}, please mute this channel. No need to respond here for now.",
                },
            },
            {
                user: "{{user3}}",
                content: {
                    text: "Got it",
                    action: "MUTE_ROOM",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "@{{user1}} we could really use your input on this",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "{{user3}}, please mute this channel for the time being",
                },
            },
            {
                user: "{{user3}}",
                content: {
                    text: "Understood",
                    action: "MUTE_ROOM",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Hey what do you think about this new design",
                },
            },
            {
                user: "{{user3}}",
                content: {
                    text: "",
                    action: "IGNORE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "{{user2}} plz mute this room",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "np going silent",
                    action: "MUTE_ROOM",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "whos going to the webxr meetup in an hour btw",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "",
                    action: "IGNORE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "too many messages here {{user2}}",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "my bad ill mute",
                    action: "MUTE_ROOM",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "yo {{user2}} dont talk in here",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "sry",
                    action: "MUTE_ROOM",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
