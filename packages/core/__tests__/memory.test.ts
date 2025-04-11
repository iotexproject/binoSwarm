import { MemoryManager } from "../src/memory";
import { CacheManager, MemoryCacheAdapter } from "../src/cache";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { IAgentRuntime, Memory, UUID } from "../src/types";

describe("MemoryManager", () => {
    let memoryManager: MemoryManager;
    let mockDatabaseAdapter: any;
    let mockRuntime: IAgentRuntime;
    let originalPineconeApiKey: string | undefined;
    beforeEach(() => {
        originalPineconeApiKey = process.env.PINECONE_API_KEY;
        process.env.PINECONE_API_KEY = "test-pinecone-api-key";
        mockDatabaseAdapter = {
            getMemories: vi.fn(),
            createMemory: vi.fn(),
            removeMemory: vi.fn(),
            removeAllMemories: vi.fn(),
            countMemories: vi.fn(),
            getCachedEmbeddings: vi.fn(),
            searchMemories: vi.fn(),
            getMemoriesByRoomIds: vi.fn(),
            getMemoryById: vi.fn(),
        };

        mockRuntime = {
            databaseAdapter: mockDatabaseAdapter,
            cacheManager: new CacheManager(new MemoryCacheAdapter()),
            agentId: "test-agent-id" as UUID,
        } as unknown as IAgentRuntime;

        memoryManager = new MemoryManager({
            tableName: "test_memories",
            runtime: mockRuntime,
        });
    });

    afterEach(() => {
        process.env.PINECONE_API_KEY = originalPineconeApiKey;
    });

    describe("getMemories", () => {
        it("should handle pagination parameters", async () => {
            const roomId = "test-room" as UUID;
            const start = 0;
            const end = 5;

            await memoryManager.getMemories({ roomId, start, end });

            expect(mockDatabaseAdapter.getMemories).toHaveBeenCalledWith({
                roomId,
                count: 10,
                unique: true,
                tableName: "test_memories",
                agentId: "test-agent-id",
                start: 0,
                end: 5,
            });
        });
    });
});
