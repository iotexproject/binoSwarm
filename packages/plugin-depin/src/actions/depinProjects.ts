import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";

import { adaptQSResponse } from "../services/quicksilver";
import { askQuickSilver } from "../services/quicksilver";

export const depinProjects: Action = {
    name: "DEPIN_PROJECTS",
    similes: [
        "DEPIN_TOKENS",
        "DEPIN_DATA",
        "DEPIN_STATS",
        "DEPIN_ANALYTICS",
        "PROJECT_TOKENS",
        "PROJECT_STATS",
        "PROJECT_DATA",
        "TOKEN_PROJECTS",
        "CHAIN_PROJECTS",
        "BLOCKCHAIN_PROJECTS",
        "PROJECT_ANALYTICS",
        "PROJECT_DETAILS",
    ],
    description: "Analyzes DePINScan projects",
    suppressInitialMessage: true,
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "What is the token price of Render?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check the current token price of Render for you.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Which token has a higher price: Helium or Render?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll compare the token prices of Helium and Render for you.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Can you give me the prices of all available tokens?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll fetch the current prices of all available tokens for you.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Which token costs more than $200?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check which tokens are currently priced above $200.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What is the market cap of Render?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll look up the current market cap of Render for you.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Can you give me the categories for Solana?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check what categories Solana belongs to.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What is the fully diluted valuation of Helium?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me look up the fully diluted valuation of Helium for you.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What are the projects running on Solana?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check which projects are currently running on Solana.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What is the token price of an unlisted project?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check if I can find any information about this project's token price.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "What is the launch date of Solana?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll look up Solana's launch date for you.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Can you tell me the founder of Render?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check who founded Render.",
                    action: "DEPIN_PROJECTS",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Do you have the total supply for Helium?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll look up the total supply information for Helium.",
                    action: "DEPIN_PROJECTS",
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
            const text = await askQuickSilver(message.content.text);
            const adaptedResponse = await adaptQSResponse(state, runtime, text);
            if (callback) {
                callback({
                    text: adaptedResponse,
                    inReplyTo: message.id,
                });
            }
            return true;
        } catch (error) {
            console.error("Error in depin project plugin:", error);
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
