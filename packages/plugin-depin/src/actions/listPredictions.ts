import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
} from "@elizaos/core";

const formatPrediction = (prediction: any) => {
    const deadline = new Date(prediction.deadline).toLocaleDateString();

    return `"${prediction.statement}" (Due: ${deadline})`;
};

export const listPredictions: Action = {
    name: "LIST_PREDICTIONS",
    similes: ["SHOW_PREDICTIONS", "GET_PREDICTIONS", "VIEW_PREDICTIONS"],
    description: "List active predictions and their current status",
    validate: async (runtime: IAgentRuntime) => {
        return !!process.env.BINARY_PREDICTION_CONTRACT_ADDRESS;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "Show me the current predictions",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me check the latest predictions for you.",
                    action: "LIST_PREDICTIONS",
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
            const predictions = await runtime.databaseAdapter.getPredictions({
                status: "OPEN",
            });

            if (!predictions || predictions.length === 0) {
                if (callback) {
                    callback({
                        text: "There are no active predictions at the moment.",
                        inReplyTo: message.id,
                    });
                }
                return true;
            }

            // Format predictions into a numbered list
            const formattedPredictions = predictions
                .map((pred, index) => `${index + 1}. ${formatPrediction(pred)}`)
                .join("\n");

            const betText = `You can bet on them by saying "BET ON PREDICTION <number>, <amount> $SENTAI, <outcome>, <your_wallet_address>"`;

            if (callback) {
                callback({
                    text: `Here are the active predictions:\n${formattedPredictions}\n\n${betText}`,
                    inReplyTo: message.id,
                });
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error in list predictions action:", error);
            if (callback) {
                callback({
                    text: "Error retrieving predictions, please try again.",
                    inReplyTo: message.id,
                });
            }
            return false;
        }
    },
};
