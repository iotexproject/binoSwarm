import {
    generateText as aiGenerateText,
    ToolSet,
    tool,
    streamText,
    smoothStream,
} from "ai";
import { ZodSchema } from "zod";

import { elizaLogger } from "./index.ts";
import { getModelSettings, getModel } from "./models.ts";
import { IAgentRuntime, ModelClass, GenerationSettings } from "./types.ts";
import { trimTokens } from "./tokenTrimming.ts";
import { buildGenerationSettings } from "./generationHelpers.ts";

const TOOL_CALL_LIMIT = 5;

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

function logStep(step: any) {
    elizaLogger.log("step: ", step.text);
    elizaLogger.log("toolCalls: ", step.toolCalls);
    elizaLogger.log("toolResults: ", step.toolResults);
    elizaLogger.log("finishReason: ", step.finishReason);
    elizaLogger.log("usage: ", step.usage);
}
