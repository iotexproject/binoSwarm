import { readFile } from "fs/promises";
import { join } from "path";

import { embed } from "./embedding.ts";
import { splitChunks } from "./generation.ts";
import elizaLogger from "./logger.ts";
import {
    IAgentRuntime,
    IRAGKnowledgeManager,
    RAGKnowledgeItem,
    UUID,
} from "./types.ts";
import { stringToUuid } from "./uuid.ts";
import { Pinecone } from "@pinecone-database/pinecone";
import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";

const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});
const index = pc.index(process.env.PINECONE_INDEX);
/**
 * Manage knowledge in the database.
 */
export class RAGKnowledgeManager implements IRAGKnowledgeManager {
    /**
     * The AgentRuntime instance associated with this manager.
     */
    runtime: IAgentRuntime;

    /**
     * The name of the database table this manager operates on.
     */
    tableName: string;

    /**
     * Constructs a new KnowledgeManager instance.
     * @param opts Options for the manager.
     * @param opts.tableName The name of the table this manager will operate on.
     * @param opts.runtime The AgentRuntime instance associated with this manager.
     */
    constructor(opts: { tableName: string; runtime: IAgentRuntime }) {
        this.runtime = opts.runtime;
        this.tableName = opts.tableName;
    }

    private readonly defaultRAGMatchThreshold = Number(
        process.env.DEFAULT_RAG_MATCH_THRESHOLD || "0.85"
    );
    private readonly defaultRAGMatchCount = Number(
        process.env.DEFAULT_RAG_MATCH_COUNT || "5"
    );

    /**
     * Common English stop words to filter out from query analysis
     */
    private readonly stopWords = new Set([
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "does",
        "for",
        "from",
        "had",
        "has",
        "have",
        "he",
        "her",
        "his",
        "how",
        "hey",
        "i",
        "in",
        "is",
        "it",
        "its",
        "of",
        "on",
        "or",
        "that",
        "the",
        "this",
        "to",
        "was",
        "what",
        "when",
        "where",
        "which",
        "who",
        "will",
        "with",
        "would",
        "there",
        "their",
        "they",
        "your",
        "you",
    ]);

    /**
     * Filters out stop words and returns meaningful terms
     */
    private getQueryTerms(query: string): string[] {
        return query
            .toLowerCase()
            .split(" ")
            .filter((term) => term.length > 3) // Filter very short words
            .filter((term) => !this.stopWords.has(term)); // Filter stop words
    }

    /**
     * Preprocesses text content for better RAG performance.
     * @param content The text content to preprocess.
     * @returns The preprocessed text.
     */

    private preprocess(content: string): string {
        if (!content || typeof content !== "string") {
            elizaLogger.warn("Invalid input for preprocessing");
            return "";
        }

        return content
            .replace(/```[\s\S]*?```/g, "")
            .replace(/`.*?`/g, "")
            .replace(/#{1,6}\s*(.*)/g, "$1")
            .replace(/!\[(.*?)\]\(.*?\)/g, "$1")
            .replace(/\[(.*?)\]\(.*?\)/g, "$1")
            .replace(/(https?:\/\/)?(www\.)?([^\s]+\.[^\s]+)/g, "$3")
            .replace(/<@[!&]?\d+>/g, "")
            .replace(/<[^>]*>/g, "")
            .replace(/^\s*[-*_]{3,}\s*$/gm, "")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*/g, "")
            .replace(/\s+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/[^a-zA-Z0-9\s\-_./:?=&]/g, "")
            .trim()
            .toLowerCase();
    }

    private hasProximityMatch(text: string, terms: string[]): boolean {
        const words = text.toLowerCase().split(" ");
        const positions = terms
            .map((term) => words.findIndex((w) => w.includes(term)))
            .filter((pos) => pos !== -1);

        if (positions.length < 2) return false;

        // Check if any matches are within 5 words of each other
        for (let i = 0; i < positions.length - 1; i++) {
            if (Math.abs(positions[i] - positions[i + 1]) <= 5) {
                return true;
            }
        }
        return false;
    }

