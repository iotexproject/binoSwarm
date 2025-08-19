import {
    Action,
    Memory,
    IAgentRuntime,
    elizaLogger,
    HandlerCallback,
    State,
    ModelClass,
    composeContext,
    generateObject,
    InteractionLogger,
    AgentClient,
} from "@elizaos/core";
import { z } from "zod";

import { memePromptTemplate, memeSystemPrompt } from "../templates";
import { saveImgflipMeme } from "../utils";

// Define types for the Imgflip API response
interface ImgflipResponse {
    success: boolean;
    data?: {
        url: string;
        page_url: string;
    };
    error_message?: string;
}

interface ImgflipMemeTemplate {
    id: string;
    name: string;
    url: string;
    width: number;
    height: number;
    box_count: number;
}

interface ImgflipGetMemesResponse {
    success: boolean;
    data?: {
        memes: ImgflipMemeTemplate[];
    };
    error_message?: string;
}

// Imgflip API base URLs
const IMGFLIP_API_URL = "https://api.imgflip.com/caption_image";
const IMGFLIP_GET_MEMES_URL = "https://api.imgflip.com/get_memes";

// Cache for available meme templates
let memeTemplatesCache: ImgflipMemeTemplate[] | null = null;

/**
 * Fetch available meme templates from Imgflip API
 */
async function fetchMemeTemplates(): Promise<ImgflipMemeTemplate[]> {
    try {
        // Return cached templates if available
        if (memeTemplatesCache) {
            return memeTemplatesCache;
        }

        const response = await fetch(IMGFLIP_GET_MEMES_URL);
        const data = (await response.json()) as ImgflipGetMemesResponse;

        if (data.success && data.data) {
            memeTemplatesCache = data.data.memes;
            elizaLogger.log(
                `Fetched ${memeTemplatesCache.length} meme templates from Imgflip API`
            );
            return memeTemplatesCache;
        } else {
            elizaLogger.error(
                "Failed to fetch meme templates:",
                data.error_message
            );
            return [];
        }
    } catch (error) {
        elizaLogger.error(
            "Error fetching meme templates:",
            error instanceof Error ? error.message : error
        );
        return [];
    }
}

async function generateMeme(
    templateId: string,
    texts: string[],
    runtime: IAgentRuntime
): Promise<string | null> {
    try {
        const username = runtime.getSetting("IMGFLIP_USERNAME");
        const password = runtime.getSetting("IMGFLIP_PASSWORD");

        if (!username || !password) {
            elizaLogger.error("Imgflip credentials not found in settings");
            return null;
        }

        // Prepare the request payload (form data)
        const params = new URLSearchParams();
        params.append("template_id", templateId);
        params.append("username", username);
        params.append("password", password);

        // Find template to determine box count
        const template = memeTemplatesCache?.find((t) => t.id === templateId);
        const boxCount = template?.box_count || 2;

        // If more than 2 boxes, use the boxes parameter
        if (boxCount > 2) {
            // Ensure we have enough text entries for the template
            const textArray = [...texts];
            while (textArray.length < boxCount) {
                textArray.push("");
            }

            // Add boxes in the correct URLSearchParams format, text only
            for (let i = 0; i < boxCount; i++) {
                params.append(`boxes[${i}][text]`, textArray[i] || "");
            }
        } else {
            // Use traditional text0/text1 for 2 box templates
            params.append("text0", texts[0] || "");
            params.append("text1", texts[1] || "");
        }

        // Make the POST request to Imgflip API
        const response = await fetch(IMGFLIP_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        });

        const data = (await response.json()) as ImgflipResponse;

        // Check if the request was successful
        if (data.success && data.data) {
            elizaLogger.log("Meme generated successfully!");
            return data.data.url;
        } else {
            elizaLogger.error("Imgflip API error:", data.error_message);
            return null;
        }
    } catch (error) {
        elizaLogger.error(
            "Error generating meme:",
            error instanceof Error ? error.message : error
        );
        return null;
    }
}

// Zod schema for meme generation parameters
const memeGenerationSchema = z.object({
    analysis: z
        .string()
        .describe("Analysis, reasoning and steps taken to generate the meme"),
    templateName: z
        .string()
        .describe("The name of the meme template to use from Imgflip API"),
    templateId: z
        .string()
        .describe("The template ID for the meme from Imgflip API"),
    textBoxes: z
        .array(z.string())
        .describe(
            "Array of text strings for each text box in the meme. The number needed depends on the template's box_count."
        ),
});

// Type inferred from the schema
type MemeGeneration = z.infer<typeof memeGenerationSchema>;

function validateMemeGenConfig(runtime: IAgentRuntime): Promise<boolean> {
    const imgflipUsernameOk = !!runtime.getSetting("IMGFLIP_USERNAME");
    const imgflipPasswordOk = !!runtime.getSetting("IMGFLIP_PASSWORD");

    return Promise.resolve(imgflipUsernameOk && imgflipPasswordOk);
}

