import { RedisClient } from "@elizaos/adapter-redis";
import {
    CacheManager,
    CacheStore,
    Character,
    DbCacheAdapter,
    elizaLogger,
    FsCacheAdapter,
    IDatabaseCacheAdapter,
} from "@elizaos/core";
import path from "path";

export function initializeCache(
    cacheStore: string,
    character: Character,
    baseDir?: string,
    db?: IDatabaseCacheAdapter
) {
    validateCharacterId(character);

    const cacheInitializers = {
        [CacheStore.REDIS]: () => {
            validateRedisEnvironmentVariable();
            return initializeRedisCache(character);
        },
        [CacheStore.DATABASE]: () => {
            validateDBAdapter(db);
            return initializeDbCache(character, db);
        },
        [CacheStore.FILESYSTEM]: () => {
            validateBaseDir(baseDir);
            return initializeFsCache(baseDir, character);
        },
    };

    const initializer = cacheInitializers[cacheStore];
    if (!initializer) {
        throw new Error(
            `Invalid cache store: ${cacheStore} or required configuration missing.`
        );
    }
    return initializer();
}

function validateCharacterId(character: Character) {
    if (!character?.id) {
        throw new Error(
            "CacheStore requires id to be set in character definition"
        );
    }
}

function validateRedisEnvironmentVariable() {
    if (!process.env.REDIS_URL) {
        throw new Error("REDIS_URL environment variable is not set.");
    }
}

function validateBaseDir(baseDir: string) {
    if (!baseDir) {
        throw new Error("baseDir must be provided for CacheStore.FILESYSTEM.");
    }
}

function validateDBAdapter(db: IDatabaseCacheAdapter) {
    if (!db) {
        throw new Error(
            "Database adapter is not provided for CacheStore.Database."
        );
    }
}

function initializeRedisCache(character: Character) {
    elizaLogger.info("Connecting to Redis...");
    const redisClient = new RedisClient(process.env.REDIS_URL);
    const dbCacheAdapter = new DbCacheAdapter(redisClient, character.id);
    return new CacheManager(dbCacheAdapter);
}

function initializeFsCache(baseDir: string, character: Character) {
    elizaLogger.info("Using File System Cache...");
    const cacheDir = path.resolve(baseDir, character.id, "cache");
    const fsCacheAdapter = new FsCacheAdapter(cacheDir);
    return new CacheManager(fsCacheAdapter);
}

function initializeDbCache(character: Character, db: IDatabaseCacheAdapter) {
    elizaLogger.info("Using Database Cache...");
    const dbCacheAdapter = new DbCacheAdapter(db, character.id);
    return new CacheManager(dbCacheAdapter);
}
