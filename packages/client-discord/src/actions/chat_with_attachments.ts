import {
    composeContext,
    elizaLogger,
    generateObject,
    getModelSettings,
} from "@elizaos/core";
import { generateText, trimTokens } from "@elizaos/core";
import {
    Action,
    ActionExample,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
} from "@elizaos/core";
import * as fs from "fs";
import { z } from "zod";
import {
    attachmentIdsTemplate,
    summarizationWithAttachmentsTemplate,
} from "./templates";

const getAttachmentIds = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
): Promise<{ objective: string; attachmentIds: string[] } | null> => {
    state = (await runtime.composeState(message)) as State;

    const attachmentIdsSchema = z.object({
        objective: z.string().describe("What the user wants to summarize"),
        attachmentIds: z
            .array(z.string())
            .describe("List of attachment IDs to summarize"),
    });

    type AttachmentIds = z.infer<typeof attachmentIdsSchema>;

    const context = composeContext({
        state,
        template: attachmentIdsTemplate,
    });

    for (let i = 0; i < 5; i++) {
        const response = await generateObject<AttachmentIds>({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
            schema: attachmentIdsSchema,
            schemaName: "attachmentIds",
            schemaDescription: "The objective and attachment IDs",
            customSystemPrompt:
                "You are a neutral processing agent. Wait for task-specific instructions in the user prompt.",
            message,
            functionId: "discord_getAttachmentIds",
        });
        elizaLogger.log("response", response);
        // try parsing to a json object
        const parsedResponse = attachmentIdsSchema.parse(response.object);
        // see if it contains objective and attachmentIds
        if (parsedResponse?.objective && parsedResponse?.attachmentIds) {
            return {
                objective: parsedResponse.objective,
                attachmentIds: parsedResponse.attachmentIds,
            };
        }
    }
    return null;
};

