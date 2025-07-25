import { GenerationSettings, Memory, ModelSettings } from "./types.ts";
import { createHash } from "crypto";

type GenerationSettingsOptions = {
    context: string;
    modelSettings: ModelSettings;
    message?: Memory;
    functionId?: string;
    tags?: string[];
};

export function buildGenerationSettings(opts: GenerationSettingsOptions): GenerationSettings {
    const { context, modelSettings, message, functionId, tags } = opts;
    return {
        prompt: context,
        temperature: modelSettings.temperature,
        maxTokens: modelSettings.maxOutputTokens,
        frequencyPenalty: modelSettings.frequency_penalty,
        presencePenalty: modelSettings.presence_penalty,
        experimental_telemetry: {
            isEnabled: true,
            functionId,
            metadata: getMetadata(message, tags),
        },
        stop: modelSettings.stop,
    };
}

function getMetadata(message: Memory, tags?: string[]) {
    if (!message) {
        return {
            tags: tags || [],
        };
    }

    return {
        userId: message.userId,
        agentId: message.agentId,
        roomId: message.roomId,
        sessionId: message.id,
        langfuseTraceId: toTraceId(message.id),
        tags: [...(tags || []), message.agentId].filter(Boolean),
    };
}

export const toTraceId = (seed: string) =>
    createHash("sha256").update(String(seed)).digest("hex").slice(0, 32);
