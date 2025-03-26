import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initializeCache } from "../src/cache";
import {
    CacheStore,
    Character,
    CacheManager,
    DbCacheAdapter,
    elizaLogger,
    IDatabaseCacheAdapter,
} from "@elizaos/core";
import { RedisClient } from "@elizaos/adapter-redis";

// Mocks
vi.mock("@elizaos/core", () => ({
    CacheManager: vi.fn(),
    DbCacheAdapter: vi.fn(),
    FsCacheAdapter: vi.fn(),
    elizaLogger: {
        info: vi.fn(),
    },
    CacheStore: {
        REDIS: "REDIS",
        DATABASE: "DATABASE",
    },
}));

vi.mock("@elizaos/adapter-redis", () => ({
    RedisClient: vi.fn(),
}));

describe("initializeCache", () => {
    // @ts-expect-error: Mocking Character
    const mockCharacter = { id: "test-character-id" } as Character;
    const mockDbAdapter = {} as IDatabaseCacheAdapter;
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetAllMocks();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe("Redis cache initialization", () => {
        it("should initialize Redis cache when Redis store is specified", () => {
            // Setup
            process.env.REDIS_URL = "redis://localhost:6379";
            const mockRedisClient = {};
            const mockDbAdapter = {};

            vi.mocked(RedisClient).mockReturnValue(mockRedisClient as any);
            vi.mocked(DbCacheAdapter).mockReturnValue(mockDbAdapter as any);
            vi.mocked(CacheManager).mockReturnValue({} as any);

            // Execute
            const result = initializeCache(CacheStore.REDIS, mockCharacter);

            // Verify
            expect(RedisClient).toHaveBeenCalledWith("redis://localhost:6379");
            expect(DbCacheAdapter).toHaveBeenCalledWith(
                mockRedisClient,
                mockCharacter.id
            );
            expect(CacheManager).toHaveBeenCalledWith(mockDbAdapter);
            expect(elizaLogger.info).toHaveBeenCalledWith(
                "Connecting to Redis..."
            );
            expect(result).toBeDefined();
        });

        it("should throw error when Redis URL is not provided", () => {
            // Setup
            process.env.REDIS_URL = undefined;

            // Execute & Verify
            expect(() =>
                initializeCache(CacheStore.REDIS, mockCharacter)
            ).toThrow("REDIS_URL environment variable is not set.");
        });
    });

    describe("FileSystem cache initialization", () => {
        it("should throw error when baseDir is not provided for FileSystem store", () => {
            // Execute & Verify
            expect(() =>
                initializeCache(CacheStore.FILESYSTEM, mockCharacter)
            ).toThrow("baseDir must be provided for CacheStore.FILESYSTEM.");
        });
    });

    describe("Database cache initialization", () => {
        it("should initialize Database cache when Database store is specified", () => {
            // Setup
            const mockDbCacheAdapter = {};

            vi.mocked(DbCacheAdapter).mockReturnValue(
                mockDbCacheAdapter as any
            );
            vi.mocked(CacheManager).mockReturnValue({} as any);

            // Execute
            const result = initializeCache(
                CacheStore.DATABASE,
                mockCharacter,
                undefined,
                mockDbAdapter
            );

            // Verify
            expect(DbCacheAdapter).toHaveBeenCalledWith(
                mockDbAdapter,
                mockCharacter.id
            );
            expect(CacheManager).toHaveBeenCalledWith(mockDbCacheAdapter);
            expect(elizaLogger.info).toHaveBeenCalledWith(
                "Using Database Cache..."
            );
            expect(result).toBeDefined();
        });

        it("should throw error when db adapter is not provided for Database store", () => {
            // Execute & Verify
            expect(() =>
                initializeCache(CacheStore.DATABASE, mockCharacter)
            ).toThrow(
                "Database adapter is not provided for CacheStore.Database."
            );
        });
    });

    describe("Invalid cache store", () => {
        it("should throw error for invalid cache store", () => {
            // Execute & Verify
            expect(() =>
                initializeCache("INVALID_STORE" as any, mockCharacter)
            ).toThrow(
                /Invalid cache store: INVALID_STORE or required configuration missing./
            );
        });
    });

    describe("Character validation", () => {
        it("should throw error when character id is not set", () => {
            // Setup
            const invalidCharacter = {} as Character;

            // Execute & Verify
            expect(() =>
                initializeCache(CacheStore.REDIS, invalidCharacter)
            ).toThrow(
                "CacheStore requires id to be set in character definition"
            );
        });
    });
});
