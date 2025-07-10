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
            functionId: getFunctionId(functionId, message),
            metadata: getMetadata(message),
        },
        stop: modelSettings.stop,
    };
}

function getFunctionId(functionId: string, message: Memory) {
    if (message) {
        return `${functionId}_${message.id}`;
    }

    return functionId;
}

function getMetadata(message: Memory) {
    if (!message) {
        return undefined;
    }

    return {
        langfuseTraceId: message.id,
        userId: message.userId,
        agentId: message.agentId,
        roomId: message.roomId,
    };
}
