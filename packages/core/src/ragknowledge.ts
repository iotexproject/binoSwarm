import { readFile } from "fs/promises";
import { join } from "path";

import { splitChunks } from "./generation.ts";
import elizaLogger from "./logger.ts";
import {
    IAgentRuntime,
    IRAGKnowledgeManager,
    RAGKnowledgeItem,
    UUID,
} from "./types.ts";
import { stringToUuid } from "./uuid.ts";
import { embed, embedMany } from "./embedding.ts";
import { VectorDB } from "./vectorDB.ts";

type RAGKnowledgeItemMetadata = {
    type: string;
    isChunk: boolean;
    isMain: boolean;
    source: string;
    inputHash: string;
    originalId?: UUID;
    chunkIndex?: number;
    isShared?: boolean;
};

export class RAGKnowledgeManager implements IRAGKnowledgeManager {
    runtime: IAgentRuntime;
    vectorDB: VectorDB<RAGKnowledgeItemMetadata>;
    constructor(opts: { runtime: IAgentRuntime }) {
        this.runtime = opts.runtime;
        this.vectorDB = new VectorDB<RAGKnowledgeItemMetadata>();
    }

    private readonly defaultRAGMatchThreshold = Number(
        process.env.DEFAULT_RAG_MATCH_THRESHOLD || "0.85"
    );
    private readonly defaultRAGMatchCount = Number(
        process.env.DEFAULT_RAG_MATCH_COUNT || "5"
    );

