import { experimental_generateImage as aiGenerateImage } from "ai";
import { openai } from "@ai-sdk/openai";
import { randomUUID } from "crypto";
import { Langfuse } from "langfuse";

import { elizaLogger } from "./index.ts";
import { getImageModelSettings } from "./models.ts";
import type { IAgentRuntime } from "./types.ts";

type ImageGenerationOptions = {
    prompt: string;
    width: number;
    height: number;
    count?: number;
    negativePrompt?: string;
    numIterations?: number;
    guidanceScale?: number;
    seed?: number;
    modelId?: string;
    jobId?: string;
    stylePreset?: string;
    hideWatermark?: boolean;
};

type ImageGenerationResult = {
    success: boolean;
    data?: string[];
    error?: any;
};

type AllowedTargetSize = "1024x1024" | "1792x1024" | "1024x1792";

export const generateImage = async (
    data: ImageGenerationOptions,
    runtime: IAgentRuntime
): Promise<ImageGenerationResult> => {
    const modelSettings = getImageModelSettings(runtime.imageModelProvider);

    const model = modelSettings.name;
    elizaLogger.info("Generating image with options:", {
        imageModelProvider: model,
    });

    try {
        const size = getTargetSize(data);

        const parentTraceId = randomUUID();
        const langfuse = new Langfuse();
        const trace =langfuse.trace({
            id: parentTraceId,
            name: "generateImage",
        });

        trace.generation({
            id: randomUUID(),
            name: "generateImage",
            model: model,
            input: data.prompt,
        });

        const { image } = await aiGenerateImage({
            model: openai.image(model),
            prompt: data.prompt,
            size,
        });

        await langfuse.flushAsync();

        createMeteringEvent(runtime, model, size);

        return { success: true, data: [image.base64] };
    } catch (error) {
        elizaLogger.error(error);
        return { success: false, error };
    }
};

function createMeteringEvent(
    runtime: IAgentRuntime,
    model: string,
    size: string
) {
    const event = runtime.metering.createEvent({
        type: "image",
        data: {
            model,
            size,
        },
    });
    runtime.metering.track(event);
}

function getTargetSize(data: ImageGenerationOptions): AllowedTargetSize {
    let targetSize = `${data.width}x${data.height}`;
    if (
        targetSize !== "1024x1024" &&
        targetSize !== "1792x1024" &&
        targetSize !== "1024x1792"
    ) {
        targetSize = "1024x1024";
    }
    return targetSize as AllowedTargetSize;
}
