import { v4 } from "uuid";
import { composeContext, generateText, State, Prediction } from "@elizaos/core";
import {
    ActionExample,
    IAgentRuntime,
    Memory,
    ModelClass,
    Evaluator,
    elizaLogger,
} from "@elizaos/core";

import { predictionsTemplate } from "../template/predictions";
import { createPrediction, getNetwork } from "../helpers/blockchain";

async function handler(
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined
) {
    state = (await runtime.composeState(message)) as State;
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
        elizaLogger.debug(JSON.stringify(predictionObject, null, 2));

        if (predictionObject.type === "new") {
            await handleNewPrediction(runtime, message, predictionObject);
        }
        return true;
    } catch (error) {
        elizaLogger.error(error);
        return false;
    }
}

export const predictionEvaluator: Evaluator = {
    name: "GET_PREDICTIONS",
    similes: [
        "EXTRACT_PREDICTIONS",
        "GET_FORECAST",
        "EXTRACT_FORECAST",
        "GET_BETS",
        "EXTRACT_BETS",
    ],
    validate: async (
        runtime: IAgentRuntime,
        _message: Memory
    ): Promise<boolean> => {
        if (!process.env.BINARY_PREDICTION_CONTRACT_ADDRESS) {
            return false;
        }
        const predictions = await runtime.databaseAdapter.getPredictions({
            status: "OPEN",
        });
        try {
            const maxPredictions = parseInt(
                process.env.MAX_ONGOING_PREDICTIONS || "20"
            );
            return predictions.length < maxPredictions;
        } catch (error) {
            return false;
        }
    },
    description:
        "Extract weather predictions from the conversation, including any associated stakes or bets.",
    handler,
    examples: [
        {
            context: `Recent conversation about weather`,
            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "I bet it will rain next Tuesday" },
                },
                {
                    user: "{{user2}}",
                    content: { text: "I'll bet you $10 it won't" },
                },
                {
                    user: "{{user1}}",
                    content: { text: "Deal!" },
                },
            ] as ActionExample[],
            outcome: `
<response>
  {
    "statement": "It will rain next Tuesday",
    "deadline": "2024-03-26",
  }
</response>`,
        },
    ],
};

const formatPredictionsAsString = ({
    predictions,
}: {
    predictions: Prediction[];
}) => {
    return predictions
        .map((prediction: Prediction) => {
            return `Prediction: ${prediction.statement}\nid: ${prediction.id}\nDeadline: ${prediction.deadline}\nStatus: ${prediction.status}\n`;
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

    state.existingPredictions = formattedPredictions;
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

    const predictionJson = parseTagContent(predictionResponse, "response");
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

    const network = getNetwork();

    const smartcontractId = await createPrediction(
        runtime,
        smartContractAddr,
        predictionObject.prediction.statement,
        deadlineTimeToSec,
        network
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
