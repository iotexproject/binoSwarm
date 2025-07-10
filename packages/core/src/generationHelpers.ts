import { GenerationSettings, Memory, ModelSettings } from "./types.ts";

export function buildGenerationSettings(
    context: string,
    modelSettings: ModelSettings,
    message?: Memory,
    functionId?: string
): GenerationSettings {
    return {
        prompt: context,
        temperature: modelSettings.temperature,
        maxTokens: modelSettings.maxOutputTokens,
        frequencyPenalty: modelSettings.frequency_penalty,
        presencePenalty: modelSettings.presence_penalty,
        experimental_telemetry: {
            isEnabled: true,
            functionId,
            metadata: message
                ? {
                      userId: message?.userId,
                      agentId: message?.agentId,
                      roomId: message?.roomId,
                      sessionId: message?.id,
                  }
                : undefined,
        },
        stop: modelSettings.stop,
    };
}
