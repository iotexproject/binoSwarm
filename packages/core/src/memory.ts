import { getDimentionZeroEmbedding } from "./embedding.ts";
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
        if (!content) {
            return null;
        }

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

    async createMemory({
        memory,
        isUnique,
    }: {
        memory: Memory;
        isUnique: boolean;
    }): Promise<void> {
        const existingMessage = await this.getMemoryById(memory.id);

        if (existingMessage) {
            elizaLogger.warn(
                `Memory already exists, skipping, memory: ${memory.id}, content: ${memory.content.text}`
            );
            return;
        }

        elizaLogger.log("Creating Memory", memory.id, memory.content?.text);
        await this.runtime.databaseAdapter.createMemory(
            memory,
            this.tableName,
            isUnique
        );
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

    async countMemoriesForUser(userId: UUID): Promise<number> {
        return await this.runtime.databaseAdapter.countMemoriesForUser({
            userId,
            agentId: this.runtime.agentId,
            tableName: this.tableName,
        });
    }
}