const summarizeAction = {
    name: "CHAT_WITH_ATTACHMENTS",
    similes: [
        "CHAT_WITH_ATTACHMENT",
        "SUMMARIZE_FILES",
        "SUMMARIZE_FILE",
        "SUMMARIZE_ATACHMENT",
        "CHAT_WITH_PDF",
        "ATTACHMENT_SUMMARY",
        "RECAP_ATTACHMENTS",
        "SUMMARIZE_FILE",
        "SUMMARIZE_VIDEO",
        "SUMMARIZE_AUDIO",
        "SUMMARIZE_IMAGE",
        "SUMMARIZE_DOCUMENT",
        "SUMMARIZE_LINK",
        "ATTACHMENT_SUMMARY",
        "FILE_SUMMARY",
    ],
    description:
        "Answer a user request informed by specific attachments based on their IDs. If a user asks to chat with a PDF, or wants more specific information about a link or video or anything else they've attached, this is the action to use.",
    validate: async (
        _runtime: IAgentRuntime,
        message: Memory,
        _state: State
    ) => {
        if (message.content.source !== "discord") {
            return false;
        }
        // only show if one of the keywords are in the message
        const keywords: string[] = [
            "attachment",
            "summary",
            "summarize",
            "research",
            "pdf",
            "video",
            "audio",
            "image",
            "document",
            "link",
            "file",
            "attachment",
            "summarize",
            "code",
            "report",
            "write",
            "details",
            "information",
            "talk",
            "chat",
            "read",
            "listen",
            "watch",
        ];
        return keywords.some((keyword) =>
            message.content.text.toLowerCase().includes(keyword.toLowerCase())
        );
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        state = (await runtime.composeState(message)) as State;

        const callbackData: Content = {
            text: "", // fill in later
            action: "CHAT_WITH_ATTACHMENTS_RESPONSE",
            source: message.content.source,
            attachments: [],
        };

        // 1. extract attachment IDs from the message
        const attachmentData = await getAttachmentIds(runtime, message, state);
        if (!attachmentData) {
            elizaLogger.error("Couldn't get attachment IDs from message");
            return;
        }

        const { objective, attachmentIds } = attachmentData;

        // This is pretty gross but it can catch cases where the returned generated UUID is stupidly wrong for some reason
        const attachments = state.recentMessagesData
            .filter(
                (msg) =>
                    msg.content.attachments &&
                    msg.content.attachments.length > 0
            )
            .flatMap((msg) => msg.content.attachments)
            // check by first 5 characters of uuid
            .filter(
                (attachment) =>
                    attachmentIds
                        .map((attch) => attch.toLowerCase().slice(0, 5))
                        .includes(attachment.id.toLowerCase().slice(0, 5)) ||
                    // or check the other way
                    attachmentIds.some((id) => {
                        const attachmentId = id.toLowerCase().slice(0, 5);
                        return attachment.id
                            .toLowerCase()
                            .includes(attachmentId);
                    })
            );

        const attachmentsWithText = attachments
            .map((attachment) => `# ${attachment.title}\n${attachment.text}`)
            .join("\n\n");

        let currentSummary = "";

        const modelSettings = getModelSettings(
            runtime.character.modelProvider,
            ModelClass.SMALL
        );
        const chunkSize = modelSettings.maxOutputTokens;

        state.attachmentsWithText = attachmentsWithText;
        state.objective = objective;
        const template = await trimTokens(
            summarizationWithAttachmentsTemplate,
            chunkSize + 500,
            runtime
        );
        const context = composeContext({
            state,
            // make sure it fits, we can pad the tokens a bit
            // Get the model's tokenizer based on the current model being used
            template,
        });

        const summary = await generateText({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
            customSystemPrompt:
                "You are a neutral processing agent. Wait for task-specific instructions in the user prompt.",
            functionId: "discord_chatWithAttachments",
            message,
            tags: ["discord", "discord-chat-with-attachments"],
        });

        currentSummary = currentSummary + "\n" + summary;

        if (!currentSummary) {
            elizaLogger.error("No summary found, that's not good!");
            return;
        }

        callbackData.text = currentSummary.trim();
        if (
            callbackData.text &&
            (currentSummary.trim()?.split("\n").length < 4 ||
                currentSummary.trim()?.split(" ").length < 100)
        ) {
            callbackData.text = `Here is the summary:
\`\`\`md
${currentSummary.trim()}
\`\`\`
`;
            await callback(callbackData);
        } else if (currentSummary.trim()) {
            const summaryFilename = `content/summary_${Date.now()}.md`;

            try {
                // Debug: Log before file operations
                elizaLogger.log("Creating summary file:", {
                    filename: summaryFilename,
                    summaryLength: currentSummary.length,
                });

                // Write file directly first
                await fs.promises.writeFile(
                    summaryFilename,
                    currentSummary,
                    "utf8"
                );
                elizaLogger.log("File written successfully");

                // Then cache it
                await runtime.cacheManager.set(summaryFilename, currentSummary);
                elizaLogger.log("Cache set operation completed");

                await callback(
                    {
                        ...callbackData,
                        text: `I've attached the summary of the requested attachments as a text file.`,
                    },
                    [summaryFilename]
                );
                elizaLogger.log("Callback completed with summary file");
            } catch (error) {
                elizaLogger.error("Error in file/cache process:", error);
                throw error;
            }
        } else {
            elizaLogger.warn(
                "Empty response from chat with attachments action, skipping"
            );
        }

        return callbackData;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Can you summarize the attachments b3e23, c4f67, and d5a89?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Sure thing! I'll pull up those specific attachments and provide a summary of their content.",
                    action: "CHAT_WITH_ATTACHMENTS",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I need a technical summary of the PDFs I sent earlier - a1b2c3.pdf, d4e5f6.pdf, and g7h8i9.pdf",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll take a look at those specific PDF attachments and put together a technical summary for you. Give me a few minutes to review them.",
                    action: "CHAT_WITH_ATTACHMENTS",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Can you watch this video for me and tell me which parts you think are most relevant to the report I'm writing? (the one I attached in my last message)",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "sure, no problem.",
                    action: "CHAT_WITH_ATTACHMENTS",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "can you read my blog post and give me a detailed breakdown of the key points I made, and then suggest a handful of tweets to promote it?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "great idea, give me a minute",
                    action: "CHAT_WITH_ATTACHMENTS",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;

export default summarizeAction;
