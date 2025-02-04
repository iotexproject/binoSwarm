import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
} from "@elizaos/core";

import { askQuickSilver } from "../services/quicksilver";
import { adaptQSResponse } from "../services/quicksilver";

export const weatherForecast: Action = {
    name: "WEATHER_FORECAST",
    similes: [
        "FORECAST",
        "FUTURE_WEATHER",
        "UPCOMING_WEATHER",
        "WEATHER_PREDICTION",
    ],
    description: "Get the weather forecast for a given location",
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "What's the weather forecast for Tokyo?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check the weather forecast for you.",
                    action: "WEATHER_FORECAST",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Will it rain in London this week?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check the weather forecast for you.",
                    action: "WEATHER_FORECAST",
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
            const forecastAnalysis = await askQuickSilver(message.content.text);
            const adaptedResponse = await adaptQSResponse(
                state,
                runtime,
                forecastAnalysis
            );
            if (callback) {
                callback({
                    text: adaptedResponse,
                    inReplyTo: message.id,
                });
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error in current weather plugin:", error);
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