    async getKnowledge(params: {
        query?: string;
        id?: UUID;
        conversationContext?: string;
        limit?: number;
        agentId?: UUID;
    }): Promise<RAGKnowledgeItem[]> {
        const agentId = params.agentId || this.runtime.agentId;

        // If id is provided, do direct lookup first
        if (params.id) {
            const directResults =
                await this.runtime.databaseAdapter.getKnowledge({
                    id: params.id,
                    agentId: agentId,
                });

            if (directResults.length > 0) {
                return directResults;
            }
        }

        // If no id or no direct results, perform semantic search
        if (!params.query) {
            return [];
        }

        try {
            const processedQuery = this.preprocess(params.query);

            // Build search text with optional context
            let searchText = processedQuery;
            if (params.conversationContext) {
                const relevantContext = this.preprocess(
                    params.conversationContext
                );
                searchText = `${relevantContext} ${processedQuery}`;
            }

            const embeddingArray = await embed(this.runtime, searchText);

            const embedding = new Float32Array(embeddingArray);

            // Get results with single query
            const results = await this.runtime.databaseAdapter.searchKnowledge({
                agentId: this.runtime.agentId,
                embedding: embedding,
                match_threshold: this.defaultRAGMatchThreshold,
                match_count: (params.limit || this.defaultRAGMatchCount) * 2,
                searchText: processedQuery,
            });

            const rerankedResults = this.rerankResults(
                results,
                processedQuery,
                params
            );

            const filteredResults = rerankedResults
                .filter(
                    (result) => result.score >= this.defaultRAGMatchThreshold
                )
                .slice(0, params.limit || this.defaultRAGMatchCount);

            return filteredResults;
        } catch (error) {
            elizaLogger.error(`[RAG Search Error] ${error}`);
            return [];
        }
    }

    private rerankResults(
        results: RAGKnowledgeItem[],
        processedQuery: string,
        params: {
            query?: string;
            id?: UUID;
            conversationContext?: string;
            limit?: number;
            agentId?: UUID;
        }
    ) {
        return results
            .map((result) => {
                let score = result.similarity;

                // Check for direct query term matches
                const queryTerms = this.getQueryTerms(processedQuery);

                const matchingTerms = queryTerms.filter((term) =>
                    result.content.text.toLowerCase().includes(term)
                );

                if (matchingTerms.length > 0) {
                    // Much stronger boost for matches
                    score *= 1 + (matchingTerms.length / queryTerms.length) * 2; // Double the boost

                    if (
                        this.hasProximityMatch(
                            result.content.text,
                            matchingTerms
                        )
                    ) {
                        score *= 1.5; // Stronger proximity boost
                    }
                } else {
                    // More aggressive penalty
                    if (!params.conversationContext) {
                        score *= 0.3; // Stronger penalty
                    }
                }

                return {
                    ...result,
                    score,
                    matchedTerms: matchingTerms, // Add for debugging
                };
            })
            .sort((a, b) => b.score - a.score);
    }

    async createKnowledge(item: RAGKnowledgeItem): Promise<void> {
        if (!item.content.text) {
            elizaLogger.warn("Empty content in knowledge item");
            return;
        }

        try {
            const processedContent = this.preprocess(item.content.text);
            const chunks = await splitChunks(processedContent, 512, 20);

            const { embeddings } = await embedMany({
                model: openai.embedding("text-embedding-3-large"),
                values: [processedContent, ...chunks],
                maxRetries: 3,
            });

            await index.namespace(this.runtime.agentId.toString()).upsert([
                {
                    id: item.id,
                    values: embeddings[0],
                    metadata: {
                        text: item.content.text,
                        isMain: true,
                        ...item.content.metadata,
                        createdAt: Date.now().toString(),
                    },
                },
                ...chunks.map((chunk, index) => ({
                    id: `${item.id}-chunk-${index}` as UUID,
                    values: embeddings[index + 1],
                    metadata: {
                        text: chunk,
                        isChunk: true,
                        originalId: item.id,
                        chunkIndex: index,
                        createdAt: Date.now().toString(),
                    },
                })),
            ]);
        } catch (error) {
            elizaLogger.error(`Error processing knowledge ${item.id}:`, error);
            throw error;
        }
    }

