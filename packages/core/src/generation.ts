import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { deepseek } from "@ai-sdk/deepseek";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import {
    generateObject as aiGenerateObject,
    generateText as aiGenerateText,
    GenerateObjectResult,
    StepResult as AIStepResult,
    Message,
    Tool,
    LanguageModelV1,
} from "ai";
import { Buffer } from "buffer";
import OpenAI from "openai";
import Together from "together-ai";
import { ZodSchema, z } from "zod";
import { fal } from "@fal-ai/client";
import { tavily } from "@tavily/core";

import { elizaLogger } from "./index.ts";
import { getModelSettings, getImageModelSettings } from "./models.ts";
import {
    parseBooleanFromText,
    parseJSONObjectFromText,
    parseShouldRespondFromText,
    parseActionResponseFromText,
    parseTagContent,
} from "./parsing.ts";
import {
    Content,
    IAgentRuntime,
    IImageDescriptionService,
    ModelClass,
    ModelProviderName,
    ServiceType,
    SearchResponse,
    ActionResponse,
    IVerifiableInferenceAdapter,
    VerifiableInferenceOptions,
    TelemetrySettings,
} from "./types.ts";
import { trimTokens } from "./tokenTrimming.ts";

type StepResult = AIStepResult<any>;

type GenerationOptions = {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
    schema: ZodSchema;
    schemaName: string;
    schemaDescription: string;
    stop?: string[];
    mode?: "auto" | "json" | "tool";
    experimental_providerMetadata?: Record<string, unknown>;
    verifiableInference?: boolean;
    verifiableInferenceAdapter?: IVerifiableInferenceAdapter;
    verifiableInferenceOptions?: VerifiableInferenceOptions;
    customSystemPrompt?: string;
};

type ModelSettings = {
    prompt: string;
    temperature: number;
    maxTokens: number;
    frequencyPenalty: number;
    presencePenalty: number;
    stop?: string[];
    experimental_telemetry?: TelemetrySettings;
};

type TogetherAIImageResponse = {
    data: Array<{
        url: string;
        content_type?: string;
        image_type?: string;
    }>;
};

export async function generateText({
    runtime,
    context,
    modelClass,
    tools = {},
    onStepFinish,
    maxSteps = 1,
    stop,
    customSystemPrompt,
    messages,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
    tools?: Record<string, Tool>;
    onStepFinish?: (event: StepResult) => Promise<void> | void;
    maxSteps?: number;
    stop?: string[];
    customSystemPrompt?: string;
    messages?: Message[];
}): Promise<string> {
    if (!context) {
        throw new Error("generateText context is empty");
    }

    const provider = runtime.modelProvider;
    const settings = getModelSettings(provider, modelClass);

    if (!settings) {
        throw new Error(`Model settings not found for provider: ${provider}`);
    }

    const cfg = runtime.character?.settings?.modelConfig;
    const temp = cfg?.temperature || settings.temperature;
    const freq = cfg?.frequency_penalty || settings.frequency_penalty;
    const pres = cfg?.presence_penalty || settings.presence_penalty;
    const max_in = cfg?.maxInputTokens || settings.maxInputTokens;
    const max_out = cfg?.max_response_length || settings.maxOutputTokens;
    const tel = cfg?.experimental_telemetry || settings.experimental_telemetry;

    context = await trimTokens(context, max_in, runtime);

    const llmModel = getModel(provider, settings.name);

    const result = await aiGenerateText({
        model: llmModel,
        prompt: context,
        system: customSystemPrompt ?? runtime.character.system ?? undefined,
        tools,
        messages,
        onStepFinish,
        maxSteps,
        temperature: temp,
        maxTokens: max_out,
        frequencyPenalty: freq,
        presencePenalty: pres,
        experimental_telemetry: tel,
        stopSequences: stop || settings.stop,
    });

    elizaLogger.debug("generateText result:", result.text);
    return result.text;
}

