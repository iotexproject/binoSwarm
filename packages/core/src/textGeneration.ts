import {
    generateObject as aiGenerateObject,
    generateText as aiGenerateText,
    GenerateObjectResult,
    StepResult,
    CoreUserMessage,
    Tool,
    GenerateTextResult,
    Message,
} from "ai";

import { elizaLogger } from "./index.ts";
import { getModelSettings, getModel } from "./models.ts";
import {
    IAgentRuntime,
    ModelClass,
    GenerationOptions,
    ModelSettings,
    ModelProviderName,
    Memory,
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
    functionId,
    message,
    tags,
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
    functionId?: string;
    message?: Memory;
    tags?: string[];
}): Promise<string> {
    validateContext(context);

    const provider = runtime.modelProvider;
    const settings = getModelSettings(provider, modelClass);
    validateSettings(settings, provider);

    const cfg = runtime.character?.settings?.modelConfig;
    const max_in = cfg?.maxInputTokens || settings.maxInputTokens;

    context = await trimTokens(context, max_in, runtime);

    const modelOptions = buildGenerationSettings(
        context,
        settings,
        message,
        functionId,
        tags
    );


    const llmModel = getModel(provider, settings.name);

    const result = await aiGenerateText({
        model: llmModel,
        system: customSystemPrompt ?? runtime.character.system ?? undefined,
        tools,
        messages,
        onStepFinish,
        maxSteps,
        ...modelOptions,
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
    message,
    functionId,
    tags,
}: GenerationOptions): Promise<GenerateObjectResult<T>> {
    validateContext(context);

    const provider = runtime.modelProvider;
    const modelSettings = getModelSettings(provider, modelClass);
    validateSettings(modelSettings, provider);

    context = await trimTokens(context, modelSettings.maxInputTokens, runtime);

    const modelOptions = buildGenerationSettings(
        context,
        modelSettings,
        message,
        functionId,
        tags
    );

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

export async function generateObjectFromMessages<T>({
    runtime,
    modelClass,
    schema,
    messages,
    schemaName,
    schemaDescription,
    customSystemPrompt,
    tags,
}: GenerationOptions & {
    messages: Array<CoreUserMessage>;
}): Promise<GenerateObjectResult<T>> {
    const provider = runtime.modelProvider;
    const modelSettings = getModelSettings(provider, modelClass);
    validateSettings(modelSettings, provider);

    const modelOptions = buildGenerationSettings("", modelSettings, undefined, "generateObjectFromMessages", tags);
    delete modelOptions.prompt;

    const model = getModel(provider, modelSettings.name);

    const result = await aiGenerateObject({
        model,
        messages,
        schema,
        schemaName,
        schemaDescription,
        system: customSystemPrompt ?? runtime.character?.system ?? undefined,
        ...modelOptions,
    });

    trackUsage(runtime, result, modelSettings);

    elizaLogger.debug("generateObjectFromMessages result:", result.object);
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
