import { PostgresDatabaseAdapter } from "@elizaos/adapter-postgres";
import { SqliteDatabaseAdapter } from "@elizaos/adapter-sqlite";
import {
    elizaLogger,
    IDatabaseAdapter,
    IDatabaseCacheAdapter,
} from "@elizaos/core";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { PoolConfig } from "pg";

export function initializeDatabase(): IDatabaseAdapter & IDatabaseCacheAdapter {
    return process.env.POSTGRES_URL ? initializePostgres() : initializeSqlite();
}

function initializeSqlite() {
    const dataDir = initDataDir();
    const filePath = getSqlitePath(dataDir);
    elizaLogger.info(`Initializing SQLite database at ${filePath}...`);

    const database = new Database(filePath);
    const sqlitedb = new SqliteDatabaseAdapter(database);
    testConnection(sqlitedb);
    return sqlitedb;
}

function initDataDir() {
    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    return dataDir;
}

function testConnection(sqlitedb: SqliteDatabaseAdapter) {
    sqlitedb
        .init()
        .then(() => {
            elizaLogger.success("Successfully connected to SQLite database");
        })
        .catch((error) => {
            elizaLogger.error("Failed to connect to SQLite:", error);
        });
}

function getSqlitePath(dataDir: string) {
    return process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.sqlite");
}

function initializePostgres() {
    elizaLogger.info("Initializing PostgreSQL connection...");

    const pgConfig = getPostgresConfig();

    if (process.env.ENFORCE_DB_SSL === "true") {
        enableDBSsl(pgConfig);
    }

    return new PostgresDatabaseAdapter(pgConfig);
}

function enableDBSsl(pgConfig: PoolConfig) {
    elizaLogger.info("Enabling SSL for PostgreSQL connection");

    let caPath = resolveCaPath();

    if (caPath && fs.existsSync(caPath)) {
        pgConfig.ssl = {
            rejectUnauthorized: false,
            ca: fs.readFileSync(caPath),
        };
    } else {
        elizaLogger.warn(
            `CA certificate file not found at ${caPath}, SSL will be enabled without a certificate`
        );
        pgConfig.ssl = {
            rejectUnauthorized: false,
        };
    }
}

function resolveCaPath() {
    let caPath = process.env.CA_CERT_NAME;

    if (caPath && !path.isAbsolute(caPath)) {
        caPath = path.resolve(process.cwd(), caPath);
    }
    return caPath;
}

function getPostgresConfig(): PoolConfig {
    const connectionString = process.env.POSTGRES_URL;
    const maxConnections = process.env.POSTGRES_MAX_CONNECTIONS ?? "15";
    return {
        connectionString,
        max: parseInt(maxConnections),
    };
}
