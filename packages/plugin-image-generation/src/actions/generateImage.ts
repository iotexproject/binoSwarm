import {
    Action,
    generateImage,
    Memory,
    IAgentRuntime,
    elizaLogger,
    HandlerCallback,
    State,
    generateText,
    ModelClass,
} from "@elizaos/core";

import { validateImageGenConfig } from "../environment";
import { imagePromptTemplate } from "../templates";
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
    description: "Generate an image to go along with the message.",
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
            width?: number;
            height?: number;
            count?: number;
            negativePrompt?: string;
            numIterations?: number;
            guidanceScale?: number;
            seed?: number;
            modelId?: string;
            jobId?: string;
            stylePreset?: string;
            hideWatermark?: boolean;
        },
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Composing state for message:", message);
        state = (await runtime.composeState(message)) as State;
        const userId = runtime.agentId;
        elizaLogger.log("User ID:", userId);

        const CONTENT = message.content.text;
        const IMAGE_SYSTEM_PROMPT = `You are an expert in writing prompts for AI art generation. You excel at creating detailed and creative visual descriptions. Incorporating specific elements naturally. Always aim for clear, descriptive language that generates a creative picture. Your output should only contain the description of the image contents, but NOT an instruction like "create an image that..."`;
        const STYLE = "futuristic with vibrant colors";

        const imagePrompt = await generateText({
            runtime,
            context: imagePromptTemplate(STYLE, CONTENT),
            modelClass: ModelClass.MEDIUM,
            customSystemPrompt: IMAGE_SYSTEM_PROMPT,
        });

        elizaLogger.log("Image prompt received:", imagePrompt);
        const imageSettings = runtime.character?.settings?.imageSettings || {};
        elizaLogger.log("Image settings:", imageSettings);

        const res: { image: string; caption: string }[] = [];

        elizaLogger.log("Generating image with prompt:", imagePrompt);
        const images = await generateImage(
            {
                prompt: imagePrompt,
                width: options.width || imageSettings.width || 1024,
                height: options.height || imageSettings.height || 1024,
                ...(options.count != null || imageSettings.count != null
                    ? { count: options.count || imageSettings.count || 1 }
                    : {}),
                ...(options.negativePrompt != null ||
                imageSettings.negativePrompt != null
                    ? {
                          negativePrompt:
                              options.negativePrompt ||
                              imageSettings.negativePrompt,
                      }
                    : {}),
                ...(options.numIterations != null ||
                imageSettings.numIterations != null
                    ? {
                          numIterations:
                              options.numIterations ||
                              imageSettings.numIterations,
                      }
                    : {}),
                ...(options.guidanceScale != null ||
                imageSettings.guidanceScale != null
                    ? {
                          guidanceScale:
                              options.guidanceScale ||
                              imageSettings.guidanceScale,
                      }
                    : {}),
                ...(options.seed != null || imageSettings.seed != null
                    ? { seed: options.seed || imageSettings.seed }
                    : {}),
                ...(options.modelId != null || imageSettings.modelId != null
                    ? { modelId: options.modelId || imageSettings.modelId }
                    : {}),
                ...(options.jobId != null || imageSettings.jobId != null
                    ? { jobId: options.jobId || imageSettings.jobId }
                    : {}),
                ...(options.stylePreset != null ||
                imageSettings.stylePreset != null
                    ? {
                          stylePreset:
                              options.stylePreset || imageSettings.stylePreset,
                      }
                    : {}),
                ...(options.hideWatermark != null ||
                imageSettings.hideWatermark != null
                    ? {
                          hideWatermark:
                              options.hideWatermark ||
                              imageSettings.hideWatermark,
                      }
                    : {}),
            },
            runtime
        );

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
        // TODO: We want to generate images in more abstract ways, not just when asked to generate an image

        [
            {
                user: "{{user1}}",
                content: { text: "Generate an image of a cat" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here's an image of a cat",
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
                    text: "Here's an image of a dog",
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
                    text: "Here's an image of a cat with a hat",
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
                    text: "Here's an image of a dog with a hat",
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
                    text: "Here's an image of a cat with a hat",
                    action: "GENERATE_IMAGE",
                },
            },
        ],
    ],
} as Action;
