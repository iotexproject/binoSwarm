import { openai } from "@ai-sdk/openai";
import { embed as embedAi, embedMany as embedManyAi } from "ai";

import { IAgentRuntime, ModelProviderName } from "./types.ts";
import settings from "./settings.ts";
import elizaLogger from "./logger.ts";
import LocalEmbeddingModelManager from "./localembeddingManager.ts";

const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_RETRIES = 3;

export async function embed(
    runtime: IAgentRuntime,
    input: string
): Promise<number[]> {
    elizaLogger.debug("Embedding request:", {
        modelProvider: runtime.character.modelProvider,
        useOpenAI: process.env.USE_OPENAI_EMBEDDING,
        input: input?.slice(0, 50) + "...",
        inputType: typeof input,
        inputLength: input?.length,
        isString: typeof input === "string",
        isEmpty: !input,
    });

    // Validate input
    if (!input || typeof input !== "string" || input.trim().length === 0) {
        elizaLogger.warn("Invalid embedding input:", {
            input,
            type: typeof input,
            length: input?.length,
        });
        return []; // Return empty embedding array
    }

    const cachedEmbedding = await retrieveCachedEmbedding(runtime, input);
    if (cachedEmbedding) return cachedEmbedding;

    const isLocal = getEmbeddingType(runtime) === "local";
    if (isLocal) {
        return await getLocalEmbedding(input);
    }
    return await getRemoteEmbedding(input);
}

export async function embedMany(values: string[]): Promise<number[][]> {
    const { embeddings } = await embedManyAi({
        model: openai.embedding(EMBEDDING_MODEL),
        values,
        maxRetries: EMBEDDING_RETRIES,
    });

    return embeddings;
}

async function getLocalEmbedding(input: string): Promise<number[]> {
    elizaLogger.debug("DEBUG - Inside getLocalEmbedding function");

    try {
        const embeddingManager = LocalEmbeddingModelManager.getInstance();
        return await embeddingManager.generateEmbedding(input);
    } catch (error) {
        elizaLogger.error("Local embedding failed:", error);
        throw error;
    }
}

async function retrieveCachedEmbedding(runtime: IAgentRuntime, input: string) {
    if (!input) {
        elizaLogger.log("No input to retrieve cached embedding for");
        return null;
    }

    const similaritySearchResult =
        await runtime.messageManager.getCachedEmbeddings(input);
    if (similaritySearchResult.length > 0) {
        return similaritySearchResult[0].embedding;
    }
    return null;
}

async function getRemoteEmbedding(input: string): Promise<number[]> {
    try {
        const { embedding } = await embedAi({
            model: openai.embedding(EMBEDDING_MODEL),
            value: input,
            maxRetries: EMBEDDING_RETRIES,
        });
        return embedding;
    } catch (e) {
        elizaLogger.error("Full error details:", e);
        throw e;
    }
}

function getEmbeddingType(runtime: IAgentRuntime): "local" | "remote" {
    const isNode =
        typeof process !== "undefined" &&
        process.versions != null &&
        process.versions.node != null;

    const isLocal =
        isNode &&
        runtime.character.modelProvider !== ModelProviderName.OPENAI &&
        !settings.USE_OPENAI_EMBEDDING;

    return isLocal ? "local" : "remote";
}
