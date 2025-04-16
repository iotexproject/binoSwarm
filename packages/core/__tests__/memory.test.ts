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
            messageManager: {
                getCachedEmbeddings: vi.fn().mockResolvedValue(null),
            },
        } as unknown as IAgentRuntime;

        memoryManager = new MemoryManager({
            tableName: "test_memories",
            runtime: mockRuntime,
        });

        // Mock the embed function
        vi.mock("../src/embedding.ts", () => ({
            embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
            getDimentionZeroEmbedding: vi.fn().mockReturnValue([0, 0, 0]),
        }));

        // Mock VectorDB methods
        memoryManager.vectorDB.upsert = vi.fn().mockResolvedValue(undefined);
        memoryManager.vectorDB.hashInput = vi.fn().mockReturnValue("test-hash");
    });

    afterEach(() => {
        process.env.PINECONE_API_KEY = originalPineconeApiKey;
        vi.clearAllMocks();
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

    describe("createMemory", () => {
        it("should skip creation if memory already exists", async () => {
            // Setup
            const existingMemory = {
                id: "memory-123" as UUID,
                agentId: "test-agent-id" as UUID,
                content: { text: "Existing memory" },
            };
            mockDatabaseAdapter.getMemoryById.mockResolvedValue(existingMemory);

            // Execute
            await memoryManager.createMemory(
                existingMemory as Memory,
                "test",
                false,
                true
            );

            // Assert
            expect(mockDatabaseAdapter.createMemory).not.toHaveBeenCalled();
            expect(memoryManager.vectorDB.upsert).not.toHaveBeenCalled();
        });

        it("should create memory without vector when isVectorRequired is false", async () => {
            // Setup
            const memory = {
                id: "memory-123" as UUID,
                agentId: "test-agent-id" as UUID,
                content: { text: "Test memory" },
                userId: "user-123" as UUID,
                roomId: "room-123" as UUID,
            };
            mockDatabaseAdapter.getMemoryById.mockResolvedValue(null);

            // Execute
            await memoryManager.createMemory(
                memory as Memory,
                "test",
                false,
                false
            );

            // Assert
            expect(mockDatabaseAdapter.createMemory).toHaveBeenCalledWith(
                memory,
                "test_memories",
                false
            );
            expect(memoryManager.vectorDB.upsert).not.toHaveBeenCalled();
        });

        it("should create memory with vector when isVectorRequired is true", async () => {
            // Setup
            const memory = {
                id: "memory-123" as UUID,
                agentId: "test-agent-id" as UUID,
                content: { text: "Test memory" },
                userId: "user-123" as UUID,
                roomId: "room-123" as UUID,
            };
            mockDatabaseAdapter.getMemoryById.mockResolvedValue(null);

            // Execute
            await memoryManager.createMemory(
                memory as Memory,
                "test",
                false,
                true
            );

            // Wait for the async persistVectorData to complete
            await new Promise(process.nextTick);

            // Assert
            expect(mockDatabaseAdapter.createMemory).toHaveBeenCalledWith(
                memory,
                "test_memories",
                false
            );

            expect(memoryManager.vectorDB.upsert).toHaveBeenCalled();
            expect(memoryManager.vectorDB.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    namespace: "test-agent-id",
                    values: [
                        expect.objectContaining({
                            id: "memory-123",
                            metadata: expect.objectContaining({
                                type: "test_memories",
                                userId: "user-123",
                                roomId: "room-123",
                                source: "test",
                                inputHash: "test-hash",
                            }),
                        }),
                    ],
                })
            );
        });

        it("should handle zero dimension embedding", async () => {
            // Setup
            const memory = {
                id: "memory-empty" as UUID,
                agentId: "test-agent-id" as UUID,
                content: { text: "Problem content" },
                userId: "user-123" as UUID,
                roomId: "room-123" as UUID,
            };
            mockDatabaseAdapter.getMemoryById.mockResolvedValue(null);

            // Mock to simulate the embedding function returning empty array
            const { embed } = await import("../src/embedding.ts");
            (embed as any).mockResolvedValueOnce([]);

            // Execute
            await memoryManager.createMemory(
                memory as Memory,
                "test",
                false,
                true
            );

            // Wait for the async persistVectorData to complete
            await new Promise(process.nextTick);
            expect(mockDatabaseAdapter.createMemory).toHaveBeenCalled();
            // The vector should not be created due to empty embedding
            expect(memoryManager.vectorDB.upsert).not.toHaveBeenCalled();
        });

        it("should handle invalid content appropriately", async () => {
            // Setup
            const memory = {
                id: "memory-invalid" as UUID,
                agentId: "test-agent-id" as UUID,
                content: { text: "   " }, // Just whitespace
                userId: "user-123" as UUID,
                roomId: "room-123" as UUID,
            };
            mockDatabaseAdapter.getMemoryById.mockResolvedValue(null);

            // Execute
            await memoryManager.createMemory(
                memory as Memory,
                "test",
                false,
                true
            );

            // Wait for the async persistVectorData to complete
            await new Promise(process.nextTick);

            // Current behavior: it will try to create a vector, which could fail
            // Ideal behavior: it should validate and skip vector creation for empty text
            expect(mockDatabaseAdapter.createMemory).toHaveBeenCalled();
        });

        it("should handle Pinecone dimension mismatch error", async () => {
            // Setup
            const memory = {
                id: "memory-error" as UUID,
                agentId: "test-agent-id" as UUID,
                content: { text: "This will cause an error" },
                userId: "user-123" as UUID,
                roomId: "room-123" as UUID,
            };
            mockDatabaseAdapter.getMemoryById.mockResolvedValue(null);

            // Force upsert to throw a dimension error
            memoryManager.vectorDB.upsert = vi.fn().mockRejectedValueOnce({
                name: "PineconeBadRequestError",
                message:
                    "Vector dimension 0 does not match the dimension of the index 3072",
            });

            await expect(
                memoryManager.createMemory(
                    memory as Memory,
                    "test",
                    false,
                    true
                )
            ).resolves.not.toThrow();

            // Wait for the async persistVectorData to complete
            await new Promise(process.nextTick);

            // Assert
            expect(mockDatabaseAdapter.createMemory).toHaveBeenCalled();
            expect(memoryManager.vectorDB.upsert).toHaveBeenCalled();
        });

        it("should handle missing content object", async () => {
            // Setup
            const memory = {
                id: "memory-missing-content" as UUID,
                agentId: "test-agent-id" as UUID,
                // Intentionally missing content object
                userId: "user-123" as UUID,
                roomId: "room-123" as UUID,
            } as unknown as Memory;

            mockDatabaseAdapter.getMemoryById.mockResolvedValue(null);

            // Execute
            await memoryManager.createMemory(memory, "test", false, true);

            // In current implementation, this will cause a runtime error when accessing content.text
            // Ideal behavior: validate content exists before trying to access its properties

            // Assert
            expect(mockDatabaseAdapter.createMemory).toHaveBeenCalled();

            // Wait for the async persistVectorData to complete
            await new Promise(process.nextTick);
        });
    });
});