export const memeGeneration: Action = {
    name: "GENERATE_MEME",
    similes: [
        "MEME_GENERATION",
        "MEME_GEN",
        "CREATE_MEME",
        "MAKE_MEME",
        "GENERATE_MEME",
    ],
    description:
        "Generate a meme using the Imgflip API. Suggest a template, and provide top and bottom text.",
    suppressInitialMessage: true,
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        return await validateMemeGenConfig(runtime);
    },
    handler: async function (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: {
            templateId?: string;
            templateName?: string;
            textBoxes?: string[];
            tags?: string[];
        },
        callback: HandlerCallback
    ) {
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        InteractionLogger.logAgentActionCalled({
            client: (options.tags?.[0] as AgentClient) || "unknown",
            agentId: runtime.agentId,
            userId: message.userId,
            roomId: message.roomId,
            messageId: message.id,
            actionName: memeGeneration.name,
            tags: options.tags || ["image-generation", "generate-meme"],
        });

        // Fetch available meme templates
        const memeTemplates = await fetchMemeTemplates();
        if (memeTemplates.length === 0) {
            elizaLogger.error("No meme templates available");
            callback({
                text: "I couldn't fetch meme templates from Imgflip. Please try again later.",
            });
            return;
        }

        // Create a custom system prompt with available templates
        const templatesInfo = memeTemplates
            .map(
                (template) =>
                    `- ${template.name} (ID: ${template.id}) box count: ${template.box_count}`
            )
            .join("\n");
        state.availableMemeTemplates = templatesInfo;

        const context = composeContext({
            template:
                runtime.character?.templates?.memePromptTemplate ||
                memePromptTemplate,
            state,
        });

        const memeGenRes = await generateObject<MemeGeneration>({
            runtime,
            context,
            modelClass: ModelClass.LARGE,
            schema: memeGenerationSchema,
            schemaName: "MemeGeneration",
            schemaDescription: "Meme generation parameters",
            customSystemPrompt:
                runtime.character?.templates?.memeSystemPrompt ||
                memeSystemPrompt,
            message,
            functionId: "GENERATE_MEME",
            tags: ["image-generation", "generate-meme"],
        });

        if (!memeGenRes.object) {
            elizaLogger.error("Failed to generate meme parameters");
            callback({
                text: "I wasn't able to generate a meme. Please try again.",
            });
            return;
        }

        let templateId = options.templateId;

        // If templateId is not provided in options, try to find it by name or use the one from memeGenRes
        if (!templateId) {
            if (options.templateName) {
                // Find template by name from options
                const template = memeTemplates.find(
                    (t) =>
                        t.name.toLowerCase() ===
                        options.templateName?.toLowerCase()
                );
                if (template) {
                    templateId = template.id;
                }
            } else if (memeGenRes.object.templateName) {
                // Find template by name from generated parameters
                const template = memeTemplates.find(
                    (t) =>
                        t.name.toLowerCase() ===
                        memeGenRes.object.templateName.toLowerCase()
                );
                if (template) {
                    templateId = template.id;
                }
            }

            // If still no templateId, use the one from generated parameters
            if (!templateId) {
                templateId = memeGenRes.object.templateId;
            }
        }

        // Get the template to determine box count
        const template = memeTemplates.find((t) => t.id === templateId);
        const boxCount = template?.box_count || 2;

        // Get text boxes from options or generated parameters
        let textBoxes = options.textBoxes || memeGenRes.object.textBoxes;

        // Ensure we have enough text boxes for the template
        if (!textBoxes || textBoxes.length < boxCount) {
            const generatedTexts = memeGenRes.object.textBoxes || [];
            textBoxes = Array(boxCount)
                .fill("")
                .map((_, i) => generatedTexts[i] || "");
        }

        // Find template name for logging
        const templateName = template?.name || "Unknown template";
        elizaLogger.log(
            `Generating meme with template: ${templateName} (ID: ${templateId}), Box count: ${boxCount}`
        );

        const memeUrl = await generateMeme(templateId, textBoxes, runtime);

        if (memeUrl) {
            elizaLogger.log("Meme generated successfully, URL:", memeUrl);

            const filepath = await saveImgflipMeme(memeUrl, templateName);
            const textDescription = textBoxes
                .filter((text) => text)
                .join(" / ");
            const filename = `generated_${Date.now()}_${templateName}`;

            callback(
                {
                    text: "👀",
                    attachments: [
                        {
                            id: crypto.randomUUID(),
                            url: filepath,
                            title: "Generated Meme",
                            source: "memeGeneration",
                            description: `${templateName}: ${textDescription}`,
                            contentType: "image/jpeg",
                            text: `Meme with text: "${textDescription}"`,
                        },
                    ],
                },
                [
                    {
                        attachment: filepath,
                        name: `${filename}.jpeg`,
                    },
                ]
            );
        } else {
            elizaLogger.error("Meme generation failed");
            callback({
                text: "I wasn't able to generate a meme. Please check your template ID and try again.",
            });
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Create a meme about programming" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Let me generate a meme for you",
                    action: "GENERATE_MEME",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Make a meme about deadlines" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Let me generate a meme for you",
                    action: "GENERATE_MEME",
                },
            },
        ],
    ],
} as Action;
