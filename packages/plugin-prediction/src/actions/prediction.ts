import { v4 } from "uuid";
import {
    Action,
    IAgentRuntime,
    Memory,
    ModelClass,
    Prediction,
    State,
    composeContext,
    elizaLogger,
    generateText,
    HandlerCallback,
} from "@elizaos/core";

import { predictionsTemplate } from "../templates";
import { createPrediction } from "../helpers/blockchain";

export const predictionAction: Action = {
    name: "CREATE_PREDICTION",
    description: "Create a prediction",
    similes: [
        "CREATE_PREDICTIONS",
        "CREATE_PREDICTION_REPORT",
        "CREATE_PREDICTION_UPDATE",
    ],
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined,
        _options: { [key: string]: unknown } = {},
        callback?: HandlerCallback
    ) => {
        const predictions = await runtime.databaseAdapter.getPredictions({
            status: "OPEN",
        });

        try {
            const predictionObject = await evaluatePredictionFromContext(
                runtime,
                message,
                state,
                predictions
            );
            elizaLogger.info(JSON.stringify(predictionObject, null, 2));

            if (predictionObject.type === "existing") {
                const existingPrediction = predictions.find(
                    (prediction) =>
                        prediction.id === predictionObject.prediction.id
                );
                if (callback) {
                    callback({
                        text: `The prediction already exists.\nPrediction: ${existingPrediction.statement}\nDeadline: ${existingPrediction.deadline}\nContract: ${existingPrediction.contract_address}`,
                    });
                }
            } else if (predictionObject.type === "new") {
                const predictionId = await handleNewPrediction(
                    runtime,
                    message,
                    predictionObject
                );
                if (callback) {
                    const contractAddress =
                        process.env.BINARY_PREDICTION_CONTRACT_ADDRESS;
                    callback({
                        text: `The prediction has been created.\nPrediction: ${predictionObject.prediction.statement}\nDeadline: ${predictionObject.prediction.deadline}\nContract: ${contractAddress}\nPrediction ID: ${predictionId}`,
                    });
                }
            }

            return true;
        } catch (error) {
            elizaLogger.error(error);
            if (callback) {
                callback({
                    text: "I'm sorry, I couldn't create the prediction.",
                });
            }
            return false;
        }
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "I bet tomorrow will be sunny",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I've logged your prediction",
                    action: "PREDICTION",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "I'm willing to stake $10 that Bitcoin will hit 100k this year",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll record your prediction and stake",
                    action: "PREDICTION",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "I wager 5 dollars the Lakers will win tonight",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I've noted your wager and prediction",
                    action: "PREDICTION",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Want to gamble $20 that it'll rain next week?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll record your gambling prediction",
                    action: "PREDICTION",
                },
            },
        ],
    ],
};

const formatPredictionsAsString = ({
    predictions,
}: {
    predictions: Prediction[];
}) => {
    return predictions
        .map((prediction: Prediction) => {
            return `Prediction: ${prediction.statement}\nid: ${prediction.id}\nDeadline: ${prediction.deadline}\nStatus: ${prediction.status}\nOutcome: ${prediction.outcome}`;
        })
        .join("\n");
};

export function parseTagContent(text: string, tag: string) {
    const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`);
    const match = text?.match(pattern);
    if (match && match[1].trim()) {
        return match[1].trim();
    }
    return null;
}

async function evaluatePredictionFromContext(
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    predictions: Prediction[]
) {
    state = (await runtime.composeState(message)) as State;
    const formattedPredictions = formatPredictionsAsString({ predictions });

    state.currentPredictions = formattedPredictions;
    state.currentTime = new Date().toISOString();

    const context = composeContext({
        state: {
            ...state,
            recentMessages: state.recentMessages
                .split("\n")
                .slice(-10, -1)
                .join("\n"),
        },
        template: predictionsTemplate,
    });

    const predictionResponse = await generateText({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
    });
    elizaLogger.info(predictionResponse);

    const predictionJson = parseTagContent(
        predictionResponse,
        "prediction_json"
    );
    return JSON.parse(predictionJson);
}

async function handleNewPrediction(
    runtime: IAgentRuntime,
    message: Memory,
    predictionObject: any
) {
    const deadlineTimeToSec =
        new Date(predictionObject.prediction.deadline).getTime() / 1000;

    const smartContractAddr = process.env
        .BINARY_PREDICTION_CONTRACT_ADDRESS as `0x${string}`;

    const smartcontractId = await createPrediction(
        runtime,
        smartContractAddr,
        predictionObject.prediction.statement,
        deadlineTimeToSec
    );
    await runtime.databaseAdapter.createPrediction({
        id: v4(),
        creator: message.userId,
        statement: predictionObject.prediction.statement,
        deadline: predictionObject.prediction.deadline,
        contract_address: smartContractAddr,
        status: "OPEN",
        smartcontract_id: smartcontractId.toString(),
    });

    return smartcontractId;
}
