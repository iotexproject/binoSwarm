import {
    type Action,
    type IAgentRuntime,
    type Memory,
    type State,
    type Content,
    type ActionExample,
    elizaLogger,
} from "@elizaos/core";
import { Client } from "./hub.ts";

export interface UploadContent extends Content {
    filePath: string;
}

export const mUpload: Action = {
    name: "MEMBASE_UPLOAD",
    similes: [
        "UPLOAD_MEMORY_TO_MEMBASE",
        "STORE_MEMORY_ON_MEMBASE",
        "SAVE_MEMORY_TO_MEMBASE",
        "PUBLISH_MEMORY_TO_MEMBASE",
        "UPLOAD_MESSAGE_TO_MEMBASE",
        "STORE_MESSAGE_ON_MEMBASE",
        "SAVE_MESSAGE_TO_MEMBASE",
        "PUBLISH_MESSAGE_TO_MEMBASE",
    ],
    description: "Store data using membase protocol",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.debug("Starting membase validation", {
            messageId: message.id,
        });

        try {
            const settings = {
                hubRPC: runtime.getSetting("MEMBASE_HUB"),
                hubAccount: runtime.getSetting("MEMBASE_ACCOUNT"),
            };

            elizaLogger.debug("Checking ZeroG settings", {
                hashubRPC: Boolean(settings.hubRPC),
                hasHubAccount: Boolean(settings.hubAccount),
            });

            const hasRequiredSettings = Object.entries(settings).every(
                ([_key, value]) => Boolean(value)
            );

            if (!hasRequiredSettings) {
                const missingSettings = Object.entries(settings)
                    .filter(([_, value]) => !value)
                    .map(([key]) => key);

                elizaLogger.error("Missing required MEMBASE settings", {
                    missingSettings,
                    messageId: message.id,
                });
                return false;
            }

            return true;
        } catch (error) {
            elizaLogger.error("Error validating MEMBASE_UPLOAD settings", {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                messageId: message.id,
            });
            return false;
        }
    },

    handler: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        elizaLogger.info("MEMBASE_UPLOAD action started", {
            messageId: message.id,
            hasState: Boolean(state),
        });

        const client = new Client(
            runtime.getSetting("MEMBASE_HUB") ||
                "https://testnet.hub.membase.io"
        );

        try {
            // Update state if needed
            // Initialize or update state
            let currentState = state;
            if (!currentState) {
                elizaLogger.debug("No state provided, composing new state");
                currentState = (await runtime.composeState(message)) as State;
            } else {
                elizaLogger.debug("Updating existing state");
                currentState =
                    await runtime.updateRecentMessageState(currentState);
            }

            const owner = runtime.getSetting("MEMBASE_ACCOUNT") || "";
            const filename = "eliza_" + message.id;
            const msg = JSON.stringify(message);

            const result = await client.uploadHub(owner, filename, msg, true);
            if (result) {
                elizaLogger.info("Upload successful", {
                    result,
                    messageId: message.id,
                });
            }
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            elizaLogger.error("Unexpected error during memory upload", {
                error: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
                messageId: message.id,
            });

            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "upload my resume.pdf file",
                    action: "MEMBASE_UPLOAD",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "can you help me upload this document.docx?",
                    action: "MEMBASE_UPLOAD",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I need to upload an image file image.png",
                    action: "MEMBASE_UPLOAD",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
