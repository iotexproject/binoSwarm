import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
} from "@elizaos/core";

import { adaptQSResponse, askQuickSilver } from "../services/quicksilver";
import { extractLocationQuestion } from "../helpers/extractors";

export const weather: Action = {
    name: "GET_WEATHER",
    similes: ["WEATHER", "WEATHER_REPORT", "WEATHER_UPDATE"],
    description:
        "Get the current weather or weather forecast for a given location",
    suppressInitialMessage: true,
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "What is the weather in Tokyo?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check the weather for you.",
                    action: "CURRENT_WEATHER",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "How's the weather looking in New York right now?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check the current weather conditions for you.",
                    action: "CURRENT_WEATHER",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Tell me about the weather in London",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the weather in London for you.",
                    action: "CURRENT_WEATHER",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What are the current conditions in Dubai?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me look up the current weather conditions in Dubai.",
                    action: "CURRENT_WEATHER",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What's the temperature range today in Moscow?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check today's temperature range in Moscow for you.",
                    action: "CURRENT_WEATHER",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What's the detailed weather report for Sydney?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me get you a detailed weather report for Sydney.",
                    action: "CURRENT_WEATHER",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What's the weather in Tokyo for the next 3 days?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the weather forecast for Tokyo over the next 3 days.",
                    action: "WEATHER",
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
            const location = await extractLocationQuestion(state, runtime);
            if (!location) {
                if (callback) {
                    callback({
                        text: `Location is not available for the given location, please try again`,
                        content: { error: "No valid location found" },
                    });
                }
                return false;
            }

            const weather = await askQuickSilver(location);
            const adaptedResponse = await adaptQSResponse(
                state,
                runtime,
                weather
            );

            if (callback) {
                callback({
                    text: adaptedResponse,
                    inReplyTo: message.id,
                });
            }

            return true;
        } catch (error) {
            console.error("Error in current weather plugin:", error);
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