export async function generateShouldRespond({
    runtime,
    context,
    modelClass,
    messages,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
    messages?: Message[];
}): Promise<"RESPOND" | "IGNORE" | "STOP" | null> {
    let retryDelay = 1000;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    while (retryCount < MAX_RETRIES) {
        try {
            elizaLogger.debug(
                "Attempting to generate text with context:",
                context
            );
            const response = await generateText({
                runtime,
                context,
                modelClass,
                messages,
            });

            const extractedResponse = parseTagContent(response, "response");
            const parsedResponse =
                parseShouldRespondFromText(extractedResponse);
            if (parsedResponse) {
                elizaLogger.debug("Parsed response:", parsedResponse);
                return parsedResponse;
            } else {
                elizaLogger.debug("generateShouldRespond no response");
            }
        } catch (error) {
            elizaLogger.error("Error in generateShouldRespond:", error);
            if (
                error instanceof TypeError &&
                error.message.includes("queueTextCompletion")
            ) {
                elizaLogger.error(
                    "TypeError: Cannot read properties of null (reading 'queueTextCompletion')"
                );
            }
        }

        elizaLogger.log(`Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
        retryCount++;
    }

    throw new Error("generateShouldRespond failed after 5 retries");
}

export async function splitChunks(
    content: string,
    chunkSize: number = 512,
    bleed: number = 20
): Promise<string[]> {
    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: Number(chunkSize),
        chunkOverlap: Number(bleed),
    });

    return textSplitter.splitText(content);
}

export async function generateTrueOrFalse({
    runtime,
    context = "",
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<boolean> {
    let retryDelay = 1000;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    const modelSettings = getModelSettings(runtime.modelProvider, modelClass);
    const stop = Array.from(
        new Set([...(modelSettings.stop || []), ["\n"]])
    ) as string[];

    while (retryCount < MAX_RETRIES) {
        try {
            const response = await generateText({
                stop,
                runtime,
                context,
                modelClass,
            });

            const parsedResponse = parseBooleanFromText(response.trim());
            if (parsedResponse !== null) {
                return parsedResponse;
            }
        } catch (error) {
            elizaLogger.error("Error in generateTrueOrFalse:", error);
        }

        elizaLogger.log(
            `Retrying in ${retryDelay}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
        retryCount++;
    }

    throw new Error(
        "Failed to generate boolean response after maximum retries"
    );
}

export async function generateObjectDeprecated({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<any> {
    if (!context) {
        elizaLogger.error("generateObjectDeprecated context is empty");
        return null;
    }

    let retryDelay = 1000;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    while (retryCount < MAX_RETRIES) {
        try {
            const response = await generateText({
                runtime,
                context,
                modelClass,
            });
            const extractedResponse = parseTagContent(response, "response");
            const parsedResponse = parseJSONObjectFromText(extractedResponse);
            if (parsedResponse) {
                return parsedResponse;
            }
        } catch (error) {
            elizaLogger.error("Error in generateObject:", error);
        }

        elizaLogger.log(
            `Retrying in ${retryDelay}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
        retryCount++;
    }

    throw new Error("Failed to generate object after maximum retries");
}

export async function generateMessageResponse({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<Content> {
    const contentSchema = z.object({
        responseAnalysis: z.string(),
        text: z.string().describe("Cleaned up response for the user."),
        user: z.string().describe("Your name as a character."),
        action: z.string().describe("The action to take."),
    });

    try {
        const result = await generateObject<Content>({
            runtime,
            context,
            modelClass,
            schema: contentSchema,
            schemaName: "Content",
            schemaDescription: "Message content structure",
        });
        return result.object;
    } catch (error) {
        elizaLogger.error("Error in generateMessageResponse:", error);
        throw error;
    }
}

export const generateImage = async (
    data: {
        prompt: string;
        width: number;
        height: number;
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
    runtime: IAgentRuntime
): Promise<{
    success: boolean;
    data?: string[];
    error?: any;
}> => {
    const modelSettings = getImageModelSettings(runtime.imageModelProvider);
    const model = modelSettings.name;
    elizaLogger.info("Generating image with options:", {
        imageModelProvider: model,
    });

    const apiKey =
        runtime.imageModelProvider === runtime.modelProvider
            ? runtime.token
            : (() => {
                  // First try to match the specific provider
                  switch (runtime.imageModelProvider) {
                      case ModelProviderName.HEURIST:
                          return runtime.getSetting("HEURIST_API_KEY");
                      case ModelProviderName.TOGETHER:
                          return runtime.getSetting("TOGETHER_API_KEY");
                      case ModelProviderName.FAL:
                          return runtime.getSetting("FAL_API_KEY");
                      case ModelProviderName.OPENAI:
                          return runtime.getSetting("OPENAI_API_KEY");
                      case ModelProviderName.VENICE:
                          return runtime.getSetting("VENICE_API_KEY");
                      case ModelProviderName.LIVEPEER:
                          return runtime.getSetting("LIVEPEER_GATEWAY_URL");
                      default:
                          // If no specific match, try the fallback chain
                          return (
                              runtime.getSetting("HEURIST_API_KEY") ??
                              runtime.getSetting("NINETEEN_AI_API_KEY") ??
                              runtime.getSetting("TOGETHER_API_KEY") ??
                              runtime.getSetting("FAL_API_KEY") ??
                              runtime.getSetting("OPENAI_API_KEY") ??
                              runtime.getSetting("VENICE_API_KEY") ??
                              runtime.getSetting("LIVEPEER_GATEWAY_URL")
                          );
                  }
              })();
    try {
        if (runtime.imageModelProvider === ModelProviderName.HEURIST) {
            const response = await fetch(
                "http://sequencer.heurist.xyz/submit_job",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        job_id: data.jobId || crypto.randomUUID(),
                        model_input: {
                            SD: {
                                prompt: data.prompt,
                                neg_prompt: data.negativePrompt,
                                num_iterations: data.numIterations || 20,
                                width: data.width || 512,
                                height: data.height || 512,
                                guidance_scale: data.guidanceScale || 3,
                                seed: data.seed || -1,
                            },
                        },
                        model_id: model,
                        deadline: 60,
                        priority: 1,
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Heurist image generation failed: ${response.statusText}`
                );
            }

            const imageURL = await response.json();
            return { success: true, data: [imageURL] };
        } else if (
            runtime.imageModelProvider === ModelProviderName.TOGETHER ||
            // for backwards compat
            runtime.imageModelProvider === ModelProviderName.LLAMACLOUD
        ) {
            const together = new Together({ apiKey: apiKey as string });
            const response = await together.images.create({
                model: model,
                prompt: data.prompt,
                width: data.width,
                height: data.height,
                steps: modelSettings?.steps ?? 4,
                n: data.count,
            });

            // Add type assertion to handle the response properly
            const togetherResponse =
                response as unknown as TogetherAIImageResponse;

            if (
                !togetherResponse.data ||
                !Array.isArray(togetherResponse.data)
            ) {
                throw new Error("Invalid response format from Together AI");
            }

            // Rest of the code remains the same...
            const base64s = await Promise.all(
                togetherResponse.data.map(async (image) => {
                    if (!image.url) {
                        elizaLogger.error("Missing URL in image data:", image);
                        throw new Error("Missing URL in Together AI response");
                    }

                    // Fetch the image from the URL
                    const imageResponse = await fetch(image.url);
                    if (!imageResponse.ok) {
                        throw new Error(
                            `Failed to fetch image: ${imageResponse.statusText}`
                        );
                    }

                    // Convert to blob and then to base64
                    const blob = await imageResponse.blob();
                    const arrayBuffer = await blob.arrayBuffer();
                    const base64 = Buffer.from(arrayBuffer).toString("base64");

                    // Return with proper MIME type
                    return `data:image/jpeg;base64,${base64}`;
                })
            );

            if (base64s.length === 0) {
                throw new Error("No images generated by Together AI");
            }

            elizaLogger.debug(`Generated ${base64s.length} images`);
            return { success: true, data: base64s };
        } else if (runtime.imageModelProvider === ModelProviderName.FAL) {
            fal.config({
                credentials: apiKey as string,
            });

            // Prepare the input parameters according to their schema
            const input = {
                prompt: data.prompt,
                image_size: "square" as const,
                num_inference_steps: modelSettings?.steps ?? 50,
                guidance_scale: data.guidanceScale || 3.5,
                num_images: data.count,
                enable_safety_checker:
                    runtime.getSetting("FAL_AI_ENABLE_SAFETY_CHECKER") ===
                    "true",
                safety_tolerance: Number(
                    runtime.getSetting("FAL_AI_SAFETY_TOLERANCE") || "2"
                ),
                output_format: "png" as const,
                seed: data.seed ?? 6252023,
                ...(runtime.getSetting("FAL_AI_LORA_PATH")
                    ? {
                          loras: [
                              {
                                  path: runtime.getSetting("FAL_AI_LORA_PATH"),
                                  scale: 1,
                              },
                          ],
                      }
                    : {}),
            };

            // Subscribe to the model
            const result = await fal.subscribe(model, {
                input,
                logs: true,
                onQueueUpdate: (update) => {
                    if (update.status === "IN_PROGRESS") {
                        elizaLogger.info(update.logs.map((log) => log.message));
                    }
                },
            });

            // Convert the returned image URLs to base64 to match existing functionality
            const base64Promises = result.data.images.map(async (image) => {
                const response = await fetch(image.url);
                const blob = await response.blob();
                const buffer = await blob.arrayBuffer();
                const base64 = Buffer.from(buffer).toString("base64");
                return `data:${image.content_type};base64,${base64}`;
            });

            const base64s = await Promise.all(base64Promises);
            return { success: true, data: base64s };
        } else if (runtime.imageModelProvider === ModelProviderName.VENICE) {
            const response = await fetch(
                "https://api.venice.ai/api/v1/image/generate",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: model,
                        prompt: data.prompt,
                        negative_prompt: data.negativePrompt,
                        width: data.width,
                        height: data.height,
                        steps: data.numIterations,
                        seed: data.seed,
                        style_preset: data.stylePreset,
                        hide_watermark: data.hideWatermark,
                    }),
                }
            );

            const result = await response.json();

            if (!result.images || !Array.isArray(result.images)) {
                throw new Error("Invalid response format from Venice AI");
            }

            const base64s = result.images.map((base64String) => {
                if (!base64String) {
                    throw new Error(
                        "Empty base64 string in Venice AI response"
                    );
                }
                return `data:image/png;base64,${base64String}`;
            });

            return { success: true, data: base64s };
        } else if (
            runtime.imageModelProvider === ModelProviderName.NINETEEN_AI
        ) {
            const response = await fetch(
                "https://api.nineteen.ai/v1/text-to-image",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: model,
                        prompt: data.prompt,
                        negative_prompt: data.negativePrompt,
                        width: data.width,
                        height: data.height,
                        steps: data.numIterations,
                        cfg_scale: data.guidanceScale || 3,
                    }),
                }
            );

            const result = await response.json();

            if (!result.images || !Array.isArray(result.images)) {
                throw new Error("Invalid response format from Nineteen AI");
            }

            const base64s = result.images.map((base64String) => {
                if (!base64String) {
                    throw new Error(
                        "Empty base64 string in Nineteen AI response"
                    );
                }
                return `data:image/png;base64,${base64String}`;
            });

            return { success: true, data: base64s };
        } else if (runtime.imageModelProvider === ModelProviderName.LIVEPEER) {
            if (!apiKey) {
                throw new Error("Livepeer Gateway is not defined");
            }
            try {
                const baseUrl = new URL(apiKey);
                if (!baseUrl.protocol.startsWith("http")) {
                    throw new Error("Invalid Livepeer Gateway URL protocol");
                }
                const response = await fetch(
                    `${baseUrl.toString()}text-to-image`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            model_id: model,
                            prompt: data.prompt,
                            width: data.width || 1024,
                            height: data.height || 1024,
                        }),
                    }
                );
                const result = await response.json();
                if (!result.images?.length) {
                    throw new Error("No images generated");
                }
                const base64Images = await Promise.all(
                    result.images.map(async (image) => {
                        console.log("imageUrl console log", image.url);
                        let imageUrl;
                        if (image.url.includes("http")) {
                            imageUrl = image.url;
                        } else {
                            imageUrl = `${apiKey}${image.url}`;
                        }
                        const imageResponse = await fetch(imageUrl);
                        if (!imageResponse.ok) {
                            throw new Error(
                                `Failed to fetch image: ${imageResponse.statusText}`
                            );
                        }
                        const blob = await imageResponse.blob();
                        const arrayBuffer = await blob.arrayBuffer();
                        const base64 =
                            Buffer.from(arrayBuffer).toString("base64");
                        return `data:image/jpeg;base64,${base64}`;
                    })
                );
                return {
                    success: true,
                    data: base64Images,
                };
            } catch (error) {
                console.error(error);
                return { success: false, error: error };
            }
        } else {
            let targetSize = `${data.width}x${data.height}`;
            if (
                targetSize !== "1024x1024" &&
                targetSize !== "1792x1024" &&
                targetSize !== "1024x1792"
            ) {
                targetSize = "1024x1024";
            }
            const openaiApiKey = runtime.getSetting("OPENAI_API_KEY") as string;
            if (!openaiApiKey) {
                throw new Error("OPENAI_API_KEY is not set");
            }
            const openai = new OpenAI({
                apiKey: openaiApiKey as string,
            });
            const response = await openai.images.generate({
                model,
                prompt: data.prompt,
                size: targetSize as "1024x1024" | "1792x1024" | "1024x1792",
                n: data.count,
                response_format: "b64_json",
            });
            const base64s = response.data.map(
                (image) => `data:image/png;base64,${image.b64_json}`
            );
            return { success: true, data: base64s };
        }
    } catch (error) {
        console.error(error);
        return { success: false, error: error };
    }
};

