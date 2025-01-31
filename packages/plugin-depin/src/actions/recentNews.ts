import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
} from "@elizaos/core";

import { adaptQSResponse, askQuickSilver } from "../services/quicksilver";

export const recentNews: Action = {
    name: "NEWS",
    similes: [],
    description: "Provide real time news",
    suppressInitialMessage: true,
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "What is the latest news about Trump?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check the latest news about Trump.",
                    action: "NEWS",
                },
            },
        ],
    ],
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        try {
            if (callback) {
                callback({
                    text: "Collecting data from Quicksilver...",
                });
            }
            const news = await askQuickSilver(message.content.text);
            const adaptedResponse = await adaptQSResponse(state, runtime, news);

            if (callback) {
                callback({
                    text: adaptedResponse,
                    inReplyTo: message.id,
                });
            }

            return true;
        } catch (error) {
            console.error("Error in current depin plugin:", error);
            if (callback) {
                callback({
                    text: `Error processing request, try again`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
};
