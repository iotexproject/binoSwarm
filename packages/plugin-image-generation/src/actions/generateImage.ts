import {
    Action,
    generateImage,
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
    type Character,
} from "@elizaos/core";
import { z } from "zod";

import { validateImageGenConfig } from "../environment";
import { imagePromptTemplate, imageSystemPrompt } from "../templates";
import { saveBase64Image, saveHeuristImage } from "../utils";

export const imageGeneration: Action = {
    name: "GENERATE_IMAGE",
    similes: [
        "IMAGE_GENERATION",
        "IMAGE_GEN",
        "CREATE_IMAGE",
        "MAKE_PICTURE",
        "GENERATE_IMAGE",
        "GENERATE_A",
        "DRAW",
        "DRAW_A",
        "MAKE_A",
    ],
    description:
        "Generate an image to go along with the message. If using this action, don't try to generate a prompt or a discription of the image that yet to be generated, only reply that you're about to generate an image.",
    suppressInitialMessage: true,
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        await validateImageGenConfig(runtime);

        const anthropicApiKeyOk = !!runtime.getSetting("ANTHROPIC_API_KEY");
        const nineteenAiApiKeyOk = !!runtime.getSetting("NINETEEN_AI_API_KEY");
        const togetherApiKeyOk = !!runtime.getSetting("TOGETHER_API_KEY");
        const heuristApiKeyOk = !!runtime.getSetting("HEURIST_API_KEY");
        const falApiKeyOk = !!runtime.getSetting("FAL_API_KEY");
        const openAiApiKeyOk = !!runtime.getSetting("OPENAI_API_KEY");
        const veniceApiKeyOk = !!runtime.getSetting("VENICE_API_KEY");
        const livepeerGatewayUrlOk = !!runtime.getSetting(
            "LIVEPEER_GATEWAY_URL"
        );

        return (
            anthropicApiKeyOk ||
            togetherApiKeyOk ||
            heuristApiKeyOk ||
            falApiKeyOk ||
            openAiApiKeyOk ||
            veniceApiKeyOk ||
            nineteenAiApiKeyOk ||
            livepeerGatewayUrlOk
        );
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: {
            tags?: string[];
        },
        callback: HandlerCallback
    ) => {
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
            actionName: imageGeneration.name,
            tags: options.tags || ["image-generation", "generate-image"],
        });

        const imagePrompt = await generateImagePrompt(runtime, state, message);
        const imgOptions = buildImgOptions(imagePrompt, runtime);

        const res: { image: string; caption: string }[] = [];
        const images = await generateImage(imgOptions, runtime);

        if (images.success && images.data && images.data.length > 0) {
            elizaLogger.log(
                "Image generation successful, number of images:",
                images.data.length
            );
            for (let i = 0; i < images.data.length; i++) {
                const image = images.data[i];

                // Save the image and get filepath
                const filename = `generated_${Date.now()}_${i}`;

                // Choose save function based on image data format
                const filepath = image.startsWith("http")
                    ? await saveHeuristImage(image, filename)
                    : saveBase64Image(image, filename);

                elizaLogger.log(`Processing image ${i + 1}:`, filename);

                //just dont even add a caption or a description just have it generate & send
                /*
                try {
                    const imageService = runtime.getService(ServiceType.IMAGE_DESCRIPTION);
                    if (imageService && typeof imageService.describeImage === 'function') {
                        const caption = await imageService.describeImage({ imageUrl: filepath });
                        captionText = caption.description;
                        captionTitle = caption.title;
                    }
                } catch (error) {
                    elizaLogger.error("Caption generation failed, using default caption:", error);
                }*/

                const _caption = "...";
                /*= await generateCaption(
                    {
                        imageUrl: image,
                    },
                    runtime
                );*/

                res.push({ image: filepath, caption: "..." }); //caption.title });

                elizaLogger.log(
                    `Generated caption for image ${i + 1}:`,
                    "..." //caption.title
                );
                //res.push({ image: image, caption: caption.title });

                callback(
                    {
                        text: "...", //caption.description,
                        attachments: [
                            {
                                id: crypto.randomUUID(),
                                url: filepath,
                                title: "Generated image",
                                source: "imageGeneration",
                                description: "...", //caption.title,
                                text: "...", //caption.description,
                                contentType: "image/png",
                            },
                        ],
                    },
                    [
                        {
                            attachment: filepath,
                            name: `${filename}.png`,
                        },
                    ]
                );
            }
        } else {
            elizaLogger.error("Image generation failed or returned no data.");
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Generate an image of a cat" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Let me generate this image for you",
                    action: "GENERATE_IMAGE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Generate an image of a dog" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Let me generate this image for you",
                    action: "GENERATE_IMAGE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Create an image of a cat with a hat" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Let me generate this image for you",
                    action: "GENERATE_IMAGE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Make an image of a dog with a hat" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Let me generate this image for you",
                    action: "GENERATE_IMAGE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Paint an image of a cat with a hat" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Let me generate this image for you",
                    action: "GENERATE_IMAGE",
                },
            },
        ],
    ],
} as Action;

async function generateImagePrompt(
    runtime: IAgentRuntime,
    state: State,
    message: Memory
): Promise<string> {
    const context = composeContext({
        template:
            runtime.character?.templates?.imagePromptTemplate ||
            imagePromptTemplate,
        state,
    });

    const imagePromptSchema = z.object({
        analysis: z
            .string()
            .describe(
                "Analysis, reasoning and steps taken to generate the prompt"
            ),
        prompt: z
            .string()
            .describe("The generated image prompt without any additional text"),
    });

    type ImagePrompt = z.infer<typeof imagePromptSchema>;

    const imagePromptRes = await generateObject<ImagePrompt>({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
        schema: imagePromptSchema,
        schemaName: "ImagePrompt",
        schemaDescription: "Image prompt and analysis",
        customSystemPrompt:
            runtime.character?.templates?.imageSystemPrompt ||
            imageSystemPrompt,
        message,
        functionId: "GENERATE_IMAGE_PROMPT",
        tags: ["image-generation", "generate-image-prompt"],
    });
    return imagePromptRes.object?.prompt;
}

function buildImgOptions(imagePrompt: string, runtime: IAgentRuntime) {
    const imageSettings = runtime.character?.settings?.imageSettings || {};
    elizaLogger.debug("Image settings:", imageSettings);

    const {
        width,
        height,
        count,
        negativePrompt,
        numIterations,
        guidanceScale,
        seed,
        modelId,
        jobId,
        stylePreset,
        hideWatermark,
    } = imageSettings;

    return {
        prompt: imagePrompt,
        width: width ?? 1024,
        height: height ?? 1024,
        count: count ?? 1,
        ...(negativePrompt !== undefined && { negativePrompt }),
        ...(numIterations !== undefined && { numIterations }),
        ...(guidanceScale !== undefined && { guidanceScale }),
        ...(seed !== undefined && { seed }),
        ...(modelId !== undefined && { modelId }),
        ...(jobId !== undefined && { jobId }),
        ...(stylePreset !== undefined && { stylePreset }),
        ...(hideWatermark !== undefined && { hideWatermark }),
    };
}
