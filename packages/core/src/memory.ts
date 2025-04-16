import { embed, getDimentionZeroEmbedding } from "./embedding.ts";
import elizaLogger from "./logger.ts";
import {
    IAgentRuntime,
    IMemoryManager,
    type Memory,
    type UUID,
} from "./types.ts";
import { VectorDB } from "./vectorDB.ts";

type MemoryMetadata = {
    type: string;
    createdAt: string;
    userId: string;
    roomId: string;
    source: string;
    inputHash: string;
};

export class MemoryManager implements IMemoryManager {
    runtime: IAgentRuntime;
    tableName: string;
    vectorDB: VectorDB<MemoryMetadata>;

    constructor(opts: { tableName: string; runtime: IAgentRuntime }) {
        this.runtime = opts.runtime;
        this.tableName = opts.tableName;
        this.vectorDB = new VectorDB<MemoryMetadata>();
    }

    async getMemories({
        roomId,
        count = 10,
        unique = true,
        start,
        end,
    }: {
        roomId: UUID;
        count?: number;
        unique?: boolean;
        start?: number;
        end?: number;
    }): Promise<Memory[]> {
        return await this.runtime.databaseAdapter.getMemories({
            roomId,
            count,
            unique,
            tableName: this.tableName,
            agentId: this.runtime.agentId,
            start,
            end,
        });
    }

    async getCachedEmbeddings(content: string): Promise<number[]> {
        const contentHash = this.vectorDB.hashInput(content);

        const matches = await this.vectorDB.search({
            vector: getDimentionZeroEmbedding(),
            namespace: this.runtime.agentId.toString(),
            topK: 1,
            type: this.tableName,
            filter: {
                inputHash: contentHash,
            },
        });
        if (matches.length > 0) {
            return matches[0].values;
        }

        return null;
    }

    async createMemory(
        memory: Memory,
        source: string,
        unique: boolean,
        isVectorRequired: boolean
    ): Promise<void> {
        const existingMessage = await this.getMemoryById(memory.id);

        if (existingMessage) {
            elizaLogger.error(
                `Memory already exists, skipping, memory: ${memory.id}, content: ${memory.content.text}`
            );
            return;
        }

        elizaLogger.log("Creating Memory", memory.id, memory.content?.text);
        await this.embedAndPersist(memory, source, unique, isVectorRequired);
    }

    async getMemoriesByRoomIds(params: {
        roomIds: UUID[];
        limit?: number;
        userId?: UUID;
    }): Promise<Memory[]> {
        return await this.runtime.databaseAdapter.getMemoriesByRoomIds({
            tableName: this.tableName,
            agentId: this.runtime.agentId,
            roomIds: params.roomIds,
            limit: params.limit,
            userId: params.userId,
        });
    }

    async getMemoryById(id: UUID): Promise<Memory | null> {
        const result = await this.runtime.databaseAdapter.getMemoryById(id);
        if (result && result.agentId !== this.runtime.agentId) return null;
        return result;
    }

    async removeMemory(memoryId: UUID): Promise<void> {
        await Promise.all([
            this.vectorDB.removeVector(
                memoryId,
                this.runtime.agentId.toString()
            ),
            this.runtime.databaseAdapter.removeMemory(memoryId, this.tableName),
        ]);
    }

    async removeAllMemories(roomId: UUID): Promise<void> {
        await Promise.all([
            this.vectorDB.removeByFilter(
                {
                    type: this.tableName,
                    roomId,
                },
                this.runtime.agentId.toString()
            ),
            this.runtime.databaseAdapter.removeAllMemories(
                roomId,
                this.tableName
            ),
        ]);
    }

    async countMemories(roomId: UUID, unique = true): Promise<number> {
        return await this.runtime.databaseAdapter.countMemories(
            roomId,
            unique,
            this.tableName
        );
    }

    private async embedAndPersist(
        memory: Memory,
        source: string,
        unique: boolean,
        isVectorRequired: boolean
    ) {
        await this.runtime.databaseAdapter.createMemory(
            memory,
            this.tableName,
            unique
        );

        if (!memory.content || typeof memory.content.text !== "string") {
            elizaLogger.warn(
                `Invalid memory content for memory ${memory.id}, proceeding without vector storage`
            );
            return;
        }

        if (!isVectorRequired) {
            return;
        }

        if (!memory.content.text.trim()) {
            elizaLogger.debug(
                `Empty content for memory ${memory.id}, skipping vector creation`
            );
            return;
        }

        this.persistVectorData(memory, source, unique);
    }

    private async persistVectorData(
        item: Memory,
        source: string,
        unique: boolean
    ) {
        try {
            const embedding = await embed(
                this.runtime,
                item.content.text,
                unique
            );

            if (!embedding || embedding.length === 0) {
                elizaLogger.warn(
                    `Empty embedding returned for memory ${item.id}, skipping vector storage`
                );
                return;
            }

            await this.vectorDB.upsert({
                namespace: this.runtime.agentId.toString(),
                values: [
                    {
                        id: item.id,
                        values: embedding,
                        metadata: {
                            type: this.tableName,
                            createdAt: Date.now().toString(),
                            userId: item.userId,
                            roomId: item.roomId,
                            source: source,
                            inputHash: this.vectorDB.hashInput(
                                item.content.text
                            ),
                        },
                    },
                ],
            });
        } catch (error) {
            elizaLogger.error(
                `Error creating vector for memory ${item.id}:`,
                error
            );
        }
    }
}
