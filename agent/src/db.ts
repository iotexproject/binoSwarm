import { PostgresDatabaseAdapter } from "@elizaos/adapter-postgres";
import {
    elizaLogger,
    IDatabaseAdapter,
    IDatabaseCacheAdapter,
} from "@elizaos/core";
import fs from "fs";
import path from "path";
import { PoolConfig } from "pg";

export async function initializeDatabase(): Promise<
    IDatabaseAdapter & IDatabaseCacheAdapter
> {
    if (!process.env.POSTGRES_URL) {
        throw new Error("POSTGRES_URL is not set");
    }
    return initializePostgres();
}

async function initializePostgres() {
    elizaLogger.info("Initializing PostgreSQL connection...");

    const pgConfig = getPostgresConfig();

    if (process.env.ENFORCE_DB_SSL === "true") {
        enableDBSsl(pgConfig);
    }

    const db = new PostgresDatabaseAdapter(pgConfig);
    await db.init();
    return db;
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
