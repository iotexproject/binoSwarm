import {
    generateObject as aiGenerateObject,
    generateText as aiGenerateText,
    GenerateObjectResult,
    StepResult,
    Message,
    Tool,
} from "ai";

import { elizaLogger } from "./index.ts";
import { getModelSettings, getModel } from "./models.ts";
import { parseJSONObjectFromText, parseTagContent } from "./parsing.ts";
import { IAgentRuntime, ModelClass, GenerationOptions } from "./types.ts";
import { trimTokens } from "./tokenTrimming.ts";
import { buildGenerationSettings } from "./generationHelpers.ts";

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
