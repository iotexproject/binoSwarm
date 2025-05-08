import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import {
    generateObject as aiGenerateObject,
    generateText as aiGenerateText,
    GenerateObjectResult,
    StepResult,
    Message,
    Tool,
    ToolSet,
    tool,
    streamText,
    smoothStream,
} from "ai";
import { ZodSchema, z } from "zod";
import { tavily } from "@tavily/core";

import { elizaLogger } from "./index.ts";
import { getModelSettings, getModel } from "./models.ts";
import { parseJSONObjectFromText, parseTagContent } from "./parsing.ts";
import {
    Content,
    IAgentRuntime,
    IImageDescriptionService,
    ModelClass,
    ServiceType,
    SearchResponse,
    ActionResponse,
    GenerationOptions,
    GenerationSettings,
    ModelSettings,
} from "./types.ts";
import { trimTokens } from "./tokenTrimming.ts";

const UTILITY_SYSTEM_PROMPT =
    "You are a neutral processing agent. Wait for task-specific instructions in the user prompt.";
const TOOL_CALL_LIMIT = 5;

export async function generateText({
    runtime,
    context,
    modelClass,
    tools = {},
    onStepFinish,
    maxSteps = 1,
    customSystemPrompt,
    messages,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
    tools?: Record<string, Tool>;
    onStepFinish?: (event: StepResult<any>) => Promise<void> | void;
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
    });

    runtime.metering.trackPrompt({
        tokens: result.usage.promptTokens,
        model: settings.name,
        type: "input",
    });
    runtime.metering.trackPrompt({
        tokens: result.usage.completionTokens,
        model: settings.name,
        type: "output",
    });

    elizaLogger.debug("generateText result:", result.text);
    return result.text;
}

