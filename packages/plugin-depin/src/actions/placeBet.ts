import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
    composeContext,
    ModelClass,
    generateText,
    parseTagContent,
} from "@elizaos/core";

import { placeBet as executeBlockchainBet } from "../helpers/blockchain";

const extractTxHash = (text: string): string | null => {
    // Match Ethereum/IoTeX transaction hash pattern
    const regex = /0x[a-fA-F0-9]{64}/;
    const match = text.match(regex);
    return match ? match[0] : null;
};

export const placeBet: Action = {
    name: "PLACE_BET",
    similes: ["EXECUTE_BET", "CONFIRM_BET", "FINALIZE_BET"],
    description: "Place a bet after token approval is confirmed",
    validate: async (runtime: IAgentRuntime) => {
        return !!process.env.BINARY_PREDICTION_CONTRACT_ADDRESS;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "BET 123 APPROVED: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Great! I'm placing your bet now. I'll let you know once it's confirmed.",
                    action: "PLACE_BET",
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
        try {
            const txHash = extractTxHash(message.content.text);
            if (!txHash) {
                if (callback) {
                    callback({
                        text: "I couldn't find a valid transaction hash in your message. Please provide the approval transaction hash.",
                        inReplyTo: message.id,
                    });
                }
                return false;
            }

            const betParams = await extractBetParamsFromContext(
                runtime,
                state,
                message.content.text
            );
            if (!betParams) {
                if (callback) {
                    callback({
                        text: "This prediction is no longer available for betting.",
                        inReplyTo: message.id,
                    });
                }
                return false;
            }

            const network = process.env.PREDICTION_NETWORK;
            if (network !== "iotexTestnet" && network !== "iotex") {
                throw new Error("Invalid network");
            }

            if (callback) {
                callback({
                    text: "Processing your bet...",
                    inReplyTo: message.id,
                });
            }

            // Place the bet on the blockchain
            const betResult = await executeBlockchainBet(
                runtime,
                betParams.predictionId,
                betParams.outcome,
                betParams.amount,
                betParams.bettor as `0x${string}`,
                network
            );

            if (callback) {
                callback({
                    text: `Your bet has been placed successfully!\n\nPrediction: "${betParams.statement}"\nYour bet: ${betParams.outcome ? "Yes" : "No"}\nAmount: ${betResult.betAmount}\nBettor: ${betResult.bettor}\nTransaction: ${betResult.hash}`,
                    inReplyTo: message.id,
                });
            }

            return true;
        } catch (error) {
            elizaLogger.error("Error in place bet action:", error);

            // Check if it's an allowance error
            if (
                error instanceof Error &&
                error.message.includes("Insufficient allowance")
            ) {
                if (callback) {
                    callback({
                        text: "The token approval transaction hasn't been confirmed yet. Please wait a few moments and try again.",
                        inReplyTo: message.id,
                    });
                }
                return false;
            }

            if (callback) {
                callback({
                    text: "There was an error placing your bet. Please try again.",
                    inReplyTo: message.id,
                });
            }
            return false;
        }
    },
};

interface BetParams {
    bettor: `0x${string}`;
    amount: string;
    outcome: boolean;
    predictionId: number;
    statement: string;
}

async function extractBetParamsFromContext(
    runtime: IAgentRuntime,
    state: State,
    message: string
): Promise<BetParams> {
    const predictions = await runtime.databaseAdapter.getPredictions({
        status: "OPEN",
    });
    state.existingPredictions = predictions;
    state.userMessage = message;
    const context = composeContext({
        state,
        template: placeBetTemplate,
    });

    const betResponse = await generateText({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
    });

    const withoutTags = parseTagContent(betResponse, "response");

    return JSON.parse(withoutTags);
}

const placeBetTemplate = `
Extract bettor address, bet amount, outcome from approved bets and relate it to one of the predictions:

<existing_predictions>
{{existingPredictions}}
</existing_predictions>

<recent_messages>
{{recentMessages}}
</recent_messages>

<user_message>
{{userMessage}}
</user_message>

<example>
<current_prediction_example>
1. Prediction: It will rain tomorrow in London
id: 0

2. Prediction: Bitcoin price will exceed $50k by the end of the month
id: 3

3. Prediction: Ethereum gas fees will be under 20 Gwei tomorrow at noon
id: 1
</current_prediction_example>

<previous_context_with_predictions>
existing predictions:
1. Prediction: It will rain tomorrow in London
Deadline: Sat Jan 18 2025 12:00:00

2. Prediction: Bitcoin price will exceed $50k by the end of the month
Deadline: Fri Jan 31 2025 23:59:59

3. Prediction: Ethereum gas fees will be under 20 Gwei tomorrow at noon
Deadline: Sat Jan 18 2025 12:00:00
</previous_context_with_predictions>
<recent_messages_example>
- BET ON PREDICTION 1, 100 $SENTAI, true, 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
- BetID: 123, 1. 0x742d35Cc6634C0532925a3b844Bc454e4438f44e, 100 $SENTAI, true. Tx data: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
- BET 123 APPROVED: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
</recent_messages_example>

<response>
{
  "reasoning": "The user is betting that it will rain tomorrow in London with 100 $SENTAI and he approved the bet.",
  "statement": "It will rain tomorrow in London",
  "bettor": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "amount": "100",
  "outcome": true,
  "predictionId": 1
}
</response>
</example>

Now extract the bettor, amount, outcome, and predictionId from the context and return it in the <response> tags.
`;
