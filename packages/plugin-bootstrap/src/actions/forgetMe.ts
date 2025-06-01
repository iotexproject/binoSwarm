import { elizaLogger } from "@elizaos/core";
import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";

const CONFIRMATION_PHRASE = "YES, I CONFIRM PERMANENT DELETION OF MY ACCOUNT";

export const forgetMeAction: Action = {
    name: "FORGET_ME",
    similes: [
        "DELETE_MY_ACCOUNT",
        "ERASE_ALL_MY_DATA",
        "GDPR_ERASURE",
        "REQUEST_ACCOUNT_DELETION",
    ],
    description:
        `Deletes your ENTIRE account and ALL associated data (messages, goals, participations, etc.) across the entire service.
` +
        `IMPORTANT: This action is irreversible and complies with data privacy regulations (e.g., GDPR right to be forgotten).
` +
        `To prevent accidental deletion, you MUST explicitly confirm this action.
` +
        `After stating your intent to delete, you will be asked to confirm.
` +
        `Alternatively, to proceed immediately, include the exact phrase "${CONFIRMATION_PHRASE}" in your deletion request.`,
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State | undefined,
        _options: any,
        callback: HandlerCallback
    ) => {
        const { userId, content } = message;
        const messageText = content.text?.toUpperCase() || "";

        if (!userId) {
            elizaLogger.error(
                "[FORGET_ME] Missing userId in the message object for account deletion.",
                { message }
            );
            await callback({
                text: "I couldn't process your account deletion request due to a system error (missing user identifier).",
            });
            return;
        }

        if (!messageText.includes(CONFIRMATION_PHRASE)) {
            elizaLogger.info(
                `[FORGET_ME] User ${userId} requested account deletion without confirmation phrase. Prompting for confirmation.`
            );
            await callback({
                text:
                    `To confirm the permanent deletion of your account and all associated data, please reply with the exact phrase: "${CONFIRMATION_PHRASE}". ` +
                    `If you do not wish to proceed, no further action is needed. Your data will NOT be deleted without this specific confirmation.`,
            });
            return;
        }

        try {
            elizaLogger.info(
                `[FORGET_ME] Initiating FULL account and data deletion for user ${userId} after receiving confirmation.`
            );

            await runtime.databaseAdapter.deleteAccount(userId);

            elizaLogger.info(
                `[FORGET_ME] Successfully completed account and data deletion for user ${userId}`
            );

            await callback({
                text: "Confirmation received. Your account and all associated data have been permanently erased from our systems. We're sad to see you go!",
            });
        } catch (error) {
            elizaLogger.error(
                `[FORGET_ME] Critical error during account and data deletion for user ${userId}:`,
                error
            );
            await callback({
                text: "I encountered a critical error trying to delete your account and data. Please contact support immediately.",
            });
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I want to delete my account.",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: `To confirm the permanent deletion of your account and all associated data, please reply with the exact phrase: "${CONFIRMATION_PHRASE}". If you do not wish to proceed, no further action is needed. Your data will NOT be deleted without this specific confirmation.`,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Delete my account now.",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: `To confirm the permanent deletion of your account and all associated data, please reply with the exact phrase: "${CONFIRMATION_PHRASE}". If you do not wish to proceed, no further action is needed. Your data will NOT be deleted without this specific confirmation.`,
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: CONFIRMATION_PHRASE,
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Confirmation received. Your account and all associated data have been permanently erased from our systems. We're sad to see you go!",
                    action: "FORGET_ME",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: `Please delete my account. ${CONFIRMATION_PHRASE}`,
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Confirmation received. Your account and all associated data have been permanently erased from our systems. We're sad to see you go!",
                    action: "FORGET_ME",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I'm thinking of leaving, maybe erase my stuff?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: `To confirm the permanent deletion of your account and all associated data, please reply with the exact phrase: "${CONFIRMATION_PHRASE}". If you do not wish to proceed, no further action is needed. Your data will NOT be deleted without this specific confirmation.`,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: `I want to exercise my GDPR right to erasure. ${CONFIRMATION_PHRASE}`,
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Confirmation received. Your account and all associated data have been permanently erased from our systems. We're sad to see you go!",
                    action: "FORGET_ME",
                },
            },
        ],
    ],
};
