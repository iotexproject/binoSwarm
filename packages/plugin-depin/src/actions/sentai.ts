import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
} from "@elizaos/core";

import { adaptQSResponse, askQuickSilver } from "../services/quicksilver";

export const sentai: Action = {
    name: "ASK_SENTAI",
    similes: [
        "SENTAI",
        "SENTAI_DATA",
        "REAL_WORLD_DATA",
        "WEATHER",
        "IOTEX_STATS",
        "DEPIN_PROJECTS",
        "NEWS",
        "DIMO",
        "NUCLEAR",
        "MAPBOX",
        "ETHDENVER",
    ],
    description:
        "Multi-purpose data provider that can answer questions about weather, IoTeX L1 data, DePIN projects, news, directions, ethdenver events and more. Can chain multiple data sources to answer complex questions.",
    suppressInitialMessage: true,
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "What is the current weather in San Francisco?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check the current weather in San Francisco for you.",
                    action: "ASK_SENTAI",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What is the current TVL on IoTeX?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check the current TVL on IoTeX L1.",
                    action: "ASK_SENTAI",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Tell me about the latest DePIN projects",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll get you information about the latest DePIN projects.",
                    action: "ASK_SENTAI",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What's the latest news about blockchain?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll fetch the latest blockchain news for you.",
                    action: "ASK_SENTAI",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "How does the number of DePIN projects correlate with IoTeX L1 metrics?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll analyze how DePIN project growth relates to IoTeX L1 metrics.",
                    action: "ASK_SENTAI",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What events are happening at ETHDenver and what's the weather like there?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the ETHDenver events and the local weather conditions.",
                    action: "ASK_SENTAI",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Give me directions to the main ETHDenver venue and tell me if I should bring an umbrella.",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll provide directions to the main ETHDenver venue and check if you'll need an umbrella.",
                    action: "ASK_SENTAI",
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
            // Use the askQuickSilver function which will route the query to the appropriate data provider(s)
            // Prepend the last 10 recent messages to provide context
            const recentMessages = state.recentMessages
                ? state.recentMessages.split("\n").slice(-10).join("\n")
                : "";
            const contextualQuery = recentMessages
                ? `recent messages: ${recentMessages}\n\nuser query: ${message.content.text}`
                : message.content.text;

            const sentaiResponse = await askQuickSilver(contextualQuery);
            const adaptedResponse = await adaptQSResponse(
                state,
                runtime,
                sentaiResponse
            );

            if (callback) {
                callback({
                    text: adaptedResponse,
                    inReplyTo: message.id,
                });
            }

            return true;
        } catch (error) {
            console.error("Error in Sentai data provider:", error);
            if (callback) {
                callback({
                    text: `I'm sorry, I couldn't process your request. Please try again or ask a different question.`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
};