export async function generateShouldRespond({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<"RESPOND" | "IGNORE" | "STOP"> {
    const shouldRespondSchema = z.object({
        analysis: z.string().describe("A detailed analysis of your response"),
        response: z.enum(["RESPOND", "IGNORE", "STOP"]),
    });

    try {
        const response = await generateObject<{
            response: "RESPOND" | "IGNORE" | "STOP";
        }>({
            runtime,
            context,
            modelClass,
            schema: shouldRespondSchema,
            schemaName: "ShouldRespond",
            schemaDescription: "A boolean value",
            customSystemPrompt: UTILITY_SYSTEM_PROMPT,
        });

        return response.object.response;
    } catch (error) {
        elizaLogger.error("Error in generateShouldRespond:", error);
        return "IGNORE";
    }
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
    const booleanSchema = z.object({
        analysis: z.string().describe("A detailed analysis of your response"),
        response: z.boolean(),
    });

    try {
        const response = await generateObject<{ response: boolean }>({
            runtime,
            context,
            modelClass,
            schema: booleanSchema,
            schemaName: "Boolean",
            schemaDescription: "A boolean value",
            customSystemPrompt: UTILITY_SYSTEM_PROMPT,
        });

        return response.object.response;
    } catch (error) {
        elizaLogger.error("Error in generateTrueOrFalse:", error);
    }
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
        responseAnalysis: z
            .string()
            .describe(
                "Any type of analysis and resoning for response generation comes here."
            ),
        text: z
            .string()
            .describe(
                "Cleaned up response for the user. It should not include any analysis, reasoning or action names, it will be directly sent to the user."
            ),
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
}): Promise<ActionResponse> {
    const actionsSchema = z.object({
        analysis: z.string().describe("A detailed analysis of the tweet"),
        like: z.boolean().describe("Whether to like the tweet"),
        retweet: z.boolean().describe("Whether to retweet the tweet"),
        quote: z.boolean().describe("Whether to quote the tweet"),
        reply: z.boolean().describe("Whether to reply to the tweet"),
    });

    try {
        const response = await generateObject<ActionResponse>({
            runtime,
            context,
            modelClass,
            schema: actionsSchema,
            schemaName: "Actions",
            schemaDescription: "The actions to take on the tweet",
            customSystemPrompt: UTILITY_SYSTEM_PROMPT,
        });

        return response.object;
    } catch (error) {
        elizaLogger.error("Error in generateTweetActions:", error);
        return {
            like: false,
            retweet: false,
            quote: false,
            reply: false,
        };
    }
}

export async function generateObject<T>({
    runtime,
    context,
    modelClass,
    schema,
    schemaName,
    schemaDescription,
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
    const modelOptions = buildGenerationSettings(context, modelSettings);

    const model = getModel(provider, modelSettings.name);

    const result = await aiGenerateObject({
        model,
        schema,
        schemaName,
        schemaDescription,
        system: customSystemPrompt ?? runtime.character?.system ?? undefined,
        ...modelOptions,
    });

    runtime.metering.trackPrompt({
        tokens: result.usage.promptTokens,
        model: modelSettings.name,
        type: "input",
    });
    runtime.metering.trackPrompt({
        tokens: result.usage.completionTokens,
        model: modelSettings.name,
        type: "output",
    });

    elizaLogger.debug("generateObject result:", result.object);
    schema.parse(result.object);
    return result;
}

export async function generateTextWithTools({
    runtime,
    context,
    modelClass,
    customSystemPrompt,
    tools,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
    stop?: string[];
    customSystemPrompt?: string;
    tools: {
        name: string;
        description: string;
        parameters: ZodSchema;
        execute: (args: any) => Promise<any>;
    }[];
}): Promise<string> {
    if (!context) {
        throw new Error("generateObject context is empty");
    }

    const provider = runtime.modelProvider;
    const modelSettings = getModelSettings(provider, modelClass);

    if (!modelSettings) {
        throw new Error(`Model settings not found for provider: ${provider}`);
    }

    context = await trimTokens(context, modelSettings.maxInputTokens, runtime);
    const modelOptions: GenerationSettings = buildGenerationSettings(
        context,
        modelSettings
    );

    const model = getModel(provider, modelSettings.name);

    const result = await aiGenerateText({
        model,
        system: customSystemPrompt ?? runtime.character?.system ?? undefined,
        tools: buildToolSet(tools),
        maxSteps: TOOL_CALL_LIMIT,
        experimental_continueSteps: true,
        onStepFinish(step: any) {
            runtime.metering.trackPrompt({
                tokens: step.usage.promptTokens,
                model: modelSettings.name,
                type: "input",
            });
            runtime.metering.trackPrompt({
                tokens: step.usage.completionTokens,
                model: modelSettings.name,
                type: "output",
            });
            logStep(step);
        },
        ...modelOptions,
    });

    elizaLogger.debug("generateTextWithTools result:", result.text);
    return result.text;
}

export function streamWithTools({
    runtime,
    context,
    modelClass,
    customSystemPrompt,
    tools,
    smoothStreamBy = "word",
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
    customSystemPrompt?: string;
    tools: {
        name: string;
        description: string;
        parameters: ZodSchema;
        execute: (args: any) => Promise<any>;
    }[];
    smoothStreamBy?: "word" | "line" | RegExp;
}): any {
    if (!context) {
        throw new Error("generateObject context is empty");
    }

    const provider = runtime.modelProvider;
    const modelSettings = getModelSettings(provider, modelClass);

    if (!modelSettings) {
        throw new Error(`Model settings not found for provider: ${provider}`);
    }

    const modelOptions = buildGenerationSettings(context, modelSettings);

    const model = getModel(provider, modelSettings.name);

    const result = streamText({
        model,
        system: customSystemPrompt ?? runtime.character?.system ?? undefined,
        tools: buildToolSet(tools),
        maxSteps: TOOL_CALL_LIMIT,
        experimental_continueSteps: true,
        toolCallStreaming: true,
        experimental_transform: smoothStream({ chunking: smoothStreamBy }),
        onStepFinish(step: any) {
            logStep(step);
        },
        onFinish(step: any) {
            runtime.metering.trackPrompt({
                tokens: step.usage.promptTokens,
                model: modelSettings.name,
                type: "input",
            });
            runtime.metering.trackPrompt({
                tokens: step.usage.completionTokens,
                model: modelSettings.name,
                type: "output",
            });
        },
        ...modelOptions,
    });

    return result;
}

function buildToolSet(
    tools: {
        name: string;
        description: string;
        parameters: ZodSchema;
        execute: (args: any) => Promise<any>;
    }[]
): ToolSet {
    const toolSet: ToolSet = {};
    tools.forEach((rawTool) => {
        toolSet[rawTool.name] = tool(rawTool);
    });
    return toolSet;
}

function buildGenerationSettings(
    context: string,
    modelSettings: ModelSettings
): GenerationSettings {
    return {
        prompt: context,
        temperature: modelSettings.temperature,
        maxTokens: modelSettings.maxOutputTokens,
        frequencyPenalty: modelSettings.frequency_penalty,
        presencePenalty: modelSettings.presence_penalty,
        experimental_telemetry: modelSettings.experimental_telemetry,
        stop: modelSettings.stop,
    };
}

function logStep(step: any) {
    elizaLogger.log("step: ", step.text);
    elizaLogger.log("toolCalls: ", step.toolCalls);
    elizaLogger.log("toolResults: ", step.toolResults);
    elizaLogger.log("finishReason: ", step.finishReason);
    elizaLogger.log("usage: ", step.usage);
}
