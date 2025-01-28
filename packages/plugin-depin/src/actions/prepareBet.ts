import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
    composeContext,
    generateText,
    ModelClass,
    parseTagContent,
} from "@elizaos/core";
import QRCode from "qrcode";

import { genTxDataForAllowance } from "../helpers/blockchain";

interface ApprovalParams {
    amount: number;
    walletAddress: `0x${string}`;
}

export const prepareBet: Action = {
    name: "PREPARE_BET",
    similes: ["SETUP_BET", "START_BET", "INITIALIZE_BET"],
    description: "Prepare a bet by generating token approval transaction",
    validate: async (runtime: IAgentRuntime) => {
        return !!process.env.BINARY_PREDICTION_CONTRACT_ADDRESS;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "BET ON PREDICTION 1, 100 $SENTAI, true, 0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Let me prepare your bet. I will generate a QR code for you to approve the tokens first:",
                    action: "PREPARE_BET",
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
        state = (await runtime.composeState(message)) as State;

        try {
            const params = await extractBetParamsFromContext(runtime, state);
            if (!params) {
                if (callback) {
                    callback({
                        text: "Invalid bet format. Please use: BET ON PREDICTION <number>, <amount> $SENTAI, <outcome>, <your_wallet_address>",
                        inReplyTo: message.id,
                    });
                }
                return false;
            }

            const network = process.env.PREDICTION_NETWORK;
            if (network !== "iotexTestnet" && network !== "iotex") {
                throw new Error("Invalid network");
            }

            // Generate approval transaction data
            const txRequest = await genTxDataForAllowance(
                runtime,
                params.amount,
                params.walletAddress,
                network
            );

            // Generate QR code for the transaction
            const txData = JSON.stringify(txRequest);
            const qrCode = await QRCode.toDataURL(txData);

            if (callback) {
                callback({
                    text: `Please scan this QR code with your wallet to approve ${params.amount} $SENTAI tokens. Raw data: ${txData}. After approval, send the tx hash like this: "APPROVAL HASH <tx_hash> for PREDICTION <prediction_id>"`,
                    inReplyTo: message.id,
                    media: [
                        {
                            type: "image",
                            url: qrCode,
                            alt: "Token approval QR code",
                        },
                    ],
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
    state: State
): Promise<ApprovalParams> {
    const context = composeContext({
        state,
        template: prepareBetTemplate,
    });

    const approvalResponse = await generateText({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
    });
    const withoutTags = parseTagContent(approvalResponse, "response");

    return JSON.parse(withoutTags);
}

const prepareBetTemplate = `
Extract address and amount from the context:

<recent_messages>
{{recentMessages}}
</recent_messages>

<example>
- BET ON PREDICTION 1, 100 $SENTAI, true, 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
<response>
{
  "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "amount": 100
}
</response>
</example>
`;
