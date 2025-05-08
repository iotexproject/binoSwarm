import {
    generateObject as aiGenerateObject,
    generateText as aiGenerateText,
    GenerateObjectResult,
    StepResult,
    Message,
    Tool,
    GenerateTextResult,
} from "ai";

import { elizaLogger } from "./index.ts";
import { getModelSettings, getModel } from "./models.ts";
import {
    IAgentRuntime,
    ModelClass,
    GenerationOptions,
    ModelSettings,
    ModelProviderName,
} from "./types.ts";
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
    validateContext(context);

    const provider = runtime.modelProvider;
    const settings = getModelSettings(provider, modelClass);
    validateSettings(settings, provider);

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

    trackUsage(runtime, result, settings);

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
    validateContext(context);

    const provider = runtime.modelProvider;
    const modelSettings = getModelSettings(provider, modelClass);
    validateSettings(modelSettings, provider);

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

    trackUsage(runtime, result, modelSettings);

    elizaLogger.debug("generateObject result:", result.object);
    schema.parse(result.object);
    return result;
}

function trackUsage(
    runtime: IAgentRuntime,
    result: GenerateObjectResult<any> | GenerateTextResult<any, any>,
    modelSettings: ModelSettings
) {
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
}

function validateContext(context: string) {
    if (!context) {
        throw new Error("generation context is empty");
    }
}

function validateSettings(
    settings: ModelSettings,
    provider: ModelProviderName
) {
    if (!settings) {
        throw new Error(`Model settings not found for provider: ${provider}`);
    }
}
