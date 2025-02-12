import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
} from "@elizaos/core";

import { adaptQSResponse, askQuickSilver } from "../services/quicksilver";

export const iotexL1: Action = {
    name: "L1Data",
    similes: ["IOTEX_STATS", "CHAIN_METRICS", "IOTEX_L1"],
    description: "Fetches IoTeX L1 chain statistics and metrics",
    suppressInitialMessage: true,
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
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
                    action: "L1Data",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "How many smart contracts are deployed on IoTeX?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the number of deployed contracts on IoTeX.",
                    action: "L1Data",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What's the current staking amount on IoTeX?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll fetch the current staking statistics for IoTeX.",
                    action: "L1Data",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Show me IoTeX network statistics",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll get you the current IoTeX network statistics.",
                    action: "L1Data",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "How many XRC20 tokens are there on IoTeX?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the number of XRC20 tokens on IoTeX.",
                    action: "L1Data",
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
            const l1Data = await askQuickSilver(message.content.text);
            const adaptedResponse = await adaptQSResponse(
                state,
                runtime,
                l1Data
            );

            if (callback) {
                callback({
                    text: adaptedResponse,
                    inReplyTo: message.id,
                });
            }

            return true;
        } catch (error) {
            console.error("Error in IoTeX L1 data plugin:", error);
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
