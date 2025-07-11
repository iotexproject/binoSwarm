import { GenerationSettings, Memory, ModelSettings } from "./types.ts";
import { createHash } from "crypto";

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
            metadata: getMetadata(message),
        },
        stop: modelSettings.stop,
    };
}

function getMetadata(message: Memory) {
    if (!message) {
        return undefined;
    }

    return {
        userId: message.userId,
        agentId: message.agentId,
        roomId: message.roomId,
        sessionId: message.id,
        langfuseTraceId: toTraceId(message.id),
    };
}

export const toTraceId = (seed: string) =>
    createHash("sha256").update(String(seed)).digest("hex").slice(0, 32);
