import { readFile } from "fs/promises";
import { join } from "path";
import { ScoredPineconeRecord } from "@pinecone-database/pinecone";

import { splitChunks } from "./generation.ts";
import elizaLogger from "./logger.ts";
import {
    IAgentRuntime,
    IRAGKnowledgeManager,
    RAGKnowledgeItem,
    UUID,
} from "./types.ts";
import { stringToUuid } from "./uuid.ts";
import { embed, embedMany, getDimentionZeroEmbedding } from "./embedding.ts";
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

const KNOWLEDGE_METADATA_TYPE = "knowledge";

export class RAGKnowledgeManager implements IRAGKnowledgeManager {
    runtime: IAgentRuntime;
    vectorDB: VectorDB<RAGKnowledgeItemMetadata>;

    private readonly defaultRAGMatchThreshold = Number(
        process.env.DEFAULT_RAG_MATCH_THRESHOLD || "0.85"
    );
    private readonly defaultRAGMatchCount = Number(
        process.env.DEFAULT_RAG_MATCH_COUNT || "5"
    );
    private readonly chunkSize = Number(process.env.RAG_CHUNK_SIZE || "512");
    private readonly chunkOverlap = Number(
        process.env.RAG_CHUNK_OVERLAP || "20"
    );

    constructor(opts: { runtime: IAgentRuntime }) {
        this.runtime = opts.runtime;
        this.vectorDB = new VectorDB<RAGKnowledgeItemMetadata>();
    }

    async getKnowledge(params: {
        query: string;
        conversationContext?: string;
        limit?: number;
        agentId?: UUID;
        isUnique?: boolean;
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

            const embeddingArray = await embed(
                this.runtime,
                searchText,
                params.isUnique
            );
            const results = await this.searchKnowledge({
                agentId: this.runtime.agentId,
                embedding: embeddingArray,
                match_threshold: this.defaultRAGMatchThreshold,
                match_count: (params.limit || this.defaultRAGMatchCount) * 2,
                searchText: processedQuery,
            });

            return results;
        } catch (error) {
            elizaLogger.error(`[RAG Search Error] ${error}`);
            return [];
        }
    }

    async createKnowledge(
        item: RAGKnowledgeItem,
        source: string,
        isUnique: boolean
    ): Promise<void> {
        if (!item.content.text) {
            elizaLogger.warn("Empty content in knowledge item");
            return;
        }

        const existingKnowledge = await this.checkExistingKnowledge(item);
        if (existingKnowledge) {
            elizaLogger.debug("Knowledge already exists", existingKnowledge);
            return;
        }
        try {
            const processedContent = this.preprocess(item.content.text);
            await this.chunkEmbedAndPersist(
                processedContent,
                item,
                source,
                isUnique
            );
        } catch (error) {
            elizaLogger.error(`Error processing knowledge ${item.id}:`, error);
            throw error;
        }
    }

