import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
    generateText,
    ModelClass,
    parseTagContent,
} from "@elizaos/core";

import { genTxDataForAllowance } from "../helpers/blockchain";

interface ApprovalParams {
    amount: number;
    address: `0x${string}`;
    outcome: boolean;
    predictionId: number;
    txData?: `0x${string}`;
}

export const prepareBet: Action = {
    name: "APPROVE_BET",
    similes: ["SETUP_BET", "INITIALIZE_BET", "PREPARE_BET"],
    description: "Approve and prepare a bet before placing it",
    validate: async (_runtime: IAgentRuntime) => {
        return !!process.env.BINARY_PREDICTION_CONTRACT_ADDRESS;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "PREPARE A BET FOR PREDICTION 1, 100 $SENTAI, true, 0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Confirm the following bets:",
                    action: "PREPARE_BET",
                },
            },
        ],
    ],
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        try {
            const betParams = await extractBetParamsFromContext(
                runtime,
                message.content.text
            );
            if (!betParams) {
                if (callback) {
                    callback({
                        text: "Valid bet not found, please try again.",
                        inReplyTo: message.id,
                    });
                }
                return false;
            }

            const betWithTx = {
                txData: genTxDataForAllowance(betParams.amount),
                address: betParams.address,
                amount: betParams.amount,
                predictionId: betParams.predictionId,
                outcome: betParams.outcome,
            };

            if (callback) {
                callback({
                    text: prepareBetResponse(betWithTx),
                    inReplyTo: message.id,
                });
            }

            return true;
        } catch (error) {
            elizaLogger.error("Error in prepare bet action:", error);
            if (callback) {
                callback({
                    text: "Error preparing your bet. Please try again.",
                    inReplyTo: message.id,
                });
            }
            return false;
        }
    },
};

async function extractBetParamsFromContext(
    runtime: IAgentRuntime,
    message: string
): Promise<ApprovalParams | null> {
    const approvalResponse = await generateText({
        runtime,
        context: prepareBetTemplate(message),
        modelClass: ModelClass.SMALL,
    });
    const withoutTags = parseTagContent(approvalResponse, "response");

    const parsed = JSON.parse(withoutTags);
    if (
        parsed.address &&
        parsed.amount &&
        parsed.outcome !== undefined &&
        parsed.predictionId
    ) {
        return parsed;
    }
    return null;
}

const prepareBetResponse = (approvalTxData: ApprovalParams) =>
    `
🎲 Confirm your bet:
BetID: ${Math.floor(Math.random() * 900) + 100},
PredictionId: ${approvalTxData.predictionId},
Bettor: ${approvalTxData.address},
Amount: ${approvalTxData.amount} $SENTAI,
Outcome: ${approvalTxData.outcome}

Please make a transfer with your wallet to $SENTAI contract:
💰 ${process.env.SENTAI_ERC20}

With the hex data:
🔐 ${approvalTxData.txData}

After approval, send the tx hash like this: "BET <bet_id> APPROVED: <tx_hash>"

Example:
"BET 123 APPROVED: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
`;

const prepareBetTemplate = (message: string) => `
Extract bet amount and bettor address from the message.

<example>
BET ON PREDICTION 1, 100 $SENTAI, true, 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
<response>
{
  "predictionId": 1,
  "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "amount": 100,
  "outcome": true
}
</response>
</example>

<user_message>
${message}
</user_message>

Return a valid JSON object in the <response> tag.
`;