    async searchKnowledge(params: {
        agentId: UUID;
        embedding: Float32Array | number[];
        match_threshold?: number;
        match_count?: number;
        searchText?: string;
    }): Promise<RAGKnowledgeItem[]> {
        const {
            match_threshold = this.defaultRAGMatchThreshold,
            match_count = this.defaultRAGMatchCount,
            embedding,
            searchText,
        } = params;

        const float32Embedding = Array.isArray(embedding)
            ? new Float32Array(embedding)
            : embedding;

        return await this.runtime.databaseAdapter.searchKnowledge({
            agentId: params.agentId || this.runtime.agentId,
            embedding: float32Embedding,
            match_threshold,
            match_count,
            searchText,
        });
    }

    async removeKnowledge(id: UUID): Promise<void> {
        await this.runtime.databaseAdapter.removeKnowledge(id);
    }

    async clearKnowledge(shared?: boolean): Promise<void> {
        await this.runtime.databaseAdapter.clearKnowledge(
            this.runtime.agentId,
            shared ? shared : false
        );
    }

    async processFile(file: {
        path: string;
        content: string;
        type: "pdf" | "md" | "txt";
        isShared?: boolean;
    }): Promise<void> {
        const timeMarker = (label: string) => {
            const time = (Date.now() - startTime) / 1000;
            elizaLogger.info(`[Timing] ${label}: ${time.toFixed(2)}s`);
        };

        const startTime = Date.now();
        const content = file.content;

        try {
            const fileSizeKB = new TextEncoder().encode(content).length / 1024;
            elizaLogger.info(
                `[File Progress] Starting ${file.path} (${fileSizeKB.toFixed(2)} KB)`
            );

            // Step 1: Preprocessing
            //const preprocessStart = Date.now();
            const processedContent = this.preprocess(content);
            timeMarker("Preprocessing");

            // Step 2: Main document embedding
            const mainEmbeddingArray = await embed(
                this.runtime,
                processedContent
            );
            const mainEmbedding = new Float32Array(mainEmbeddingArray);
            timeMarker("Main embedding");

            // Step 3: Create main document
            await this.runtime.databaseAdapter.createKnowledge({
                id: stringToUuid(file.path),
                agentId: this.runtime.agentId,
                content: {
                    text: content,
                    metadata: {
                        source: file.path,
                        type: file.type,
                        isShared: file.isShared || false,
                    },
                },
                embedding: mainEmbedding,
                createdAt: Date.now(),
            });
            timeMarker("Main document storage");

            // Step 4: Generate chunks
            const chunks = await splitChunks(processedContent, 512, 20);
            const totalChunks = chunks.length;
            elizaLogger.info(`Generated ${totalChunks} chunks`);
            timeMarker("Chunk generation");

            // Step 5: Process chunks with larger batches
            const BATCH_SIZE = 10; // Increased batch size
            let processedChunks = 0;

            for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                const batchStart = Date.now();
                const batch = chunks.slice(
                    i,
                    Math.min(i + BATCH_SIZE, chunks.length)
                );

                // Process embeddings in parallel
                const embeddings = await Promise.all(
                    batch.map((chunk) => embed(this.runtime, chunk))
                );

                // Batch database operations
                await Promise.all(
                    embeddings.map(async (embeddingArray, index) => {
                        const chunkId =
                            `${stringToUuid(file.path)}-chunk-${i + index}` as UUID;
                        const chunkEmbedding = new Float32Array(embeddingArray);

                        await this.runtime.databaseAdapter.createKnowledge({
                            id: chunkId,
                            agentId: this.runtime.agentId,
                            content: {
                                text: batch[index],
                                metadata: {
                                    source: file.path,
                                    type: file.type,
                                    isShared: file.isShared || false,
                                    isChunk: true,
                                    originalId: stringToUuid(file.path),
                                    chunkIndex: i + index,
                                },
                            },
                            embedding: chunkEmbedding,
                            createdAt: Date.now(),
                        });
                    })
                );

                processedChunks += batch.length;
                const batchTime = (Date.now() - batchStart) / 1000;
                elizaLogger.info(
                    `[Batch Progress] Processed ${processedChunks}/${totalChunks} chunks (${batchTime.toFixed(2)}s for batch)`
                );
            }

            const totalTime = (Date.now() - startTime) / 1000;
            elizaLogger.info(
                `[Complete] Processed ${file.path} in ${totalTime.toFixed(2)}s`
            );
        } catch (error) {
            if (
                file.isShared &&
                error?.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
            ) {
                elizaLogger.info(
                    `Shared knowledge ${file.path} already exists in database, skipping creation`
                );
                return;
            }
            elizaLogger.error(`Error processing file ${file.path}:`, error);
            throw error;
        }
    }

    async processCharacterRAGKnowledge(
        items: (string | { path: string; shared?: boolean })[]
    ) {
        let hasError = false;

        for (const item of items) {
            if (!item) continue;

            try {
                // Check if item is marked as shared
                let isShared = false;
                let contentItem = item;

                // Only treat as shared if explicitly marked
                if (typeof item === "object" && "path" in item) {
                    isShared = item.shared === true;
                    contentItem = item.path;
                } else {
                    contentItem = item;
                }

                const knowledgeId = stringToUuid(contentItem);
                const fileExtension = contentItem
                    .split(".")
                    .pop()
                    ?.toLowerCase();

                // Check if it's a file or direct knowledge
                if (
                    fileExtension &&
                    ["md", "txt", "pdf"].includes(fileExtension)
                ) {
                    try {
                        const rootPath = join(process.cwd(), "..");
                        const filePath = join(
                            rootPath,
                            "characters",
                            "knowledge",
                            contentItem
                        );
                        elizaLogger.info(
                            "Attempting to read file from:",
                            filePath
                        );

                        // Get existing knowledge first
                        const existingKnowledge = await this.getKnowledge({
                            id: knowledgeId,
                            agentId: this.runtime.agentId,
                        });

                        const content: string = await readFile(
                            filePath,
                            "utf8"
                        );
                        if (!content) {
                            hasError = true;
                            continue;
                        }

                        // If the file exists in DB, check if content has changed
                        if (existingKnowledge.length > 0) {
                            const existingContent =
                                existingKnowledge[0].content.text;
                            if (existingContent === content) {
                                elizaLogger.info(
                                    `File ${contentItem} unchanged, skipping`
                                );
                                continue;
                            } else {
                                // If content changed, remove old knowledge before adding new
                                await this.removeKnowledge(knowledgeId);
                                // Also remove any associated chunks - this is needed for non-PostgreSQL adapters
                                // PostgreSQL adapter handles chunks internally via foreign keys
                                await this.removeKnowledge(
                                    `${knowledgeId}-chunk-*` as UUID
                                );
                            }
                        }

                        elizaLogger.info(
                            `Successfully read ${fileExtension.toUpperCase()} file content for`,
                            this.runtime.character.name,
                            "-",
                            contentItem
                        );

                        await this.processFile({
                            path: contentItem,
                            content: content,
                            type: fileExtension as "pdf" | "md" | "txt",
                            isShared: isShared,
                        });
                    } catch (error: any) {
                        hasError = true;
                        elizaLogger.error(
                            `Failed to read knowledge file ${contentItem}. Error details:`,
                            error?.message || error || "Unknown error"
                        );
                        continue; // Continue to next item even if this one fails
                    }
                } else {
                    // Handle direct knowledge string
                    elizaLogger.info(
                        "Processing direct knowledge for",
                        this.runtime.character.name,
                        "-",
                        contentItem.slice(0, 100)
                    );

                    const existingKnowledge = await this.getKnowledge({
                        id: knowledgeId,
                        agentId: this.runtime.agentId,
                    });

                    if (existingKnowledge.length > 0) {
                        elizaLogger.info(
                            `Direct knowledge ${knowledgeId} already exists, skipping`
                        );
                        continue;
                    }

                    await this.createKnowledge({
                        id: knowledgeId,
                        agentId: this.runtime.agentId,
                        content: {
                            text: contentItem,
                            metadata: {
                                type: "direct",
                            },
                        },
                    });
                }
            } catch (error: any) {
                hasError = true;
                elizaLogger.error(
                    `Error processing knowledge item ${item}:`,
                    error?.message || error || "Unknown error"
                );
                continue; // Continue to next item even if this one fails
            }
        }

        if (hasError) {
            elizaLogger.warn(
                "Some knowledge items failed to process, but continuing with available knowledge"
            );
        }
    }
}