    async getKnowledge(params: {
        query: string;
        conversationContext?: string;
        limit?: number;
        agentId?: UUID;
    }): Promise<RAGKnowledgeItem[]> {
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

            const results = await this.searchKnowledge({
                agentId: this.runtime.agentId,
                embedding: embeddingArray,
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

    async createKnowledge(
        item: RAGKnowledgeItem,
        source: string
    ): Promise<void> {
        if (!item.content.text) {
            elizaLogger.warn("Empty content in knowledge item");
            return;
        }

        try {
            const processedContent = this.preprocess(item.content.text);
            await this.chunkEmbedAndPersist(processedContent, item, source);
        } catch (error) {
            elizaLogger.error(`Error processing knowledge ${item.id}:`, error);
            throw error;
        }
    }

    async searchKnowledge(params: {
        agentId: UUID;
        embedding: number[];
        match_threshold?: number;
        match_count?: number;
        searchText?: string;
    }): Promise<RAGKnowledgeItem[]> {
        const { match_count = this.defaultRAGMatchCount, embedding } = params;

        const matches = await this.vectorDB.search({
            namespace: params.agentId.toString(),
            vector: embedding,
            topK: match_count,
            type: "knowledge",
            filter: {
                isChunk: true,
            },
        });

        elizaLogger.debug("Pinecone search results:", matches);

        const ids = matches.map((match) => match.id as UUID);
        const chunks = await this.runtime.databaseAdapter.getKnowledgeByIds({
            ids,
            agentId: params.agentId,
        });

        return chunks;
    }

    async removeKnowledge(id: UUID): Promise<void> {
        await Promise.all([
            this.vectorDB.removeVector(id, this.runtime.agentId.toString()),
            this.runtime.databaseAdapter.removeKnowledge(id),
        ]);
    }

    async clearKnowledge(): Promise<void> {
        await Promise.all([
            this.vectorDB.removeAllVectors(this.runtime.agentId.toString()),
            this.runtime.databaseAdapter.clearKnowledge(this.runtime.agentId),
        ]);
    }

    async processFile(file: {
        path: string;
        content: string;
        type: "pdf" | "md" | "txt";
        isShared?: boolean;
    }): Promise<void> {
        const startTime = Date.now();
        const content = file.content;

        try {
            const fileSizeKB = new TextEncoder().encode(content).length / 1024;
            elizaLogger.info(
                `[File Progress] Starting ${file.path} (${fileSizeKB.toFixed(2)} KB)`
            );

            const item: RAGKnowledgeItem = {
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
            };

            const processedContent = this.preprocess(content);
            await this.chunkEmbedAndPersist(processedContent, item, "file");

            const totalTime = (Date.now() - startTime) / 1000;
            elizaLogger.info(
                `[Complete] Processed ${file.path} in ${totalTime.toFixed(2)}s`
            );
        } catch (error) {
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

                        const existingKnowledge = await this.getKnowledgeById({
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

                    const existingKnowledge = await this.getKnowledgeById({
                        id: knowledgeId,
                        agentId: this.runtime.agentId,
                    });

                    if (existingKnowledge.length > 0) {
                        elizaLogger.info(
                            `Direct knowledge ${knowledgeId} already exists, skipping`
                        );
                        continue;
                    }

                    await this.createKnowledge(
                        {
                            id: knowledgeId,
                            agentId: this.runtime.agentId,
                            content: {
                                text: contentItem,
                                metadata: {
                                    type: "direct",
                                },
                            },
                        },
                        "character"
                    );
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
                let score = result.score;

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

    private getQueryTerms(query: string): string[] {
        return query
            .toLowerCase()
            .split(" ")
            .filter((term) => term.length > 3) // Filter very short words
            .filter((term) => !this.stopWords.has(term)); // Filter stop words
    }

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

    private async chunkEmbedAndPersist(
        processedContent: string,
        item: RAGKnowledgeItem,
        source: string
    ) {
        const chunks = await splitChunks(processedContent, 512, 20);
        const embeddings = await embedMany([processedContent, ...chunks]);

        await Promise.all([
            this.persistVectorData(item, embeddings, source, chunks),
            this.persistRelationalData(item, chunks),
        ]);
    }

    private async persistVectorData(
        item: RAGKnowledgeItem,
        embeddings: number[][],
        source: string,
        chunks: string[]
    ) {
        const metadata = {
            type: "knowledge",
            ...item.content.metadata,
            createdAt: Date.now().toString(),
            source: source,
        };
        await this.vectorDB.upsert({
            namespace: this.runtime.agentId.toString(),
            values: [
                {
                    id: item.id,
                    values: embeddings[0],
                    metadata: {
                        ...metadata,
                        isMain: true,
                        isChunk: false,
                        inputHash: this.vectorDB.hashInput(item.content.text),
                    },
                },
                ...chunks.map((_chunk, index) => ({
                    id: this.buildChunkId(item, index),
                    values: embeddings[index + 1],
                    metadata: {
                        ...metadata,
                        isChunk: true,
                        isMain: false,
                        originalId: item.id,
                        chunkIndex: index,
                        inputHash: this.vectorDB.hashInput(_chunk),
                    },
                })),
            ],
        });
    }

    private async persistRelationalData(
        item: RAGKnowledgeItem,
        chunks: string[]
    ) {
        await Promise.all([
            this.runtime.databaseAdapter.createKnowledge({
                id: item.id,
                agentId: this.runtime.agentId,
                content: {
                    text: item.content.text,
                    metadata: {
                        ...item.content.metadata,
                        isMain: true,
                    },
                },
                createdAt: Date.now(),
            }),
            ...chunks.map((chunk, index) =>
                this.runtime.databaseAdapter.createKnowledge({
                    id: this.buildChunkId(item, index),
                    agentId: this.runtime.agentId,
                    content: {
                        text: chunk,
                        metadata: {
                            ...item.content.metadata,
                            isChunk: true,
                            originalId: item.id,
                            chunkIndex: index,
                        },
                    },
                    createdAt: Date.now(),
                })
            ),
        ]);
    }

    private async getKnowledgeById(params: {
        id?: UUID;
        agentId?: UUID;
    }): Promise<RAGKnowledgeItem[]> {
        return await this.runtime.databaseAdapter.getKnowledgeByIds({
            ids: [params.id],
            agentId: params.agentId,
        });
    }

    private buildChunkId(
        item: RAGKnowledgeItem,
        index: number
    ): `${UUID}-chunk-${number}` {
        return `${item.id}-chunk-${index}`;
    }
}
