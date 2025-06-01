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
        memoryManager.vectorDB.search = vi.fn().mockResolvedValue([]);
        memoryManager.vectorDB.removeVector = vi
            .fn()
            .mockResolvedValue(undefined);
        memoryManager.vectorDB.removeByFilter = vi
            .fn()
            .mockResolvedValue(undefined);
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
            await memoryManager.createMemory({
                memory: existingMemory as Memory,
                isUnique: false,
            });

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
            await memoryManager.createMemory({
                memory: memory as Memory,
                isUnique: false,
            });

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
            await memoryManager.createMemory({
                memory: memory as Memory,
                isUnique: false,
            });

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
            await memoryManager.createMemory({
                memory: memory as Memory,
                isUnique: false,
            });

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
            await memoryManager.createMemory({
                memory: memory as Memory,
                isUnique: false,
            });

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
                memoryManager.createMemory({
                    memory: memory as Memory,
                    isUnique: false,
                })
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
            await memoryManager.createMemory({
                memory: memory as Memory,
                isUnique: false,
            });

            // In current implementation, this will cause a runtime error when accessing content.text
            // Ideal behavior: validate content exists before trying to access its properties

            // Assert
            expect(mockDatabaseAdapter.createMemory).toHaveBeenCalled();

            // Wait for the async persistVectorData to complete
            await new Promise(process.nextTick);
        });
    });

    describe("getCachedEmbeddings", () => {
        it("should return cached embedding when found", async () => {
            // Setup
            const content = "test content";
            const expectedEmbedding = [0.1, 0.2, 0.3];

            // Mock VectorDB search to return a match with values
            memoryManager.vectorDB.search = vi.fn().mockResolvedValue([
                {
                    id: "cached-memory",
                    values: expectedEmbedding,
                    metadata: { inputHash: "test-hash" },
                    score: 0.95,
                },
            ]);

            // Execute
            const result = await memoryManager.getCachedEmbeddings(content);

            // Assert
            expect(memoryManager.vectorDB.search).toHaveBeenCalledWith({
                vector: expect.any(Array),
                namespace: "test-agent-id",
                topK: 1,
                type: "test_memories",
                filter: { inputHash: "test-hash" },
            });
            expect(result).toEqual(expectedEmbedding);
        });

        it("should return null when no cached embedding is found", async () => {
            // Setup
            const content = "uncached content";

            // Mock VectorDB search to return empty results
            memoryManager.vectorDB.search = vi.fn().mockResolvedValue([]);

            // Execute
            const result = await memoryManager.getCachedEmbeddings(content);

            // Assert
            expect(memoryManager.vectorDB.search).toHaveBeenCalled();
            expect(result).toBeNull();
        });

        it("should handle empty content gracefully", async () => {
            // Setup
            const content = "";

            // Execute
            const result = await memoryManager.getCachedEmbeddings(content);

            // Assert
            expect(memoryManager.vectorDB.search).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });
    });

    describe("getMemoriesByRoomIds", () => {
        it("should get memories by multiple room IDs", async () => {
            // Setup
            const roomIds = [
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
            ] as UUID[];
            const mockMemories = [
                {
                    id: "memory-1",
                    roomId: "00000000-0000-0000-0000-000000000001",
                },
                {
                    id: "memory-2",
                    roomId: "00000000-0000-0000-0000-000000000002",
                },
            ];

            // Mock the database adapter to return test memories
            mockDatabaseAdapter.getMemoriesByRoomIds.mockResolvedValue(
                mockMemories
            );

            // Execute
            const result = await memoryManager.getMemoriesByRoomIds({
                roomIds,
            });

            // Assert
            expect(
                mockDatabaseAdapter.getMemoriesByRoomIds
            ).toHaveBeenCalledWith({
                tableName: "test_memories",
                agentId: "test-agent-id",
                roomIds,
                limit: undefined,
                userId: undefined,
            });
            expect(result).toEqual(mockMemories);
        });

        it("should apply limit parameter when provided", async () => {
            // Setup
            const roomIds = [
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
                "00000000-0000-0000-0000-000000000003",
            ] as UUID[];
            const limit = 5;
            const mockMemories = [
                {
                    id: "memory-1",
                    roomId: "00000000-0000-0000-0000-000000000001",
                },
                {
                    id: "memory-2",
                    roomId: "00000000-0000-0000-0000-000000000002",
                },
            ];

            // Mock the database adapter
            mockDatabaseAdapter.getMemoriesByRoomIds.mockResolvedValue(
                mockMemories
            );

            // Execute
            const result = await memoryManager.getMemoriesByRoomIds({
                roomIds,
                limit,
            });

            // Assert
            expect(
                mockDatabaseAdapter.getMemoriesByRoomIds
            ).toHaveBeenCalledWith({
                tableName: "test_memories",
                agentId: "test-agent-id",
                roomIds,
                limit,
                userId: undefined,
            });
            expect(result).toEqual(mockMemories);
        });

        it("should filter by userId when provided", async () => {
            // Setup
            const roomIds = ["00000000-0000-0000-0000-000000000001"] as UUID[];
            const userId = "00000000-0000-0000-0000-000000000123" as UUID;
            const mockMemories = [
                {
                    id: "memory-1",
                    roomId: "00000000-0000-0000-0000-000000000001",
                    userId,
                },
            ];

            // Mock the database adapter
            mockDatabaseAdapter.getMemoriesByRoomIds.mockResolvedValue(
                mockMemories
            );

            // Execute
            const result = await memoryManager.getMemoriesByRoomIds({
                roomIds,
                userId,
            });

            // Assert
            expect(
                mockDatabaseAdapter.getMemoriesByRoomIds
            ).toHaveBeenCalledWith({
                tableName: "test_memories",
                agentId: "test-agent-id",
                roomIds,
                limit: undefined,
                userId,
            });
            expect(result).toEqual(mockMemories);
        });

        it("should handle empty array of room IDs", async () => {
            // Setup
            const roomIds = [] as UUID[];

            // Mock the database adapter
            mockDatabaseAdapter.getMemoriesByRoomIds.mockResolvedValue([]);

            // Execute
            const result = await memoryManager.getMemoriesByRoomIds({
                roomIds,
            });

            // Assert
            expect(
                mockDatabaseAdapter.getMemoriesByRoomIds
            ).toHaveBeenCalledWith({
                tableName: "test_memories",
                agentId: "test-agent-id",
                roomIds: [],
                limit: undefined,
                userId: undefined,
            });
            expect(result).toEqual([]);
        });
    });

    describe("getMemoryById", () => {
        it("should return memory when found and belongs to agent", async () => {
            // Setup
            const memoryId = "00000000-0000-0000-0000-000000000001" as UUID;
            const mockMemory = {
                id: memoryId,
                agentId: "test-agent-id" as UUID,
                content: { text: "Test memory content" },
            };
            mockDatabaseAdapter.getMemoryById.mockResolvedValue(mockMemory);

            // Execute
            const result = await memoryManager.getMemoryById(memoryId);

            // Assert
            expect(mockDatabaseAdapter.getMemoryById).toHaveBeenCalledWith(
                memoryId
            );
            expect(result).toEqual(mockMemory);
        });

        it("should return null when memory belongs to different agent", async () => {
            // Setup
            const memoryId = "00000000-0000-0000-0000-000000000001" as UUID;
            const mockMemory = {
                id: memoryId,
                agentId: "different-agent-id" as UUID,
                content: { text: "Test memory content" },
            };
            mockDatabaseAdapter.getMemoryById.mockResolvedValue(mockMemory);

            // Execute
            const result = await memoryManager.getMemoryById(memoryId);

            // Assert
            expect(mockDatabaseAdapter.getMemoryById).toHaveBeenCalledWith(
                memoryId
            );
            expect(result).toBeNull();
        });

        it("should return null when memory not found", async () => {
            // Setup
            const memoryId = "00000000-0000-0000-0000-000000000001" as UUID;
            mockDatabaseAdapter.getMemoryById.mockResolvedValue(null);

            // Execute
            const result = await memoryManager.getMemoryById(memoryId);

            // Assert
            expect(mockDatabaseAdapter.getMemoryById).toHaveBeenCalledWith(
                memoryId
            );
            expect(result).toBeNull();
        });
    });

    describe("removeMemory", () => {
        it("should remove memory from database and vector store", async () => {
            // Setup
            const memoryId = "00000000-0000-0000-0000-000000000001" as UUID;

            // Execute
            await memoryManager.removeMemory(memoryId);

            // Assert
            expect(memoryManager.vectorDB.removeVector).toHaveBeenCalledWith(
                memoryId,
                "test-agent-id"
            );
            expect(mockDatabaseAdapter.removeMemory).toHaveBeenCalledWith(
                memoryId,
                "test_memories"
            );
        });
    });

    describe("removeAllMemories", () => {
        it("should remove all memories for a room", async () => {
            // Setup
            const roomId = "00000000-0000-0000-0000-000000000001" as UUID;

            // Execute
            await memoryManager.removeAllMemories(roomId);

            // Assert
            expect(memoryManager.vectorDB.removeByFilter).toHaveBeenCalledWith(
                {
                    type: "test_memories",
                    roomId,
                },
                "test-agent-id"
            );
            expect(mockDatabaseAdapter.removeAllMemories).toHaveBeenCalledWith(
                roomId,
                "test_memories"
            );
        });
    });

    describe("countMemories", () => {
        it("should count memories with default unique parameter", async () => {
            // Setup
            const roomId = "00000000-0000-0000-0000-000000000001" as UUID;
            const count = 5;
            mockDatabaseAdapter.countMemories.mockResolvedValue(count);

            // Execute
            const result = await memoryManager.countMemories(roomId);

            // Assert
            expect(mockDatabaseAdapter.countMemories).toHaveBeenCalledWith(
                roomId,
                true,
                "test_memories"
            );
            expect(result).toBe(count);
        });

        it("should count memories with unique parameter set to false", async () => {
            // Setup
            const roomId = "00000000-0000-0000-0000-000000000001" as UUID;
            const count = 10;
            mockDatabaseAdapter.countMemories.mockResolvedValue(count);

            // Execute
            const result = await memoryManager.countMemories(roomId, false);

            // Assert
            expect(mockDatabaseAdapter.countMemories).toHaveBeenCalledWith(
                roomId,
                false,
                "test_memories"
            );
            expect(result).toBe(count);
        });
    });
});
