import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
} from "@elizaos/core";

import { adaptQSResponse, askQuickSilver } from "../services/quicksilver";

export const nuclearOutages: Action = {
    name: "NuclearOutages",
    similes: ["NUCLEAR_STATUS", "POWER_OUTAGES", "NUCLEAR_CAPACITY"],
    description:
        "Fetches nuclear power plant outage data in the United States for a specified date range",
    suppressInitialMessage: true,
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "What are the current nuclear power plant outages in the US?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the current nuclear power plant outages in the United States.",
                    action: "NuclearOutages",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Show me nuclear plant capacity data for this week",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll fetch the nuclear power plant capacity data for this week.",
                    action: "NuclearOutages",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What's the percentage of nuclear plants experiencing outages?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the current percentage of nuclear power plant outages.",
                    action: "NuclearOutages",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Get me the nuclear regulatory commission outage report",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll retrieve the latest Nuclear Regulatory Commission outage report.",
                    action: "NuclearOutages",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What was the nuclear power capacity last month?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the nuclear power capacity data for last month.",
                    action: "NuclearOutages",
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
            const outageData = await askQuickSilver(message.content.text);
            const adaptedResponse = await adaptQSResponse(
                state,
                runtime,
                outageData
            );

            if (callback) {
                callback({
                    text: adaptedResponse,
                    inReplyTo: message.id,
                });
            }

            return true;
        } catch (error) {
            console.error("Error in nuclear outages plugin:", error);
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
