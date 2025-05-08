import { GenerationSettings, ModelSettings } from "./types.ts";

export function buildGenerationSettings(
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
