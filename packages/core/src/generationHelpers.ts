import { GenerationSettings, Memory, ModelSettings } from "./types.ts";

export function buildGenerationSettings(
    context: string,
    modelSettings: ModelSettings,
    message?: Memory
): GenerationSettings {
    return {
        prompt: context,
        temperature: modelSettings.temperature,
        maxTokens: modelSettings.maxOutputTokens,
        frequencyPenalty: modelSettings.frequency_penalty,
        presencePenalty: modelSettings.presence_penalty,
        experimental_telemetry: {
            isEnabled: true,
            functionId: message?.id,
            metadata: message
                ? {
                      userId: message?.userId,
                      agentId: message?.agentId,
                      roomId: message?.roomId,
                  }
                : undefined,
        },
        stop: modelSettings.stop,
    };
}