export const generateCaption = async (
    data: { imageUrl: string },
    runtime: IAgentRuntime
): Promise<{
    title: string;
    description: string;
}> => {
    const { imageUrl } = data;
    const imageDescriptionService =
        runtime.getService<IImageDescriptionService>(
            ServiceType.IMAGE_DESCRIPTION
        );

    if (!imageDescriptionService) {
        throw new Error("Image description service not found");
    }

    const resp = await imageDescriptionService.describeImage(imageUrl);
    return {
        title: resp.title.trim(),
        description: resp.description.trim(),
    };
};

export const generateWebSearch = async (
    query: string,
    runtime: IAgentRuntime
): Promise<SearchResponse> => {
    try {
        const apiKey = runtime.getSetting("TAVILY_API_KEY") as string;
        if (!apiKey) {
            throw new Error("TAVILY_API_KEY is not set");
        }
        const tvly = tavily({ apiKey });
        const response = await tvly.search(query, {
            includeAnswer: true,
            maxResults: 3, // 5 (default)
            topic: "general", // "general"(default) "news"
            searchDepth: "basic", // "basic"(default) "advanced"
            includeImages: false, // false (default) true
        });
        return response;
    } catch (error) {
        elizaLogger.error("Error:", error);
    }
};

export async function generateTweetActions({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<ActionResponse | null> {
    let retryDelay = 1000;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    while (retryCount < MAX_RETRIES) {
        try {
            const response = await generateText({
                runtime,
                context,
                modelClass,
            });

            const parsedResponse = parseTagContent(response, "response");
            const { actions } = parseActionResponseFromText(parsedResponse);
            if (actions) {
                console.debug("Parsed tweet actions:", actions);
                return actions;
            }
            elizaLogger.debug("generateTweetActions no valid response");
        } catch (error) {
            elizaLogger.error("Error in generateTweetActions:", error);
            if (
                error instanceof TypeError &&
                error.message.includes("queueTextCompletion")
            ) {
                elizaLogger.error(
                    "TypeError: Cannot read properties of null (reading 'queueTextCompletion')"
                );
            }
        }
        elizaLogger.log(
            `Retrying in ${retryDelay}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
        retryCount++;
    }

    throw new Error("Failed to generate tweet actions after maximum retries");
}

export async function generateObject<T>({
    runtime,
    context,
    modelClass,
    schema,
    schemaName,
    schemaDescription,
    stop,
    customSystemPrompt,
}: GenerationOptions): Promise<GenerateObjectResult<T>> {
    if (!context) {
        throw new Error("generateObject context is empty");
    }

    const provider = runtime.modelProvider;
    const modelSettings = getModelSettings(provider, modelClass);

    if (!modelSettings) {
        throw new Error(`Model settings not found for provider: ${provider}`);
    }

    context = await trimTokens(context, modelSettings.maxInputTokens, runtime);

    const modelOptions: ModelSettings = {
        prompt: context,
        temperature: modelSettings.temperature,
        maxTokens: modelSettings.maxOutputTokens,
        frequencyPenalty: modelSettings.frequency_penalty,
        presencePenalty: modelSettings.presence_penalty,
        stop: stop || modelSettings.stop,
        experimental_telemetry: modelSettings.experimental_telemetry,
    };

    const model = getModel(provider, modelSettings.name);

    const result = await aiGenerateObject({
        model,
        schema,
        schemaName,
        schemaDescription,
        system: customSystemPrompt ?? runtime.character?.system ?? undefined,
        ...modelOptions,
    });

    elizaLogger.debug("generateObject result:", result.object);
    schema.parse(result.object);
    return result;
}

function getModel(provider: ModelProviderName, model: string): LanguageModelV1 {
    switch (provider) {
        case ModelProviderName.OPENAI:
            return openai(model);
        case ModelProviderName.ANTHROPIC:
            return anthropic(model);
        case ModelProviderName.DEEPSEEK:
            return deepseek(model);
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
}
