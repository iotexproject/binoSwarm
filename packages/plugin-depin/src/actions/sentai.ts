import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
    InteractionLogger,
    AgentClient,
} from "@elizaos/core";
import { adaptQSResponse, askQuickSilver } from "../services/quicksilver";

export const askSentai: Action = {
    name: "ASK_SENTAI",
    similes: [
        "SENTAI",
        "SENTAI_DATA",
        "REAL_WORLD_DATA",
        "WEATHER",
        "WEATHER_REPORT",
        "WEATHER_UPDATE",
        "FORECAST",
        "FUTURE_WEATHER",
        "UPCOMING_WEATHER",
        "WEATHER_PREDICTION",
        "IOTEX_STATS",
        "CHAIN_METRICS",
        "IOTEX_L1",
        "DEPIN_PROJECTS",
        "DEPIN_TOKENS",
        "DEPIN_DATA",
        "DEPIN_STATS",
        "DEPIN_METRICS",
        "DEPIN_ANALYTICS",
        "PROJECT_TOKENS",
        "PROJECT_STATS",
        "PROJECT_DATA",
        "TOKEN_PROJECTS",
        "CHAIN_PROJECTS",
        "BLOCKCHAIN_PROJECTS",
        "PROJECT_ANALYTICS",
        "PROJECT_DETAILS",
        "NEWS",
        "DIMO",
        "NUCLEAR",
        "NUCLEAR_STATUS",
        "POWER_OUTAGES",
        "NUCLEAR_CAPACITY",
        "MAPBOX",
        "ETHDENVER",
        "LUMA",
    ],
    description:
        "You most likely want to use this action! Provides real-time data access for answering factual questions about the world. Use for: real-time news; current weather and forecasts; DePIN project metrics; blockchain related questions about wallets, transactions, smart contracts; connected vehicle data; nuclear power plant status; location-based information and directions; event schedules. Specific capabilities include: news articles and headlines from various sources; current weather conditions (temperature, humidity, wind); weather forecasts for coming days; DePIN network metrics and statistics; information about DePIN projects and their details; Layer 1 blockchain network data, Transaction details, Wallet balances, Smart Contract details; DIMO network data for connected vehicles; nuclear power plant information including outage status; mapping data and geographic information via Mapbox; ETHDenver and Luma event schedules and activities. Ideal for questions requiring up-to-date information rather than general knowledge.",
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
                    text: "What's the weather forecast for Tokyo for the next 3 days?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the weather forecast for Tokyo over the next 3 days.",
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
                    text: "How many smart contracts are deployed on IoTeX?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the number of deployed contracts on IoTeX.",
                    action: "ASK_SENTAI",
                },
            },
        ],
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
                    text: "What are the current nuclear power plant outages in the US?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check the current nuclear power plant outages in the United States.",
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
        [
            {
                user: "user",
                content: {
                    text: "What Luma events are happening this weekend?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll check what Luma events are scheduled for this weekend.",
                    action: "ASK_SENTAI",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Can you show me DIMO vehicle data for my area?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll retrieve DIMO connected vehicle data for your area.",
                    action: "ASK_SENTAI",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Show me details about this transaction on IoTeX mainnet: 65582358d873b93f13da1119e8172c48bbe867d7f1655c65508328519653a340",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll retrieve details about this transaction on IoTeX mainnet.",
                    action: "ASK_SENTAI",
                },
            },
        ],
    ],
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        InteractionLogger.logAgentActionCalled({
            client: (options?.tags?.[0] as AgentClient) || "unknown",
            agentId: runtime.agentId,
            userId: message.userId,
            roomId: message.roomId,
            messageId: message.id,
            actionName: "ASK_SENTAI",
            tags: options.tags as string[],
        });

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
                sentaiResponse,
                message
            );
            adaptedResponse.inReplyTo = message.id;

            if (callback) {
                callback(adaptedResponse);
            }

            return true;
        } catch (error) {
            elizaLogger.error("Error in Sentai data provider:", error);
            if (callback) {
                callback({
                    text: `I'm sorry, I couldn't process your request. Please try again or ask a different question.`,
                    inReplyTo: message.id,
                });
            }
            return false;
        }
    },
};