    async getKnowledgeByContentHash(
        inputHash: string
    ): Promise<RAGKnowledgeItemMetadata | null> {
        const matches = await this.vectorDB.search({
            namespace: this.runtime.agentId.toString(),
            vector: getDimentionZeroEmbedding(),
            topK: 1,
            type: KNOWLEDGE_METADATA_TYPE,
            filter: {
                inputHash,
            },
        });

        if (matches.length > 0) {
            elizaLogger.debug("Knowledge match found", matches[0].metadata);
            return matches[0].metadata;
        }

        return null;
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
            type: KNOWLEDGE_METADATA_TYPE,
            filter: {},
        });

        elizaLogger.debug("Pinecone search results:", matches);

        const filteredMatches = matches.filter(
            (m) => m.score >= this.defaultRAGMatchThreshold
        );

        // Filter out duplicates based on inputHash
        // Keep the match with highest score when duplicates are found
        const uniqueMatches = this.filterDuplicatesByInputHash(filteredMatches);

        const ids = uniqueMatches.map((match) => match.id as UUID);

        const chunks = await this.runtime.databaseAdapter.getKnowledgeByIds({
            ids,
            agentId: params.agentId,
        });

        elizaLogger.debug(
            `Retrieved ${chunks.length} knowledge items from database`
        );

        // Truncate main knowledge items that are too long
        const truncatedChunks = chunks.map((chunk) => {
            const isMain = chunk.content.metadata?.isMain === true;
            if (isMain && chunk.content.text.length > this.chunkSize) {
                return this.truncateMainKnowledge(chunk);
            }
            return chunk;
        });

        return truncatedChunks;
    }

    private filterDuplicatesByInputHash(
        matches: ScoredPineconeRecord<RAGKnowledgeItemMetadata>[]
    ): ScoredPineconeRecord<RAGKnowledgeItemMetadata>[] {
        const hashMap = new Map<
            string,
            ScoredPineconeRecord<RAGKnowledgeItemMetadata>
        >();

        // First pass: find highest score for each inputHash
        for (const match of matches) {
            const inputHash = match.metadata?.inputHash;
            if (inputHash) {
                if (
                    !hashMap.has(inputHash) ||
                    match.score > hashMap.get(inputHash)!.score
                ) {
                    hashMap.set(inputHash, match);
                }
            } else {
                // If no inputHash, keep the match
                hashMap.set(match.id, match);
            }
        }

        // Check if we filtered any duplicates
        if (hashMap.size < matches.length) {
            elizaLogger.debug(
                `Filtered out ${matches.length - hashMap.size} duplicate matches by inputHash`
            );
        }

        return Array.from(hashMap.values());
    }

    async removeKnowledge(id: UUID): Promise<void> {
        await Promise.all([
            this.vectorDB.removeVector(id, this.runtime.agentId.toString()),
            this.runtime.databaseAdapter.removeKnowledge(id),
        ]);
    }

    async clearKnowledge(): Promise<void> {
        await Promise.all([
            this.vectorDB.removeByFilter(
                {
                    type: KNOWLEDGE_METADATA_TYPE,
                },
                this.runtime.agentId.toString()
            ),
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

            const existingKnowledge = await this.checkExistingKnowledge(item);
            if (existingKnowledge) {
                elizaLogger.debug(
                    "Knowledge already exists",
                    existingKnowledge
                );
                return;
            }
            const processedContent = this.preprocess(content);
            await this.chunkEmbedAndPersist(
                processedContent,
                item,
                "file",
                false
            );

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

                    await this.createKnowledge(
                        {
                            id: knowledgeId,
                            agentId: this.runtime.agentId,
                            content: {
                                text: contentItem,
                                metadata: {
                                    type: KNOWLEDGE_METADATA_TYPE,
                                },
                            },
                        },
                        "character",
                        false
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

    private async checkExistingKnowledge(
        item: RAGKnowledgeItem
    ): Promise<boolean> {
        const contentHash = this.vectorDB.hashInput(item.content.text);
        const res = await this.getKnowledgeByContentHash(contentHash);
        return res !== null;
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

    private async chunkEmbedAndPersist(
        processedContent: string,
        item: RAGKnowledgeItem,
        source: string,
        isUnique: boolean
    ) {
        const chunks = await splitChunks(
            processedContent,
            this.chunkSize,
            this.chunkOverlap
        );

        if (chunks.length === 0) {
            // No chunks created, just embed the main content
            elizaLogger.debug("No chunks created, only embedding main item");
            const embedding = await embed(
                this.runtime,
                processedContent,
                isUnique
            );
            await Promise.all([
                this.persistVectorData(item, [embedding], source, []),
                this.persistRelationalData(item, []),
            ]);
            return;
        }

        // For both single chunk and multiple chunks case, we follow the same pattern
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
            type: KNOWLEDGE_METADATA_TYPE,
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
                ...chunks.map((_chunk, index) => {
                    const chunkId = this.buildChunkId(item, index);
                    return {
                        id: chunkId,
                        values: embeddings[index + 1],
                        metadata: {
                            ...metadata,
                            isChunk: true,
                            isMain: false,
                            originalId: item.id,
                            chunkIndex: index,
                            inputHash: this.vectorDB.hashInput(_chunk),
                        },
                    };
                }),
            ],
        });
    }

    private async persistRelationalData(
        item: RAGKnowledgeItem,
        chunks: string[]
    ) {
        // First create the main knowledge item
        await this.runtime.databaseAdapter.createKnowledge({
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
        });

        // Then create each chunk after the main item exists
        if (chunks.length > 0) {
            // Now that the main item is created, we can safely create all chunks
            await Promise.all(
                chunks.map((chunk, index) => {
                    const chunkId = this.buildChunkId(item, index);
                    return this.runtime.databaseAdapter.createKnowledge({
                        id: chunkId,
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
                    });
                })
            );
        }
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

    private buildChunkId(item: RAGKnowledgeItem, index: number): UUID {
        // Create a deterministic UUID based on the original ID and chunk index
        // This ensures we get a valid UUID for the database while maintaining uniqueness
        return stringToUuid(`${item.id}-chunk-${index}`);
    }

    /**
     * Truncates main knowledge items to the standard chunk size
     * This prevents huge documents from overwhelming the context
     */
    private truncateMainKnowledge(item: RAGKnowledgeItem): RAGKnowledgeItem {
        if (item.content.text.length <= this.chunkSize) {
            return item;
        }

        const truncatedText = item.content.text.substring(0, this.chunkSize);
        elizaLogger.debug(
            `Truncated main knowledge item from ${item.content.text.length} to ${truncatedText.length} characters`
        );

        return {
            ...item,
            content: {
                ...item.content,
                text: truncatedText,
                metadata: {
                    ...item.content.metadata,
                    isTruncated: true,
                    originalLength: item.content.text.length,
                },
            },
        };
    }
}
