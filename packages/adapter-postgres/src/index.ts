import { v4 } from "uuid";

// Import the entire module as default
import pg, { PoolClient, PoolConfig } from "pg";
type Pool = pg.Pool;

import {
    Account,
    Actor,
    DatabaseAdapter,
    GoalStatus,
    Participant,
    RAGKnowledgeItem,
    elizaLogger,
    type Goal,
    type IDatabaseCacheAdapter,
    type Memory,
    type Relationship,
    type UUID,
    type CharacterDBTraits,
} from "@elizaos/core";
import fs from "fs";
import path from "path";
import {
    QueryConfig,
    QueryConfigValues,
    QueryResult,
    QueryResultRow,
} from "pg";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

export class PostgresDatabaseAdapter
    extends DatabaseAdapter<Pool>
    implements IDatabaseCacheAdapter
{
    private pool: Pool;
    private readonly maxRetries: number = 3;
    private readonly baseDelay: number = 1000; // 1 second
    private readonly maxDelay: number = 10000; // 10 seconds
    private readonly jitterMax: number = 1000; // 1 second
    private readonly connectionTimeout: number = 5000; // 5 seconds

    constructor(connectionConfig: PoolConfig) {
        super({
            //circuitbreaker stuff
            failureThreshold: 5,
            resetTimeout: 60000,
            halfOpenMaxAttempts: 3,
        });

        const defaultConfig = {
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: this.connectionTimeout,
        };

        this.pool = new pg.Pool({
            ...defaultConfig,
            ...connectionConfig, // Allow overriding defaults
        });

        this.pool.on("error", (err) => {
            elizaLogger.error("Unexpected pool error", err);
            this.handlePoolError(err);
        });

        this.setupPoolErrorHandling();
        this.testConnection();
    }

    private setupPoolErrorHandling() {
        process.on("SIGINT", async () => {
            await this.cleanup();
            process.exit(0);
        });

        process.on("SIGTERM", async () => {
            await this.cleanup();
            process.exit(0);
        });

        process.on("beforeExit", async () => {
            await this.cleanup();
        });
    }

    private async withDatabase<T>(
        operation: () => Promise<T>,
        context: string
    ): Promise<T> {
        return this.withCircuitBreaker(async () => {
            return this.withRetry(operation);
        }, context);
    }

    private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
        let lastError: Error = new Error("Unknown error"); // Initialize with default

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;

                if (attempt < this.maxRetries) {
                    // Calculate delay with exponential backoff
                    const backoffDelay = Math.min(
                        this.baseDelay * Math.pow(2, attempt - 1),
                        this.maxDelay
                    );

                    // Add jitter to prevent thundering herd
                    const jitter = Math.random() * this.jitterMax;
                    const delay = backoffDelay + jitter;

                    elizaLogger.warn(
                        `Database operation failed (attempt ${attempt}/${this.maxRetries}):`,
                        {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                            nextRetryIn: `${(delay / 1000).toFixed(1)}s`,
                        }
                    );

                    await new Promise((resolve) => setTimeout(resolve, delay));
                } else {
                    elizaLogger.error("Max retry attempts reached:", {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        totalAttempts: attempt,
                    });
                    throw error instanceof Error
                        ? error
                        : new Error(String(error));
                }
            }
        }

        throw lastError;
    }

    private async handlePoolError(error: Error) {
        elizaLogger.error("Pool error occurred, attempting to reconnect", {
            error: error.message,
        });

        try {
            // Close existing pool
            await this.pool.end();

            // Create new pool
            this.pool = new pg.Pool({
                ...this.pool.options,
                connectionTimeoutMillis: this.connectionTimeout,
            });

            await this.testConnection();
            elizaLogger.success("Pool reconnection successful");
        } catch (reconnectError) {
            elizaLogger.error("Failed to reconnect pool", {
                error:
                    reconnectError instanceof Error
                        ? reconnectError.message
                        : String(reconnectError),
            });
            throw reconnectError;
        }
    }

    async query<R extends QueryResultRow = any, I = any[]>(
        queryTextOrConfig: string | QueryConfig<I>,
        values?: QueryConfigValues<I>
    ): Promise<QueryResult<R>> {
        return this.withDatabase(async () => {
            return await this.pool.query(queryTextOrConfig, values);
        }, "query");
    }

    async init() {
        await this.testConnection();

        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");

            const { rows } = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'rooms'
                );
            `);

            if (!rows[0].exists) {
                elizaLogger.info("Applying database schema - tables missing");
                const schema = fs.readFileSync(
                    path.resolve(__dirname, "../schema.sql"),
                    "utf8"
                );
                await client.query(schema);
            }

            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async close() {
        await this.pool.end();
    }

    async testConnection(): Promise<boolean> {
        let client;
        try {
            client = await this.pool.connect();
            const result = await client.query("SELECT NOW()");
            elizaLogger.success(
                "Database connection test successful:",
                result.rows[0]
            );
            return true;
        } catch (error) {
            elizaLogger.error("Database connection test failed:", error);
            throw new Error(
                `Failed to connect to database: ${(error as Error).message}`
            );
        } finally {
            if (client) client.release();
        }
    }

    async cleanup(): Promise<void> {
        try {
            await this.pool.end();
            elizaLogger.info("Database pool closed");
        } catch (error) {
            elizaLogger.error("Error closing database pool:", error);
        }
    }

    async getRoom(roomId: UUID): Promise<UUID | null> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                "SELECT id FROM rooms WHERE id = $1",
                [roomId]
            );
            return rows.length > 0 ? (rows[0].id as UUID) : null;
        }, "getRoom");
    }

    async getParticipantsForAccount(userId: UUID): Promise<Participant[]> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                `SELECT id, "userId", "roomId", "last_message_read"
                FROM participants
                WHERE "userId" = $1`,
                [userId]
            );
            return rows as Participant[];
        }, "getParticipantsForAccount");
    }

    async getParticipantUserState(
        roomId: UUID,
        userId: UUID
    ): Promise<"FOLLOWED" | "MUTED" | null> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                `SELECT "userState" FROM participants WHERE "roomId" = $1 AND "userId" = $2`,
                [roomId, userId]
            );
            return rows.length > 0 ? rows[0].userState : null;
        }, "getParticipantUserState");
    }

    async getMemoriesByRoomIds(params: {
        roomIds: UUID[];
        agentId?: UUID;
        tableName: string;
        limit?: number;
        userId?: UUID;
    }): Promise<Memory[]> {
        return this.withDatabase(async () => {
            if (params.roomIds.length === 0) return [];
            const placeholders = params.roomIds
                .map((_, i) => `$${i + 2}`)
                .join(", ");

            let query = `SELECT * FROM memories WHERE type = $1 AND "roomId" IN (${placeholders})`;
            let queryParams = [params.tableName, ...params.roomIds];

            if (params.agentId) {
                query += ` AND "agentId" = $${params.roomIds.length + 2}`;
                queryParams = [...queryParams, params.agentId];
            }
            if (params.userId) {
                query += ` AND "userId" = $${queryParams.length + 1}`;
                queryParams.push(params.userId);
            }

            // Add sorting, and conditionally add LIMIT if provided
            query += ` ORDER BY "createdAt" DESC`;
            if (params.limit) {
                query += ` LIMIT $${queryParams.length + 1}`;
                queryParams.push(params.limit.toString());
            }

            const { rows } = await this.pool.query(query, queryParams);
            return rows.map((row) => ({
                ...row,
                content:
                    typeof row.content === "string"
                        ? JSON.parse(row.content)
                        : row.content,
            }));
        }, "getMemoriesByRoomIds");
    }

    async setParticipantUserState(
        roomId: UUID,
        userId: UUID,
        state: "FOLLOWED" | "MUTED" | null
    ): Promise<void> {
        return this.withDatabase(async () => {
            await this.pool.query(
                `UPDATE participants SET "userState" = $1 WHERE "roomId" = $2 AND "userId" = $3`,
                [state, roomId, userId]
            );
        }, "setParticipantUserState");
    }

    async getParticipantsForRoom(roomId: UUID): Promise<UUID[]> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                'SELECT "userId" FROM participants WHERE "roomId" = $1',
                [roomId]
            );
            return rows.map((row) => row.userId);
        }, "getParticipantsForRoom");
    }

    async getAccountById(userId: UUID): Promise<Account | null> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                "SELECT * FROM accounts WHERE id = $1",
                [userId]
            );
            if (rows.length === 0) {
                elizaLogger.debug("Account not found:", { userId });
                return null;
            }

            const account = rows[0];
            // elizaLogger.debug("Account retrieved:", {
            //     userId,
            //     hasDetails: !!account.details,
            // });

            return {
                ...account,
                details:
                    typeof account.details === "string"
                        ? JSON.parse(account.details)
                        : account.details,
            };
        }, "getAccountById");
    }

    async createAccount(account: Account): Promise<boolean> {
        return this.withDatabase(async () => {
            try {
                const accountId = account.id ?? v4();
                await this.pool.query(
                    `INSERT INTO accounts (id, name, username, email, "avatarUrl", details)
                    VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        accountId,
                        account.name,
                        account.username || "",
                        account.email || "",
                        account.avatarUrl || "",
                        JSON.stringify(account.details),
                    ]
                );
                elizaLogger.debug("Account created successfully:", {
                    accountId,
                });
                return true;
            } catch (error) {
                elizaLogger.error("Error creating account:", {
                    error:
                        error instanceof Error ? error.message : String(error),
                    accountId: account.id,
                    name: account.name, // Only log non-sensitive fields
                });
                return false; // Return false instead of throwing to maintain existing behavior
            }
        }, "createAccount");
    }

    async getActorById(params: { roomId: UUID }): Promise<Actor[]> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                `SELECT a.id, a.name, a.username, a.details
                FROM participants p
                LEFT JOIN accounts a ON p."userId" = a.id
                WHERE p."roomId" = $1`,
                [params.roomId]
            );

            elizaLogger.debug("Retrieved actors:", {
                roomId: params.roomId,
                actorCount: rows.length,
            });

            return rows.map((row) => {
                try {
                    return {
                        ...row,
                        details:
                            typeof row.details === "string"
                                ? JSON.parse(row.details)
                                : row.details,
                    };
                } catch (error) {
                    elizaLogger.warn("Failed to parse actor details:", {
                        actorId: row.id,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                    return {
                        ...row,
                        details: {}, // Provide default empty details on parse error
                    };
                }
            });
        }, "getActorById").catch((error) => {
            elizaLogger.error("Failed to get actors:", {
                roomId: params.roomId,
                error: error.message,
            });
            throw error; // Re-throw to let caller handle database errors
        });
    }

    async getAccountsByIds(actorIds: UUID[]): Promise<Actor[]> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                "SELECT * FROM accounts WHERE id = ANY($1)",
                [actorIds]
            );
            return rows.map((row) => ({
                ...row,
                details:
                    typeof row.details === "string"
                        ? JSON.parse(row.details)
                        : row.details,
            }));
        }, "getAccountsByIds");
    }

    async getMemoryById(id: UUID): Promise<Memory | null> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                "SELECT * FROM memories WHERE id = $1",
                [id]
            );
            if (rows.length === 0) return null;

            return {
                ...rows[0],
                content:
                    typeof rows[0].content === "string"
                        ? JSON.parse(rows[0].content)
                        : rows[0].content,
            };
        }, "getMemoryById");
    }

    async createMemory(memory: Memory, tableName: string): Promise<void> {
        return this.withDatabase(async () => {
            elizaLogger.debug("PostgresAdapter createMemory:", {
                memoryId: memory.id,
                contentLength: memory.content?.text?.length,
            });

            const isUnique = true;

            await this.pool.query(
                `INSERT INTO memories (
                    id, type, content, "userId", "roomId", "agentId", "unique", "createdAt"
                ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7, to_timestamp($8/1000.0))`,
                [
                    memory.id ?? v4(),
                    tableName,
                    JSON.stringify(memory.content),
                    memory.userId,
                    memory.roomId,
                    memory.agentId,
                    memory.unique ?? isUnique,
                    Date.now(),
                ]
            );
        }, "createMemory");
    }

    async getMemories(params: {
        roomId: UUID;
        count?: number;
        unique?: boolean;
        tableName: string;
        agentId?: UUID;
        start?: number;
        end?: number;
    }): Promise<Memory[]> {
        // Parameter validation
        if (!params.tableName) throw new Error("tableName is required");
        if (!params.roomId) throw new Error("roomId is required");

        return this.withDatabase(async () => {
            // Build query
            let sql = `SELECT * FROM memories WHERE type = $1 AND "roomId" = $2`;
            const values: any[] = [params.tableName, params.roomId];
            let paramCount = 2;

            // Add time range filters
            if (params.start) {
                paramCount++;
                sql += ` AND "createdAt" >= to_timestamp($${paramCount})`;
                values.push(params.start / 1000);
            }

            if (params.end) {
                paramCount++;
                sql += ` AND "createdAt" <= to_timestamp($${paramCount})`;
                values.push(params.end / 1000);
            }

            // Add other filters
            if (params.unique) {
                sql += ` AND "unique" = true`;
            }

            if (params.agentId) {
                paramCount++;
                sql += ` AND "agentId" = $${paramCount}`;
                values.push(params.agentId);
            }

            // Add ordering and limit
            sql += ' ORDER BY "createdAt" DESC';

            if (params.count) {
                paramCount++;
                sql += ` LIMIT $${paramCount}`;
                values.push(params.count);
            }

            elizaLogger.debug("Fetching memories:", {
                roomId: params.roomId,
                tableName: params.tableName,
                unique: params.unique,
                agentId: params.agentId,
                timeRange:
                    params.start || params.end
                        ? {
                              start: params.start
                                  ? new Date(params.start).toISOString()
                                  : undefined,
                              end: params.end
                                  ? new Date(params.end).toISOString()
                                  : undefined,
                          }
                        : undefined,
                limit: params.count,
            });

            const { rows } = await this.pool.query(sql, values);
            return rows.map((row) => ({
                ...row,
                content:
                    typeof row.content === "string"
                        ? JSON.parse(row.content)
                        : row.content,
            }));
        }, "getMemories");
    }

    async getGoals(params: {
        roomId: UUID;
        userId?: UUID | null;
        onlyInProgress?: boolean;
        count?: number;
    }): Promise<Goal[]> {
        return this.withDatabase(async () => {
            let sql = `SELECT * FROM goals WHERE "roomId" = $1`;
            const values: any[] = [params.roomId];
            let paramCount = 1;

            if (params.userId) {
                paramCount++;
                sql += ` AND "userId" = $${paramCount}`;
                values.push(params.userId);
            }

            if (params.onlyInProgress) {
                sql += " AND status = 'IN_PROGRESS'";
            }

            if (params.count) {
                paramCount++;
                sql += ` LIMIT $${paramCount}`;
                values.push(params.count);
            }

            const { rows } = await this.pool.query(sql, values);
            return rows.map((row) => ({
                ...row,
                objectives:
                    typeof row.objectives === "string"
                        ? JSON.parse(row.objectives)
                        : row.objectives,
            }));
        }, "getGoals");
    }

    async updateGoal(goal: Goal): Promise<void> {
        return this.withDatabase(async () => {
            try {
                await this.pool.query(
                    `UPDATE goals SET name = $1, status = $2, objectives = $3 WHERE id = $4`,
                    [
                        goal.name,
                        goal.status,
                        JSON.stringify(goal.objectives),
                        goal.id,
                    ]
                );
            } catch (error) {
                elizaLogger.error("Failed to update goal:", {
                    goalId: goal.id,
                    error:
                        error instanceof Error ? error.message : String(error),
                    status: goal.status,
                });
                throw error;
            }
        }, "updateGoal");
    }

    async createGoal(goal: Goal): Promise<void> {
        return this.withDatabase(async () => {
            await this.pool.query(
                `INSERT INTO goals (id, "roomId", "userId", name, status, objectives)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    goal.id ?? v4(),
                    goal.roomId,
                    goal.userId,
                    goal.name,
                    goal.status,
                    JSON.stringify(goal.objectives),
                ]
            );
        }, "createGoal");
    }

    async removeGoal(goalId: UUID): Promise<void> {
        if (!goalId) throw new Error("Goal ID is required");

        return this.withDatabase(async () => {
            try {
                const result = await this.pool.query(
                    "DELETE FROM goals WHERE id = $1 RETURNING id",
                    [goalId]
                );

                elizaLogger.debug("Goal removal attempt:", {
                    goalId,
                    removed: result?.rowCount ?? 0 > 0,
                });
            } catch (error) {
                elizaLogger.error("Failed to remove goal:", {
                    goalId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        }, "removeGoal");
    }

    async createRoom(roomId?: UUID): Promise<UUID> {
        return this.withDatabase(async () => {
            const newRoomId = roomId || v4();
            await this.pool.query("INSERT INTO rooms (id) VALUES ($1)", [
                newRoomId,
            ]);
            return newRoomId as UUID;
        }, "createRoom");
    }

    async removeRoom(roomId: UUID): Promise<void> {
        if (!roomId) throw new Error("Room ID is required");

        return this.withDatabase(async () => {
            const client = await this.pool.connect();
            try {
                await client.query("BEGIN");

                // First check if room exists
                const checkResult = await client.query(
                    "SELECT id FROM rooms WHERE id = $1",
                    [roomId]
                );

                if (checkResult.rowCount === 0) {
                    elizaLogger.warn("No room found to remove:", { roomId });
                    throw new Error(`Room not found: ${roomId}`);
                }

                // Remove related data first (if not using CASCADE)
                await client.query('DELETE FROM memories WHERE "roomId" = $1', [
                    roomId,
                ]);
                await client.query(
                    'DELETE FROM participants WHERE "roomId" = $1',
                    [roomId]
                );
                await client.query('DELETE FROM goals WHERE "roomId" = $1', [
                    roomId,
                ]);

                // Finally remove the room
                const result = await client.query(
                    "DELETE FROM rooms WHERE id = $1 RETURNING id",
                    [roomId]
                );

                await client.query("COMMIT");

                elizaLogger.debug(
                    "Room and related data removed successfully:",
                    {
                        roomId,
                        removed: result?.rowCount ?? 0 > 0,
                    }
                );
            } catch (error) {
                await client.query("ROLLBACK");
                elizaLogger.error("Failed to remove room:", {
                    roomId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
                throw error;
            } finally {
                if (client) client.release();
            }
        }, "removeRoom");
    }

    async createRelationship(params: {
        userA: UUID;
        userB: UUID;
    }): Promise<boolean> {
        // Input validation
        if (!params.userA || !params.userB) {
            throw new Error("userA and userB are required");
        }

        return this.withDatabase(async () => {
            try {
                const relationshipId = v4();
                await this.pool.query(
                    `INSERT INTO relationships (id, "userA", "userB", "userId")
                    VALUES ($1, $2, $3, $4)
                    RETURNING id`,
                    [relationshipId, params.userA, params.userB, params.userA]
                );

                elizaLogger.debug("Relationship created successfully:", {
                    relationshipId,
                    userA: params.userA,
                    userB: params.userB,
                });

                return true;
            } catch (error) {
                // Check for unique constraint violation or other specific errors
                if ((error as { code?: string }).code === "23505") {
                    // Unique violation
                    elizaLogger.warn("Relationship already exists:", {
                        userA: params.userA,
                        userB: params.userB,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                } else {
                    elizaLogger.error("Failed to create relationship:", {
                        userA: params.userA,
                        userB: params.userB,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
                return false;
            }
        }, "createRelationship");
    }

    async getRelationship(params: {
        userA: UUID;
        userB: UUID;
    }): Promise<Relationship | null> {
        if (!params.userA || !params.userB) {
            throw new Error("userA and userB are required");
        }

        return this.withDatabase(async () => {
            try {
                const { rows } = await this.pool.query(
                    `SELECT * FROM relationships
                    WHERE ("userA" = $1 AND "userB" = $2)
                    OR ("userA" = $2 AND "userB" = $1)`,
                    [params.userA, params.userB]
                );

                if (rows.length > 0) {
                    elizaLogger.debug("Relationship found:", {
                        relationshipId: rows[0].id,
                        userA: params.userA,
                        userB: params.userB,
                    });
                    return rows[0];
                }

                elizaLogger.debug("No relationship found between users:", {
                    userA: params.userA,
                    userB: params.userB,
                });
                return null;
            } catch (error) {
                elizaLogger.error("Error fetching relationship:", {
                    userA: params.userA,
                    userB: params.userB,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        }, "getRelationship");
    }

    async getRelationships(params: { userId: UUID }): Promise<Relationship[]> {
        if (!params.userId) {
            throw new Error("userId is required");
        }

        return this.withDatabase(async () => {
            try {
                const { rows } = await this.pool.query(
                    `SELECT * FROM relationships
                    WHERE "userA" = $1 OR "userB" = $1
                    ORDER BY "createdAt" DESC`, // Add ordering if you have this field
                    [params.userId]
                );

                elizaLogger.debug("Retrieved relationships:", {
                    userId: params.userId,
                    count: rows.length,
                });

                return rows;
            } catch (error) {
                elizaLogger.error("Failed to fetch relationships:", {
                    userId: params.userId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        }, "getRelationships");
    }

    async addParticipant(userId: UUID, roomId: UUID): Promise<boolean> {
        return this.withDatabase(async () => {
            try {
                await this.pool.query(
                    `INSERT INTO participants (id, "userId", "roomId")
                    VALUES ($1, $2, $3)`,
                    [v4(), userId, roomId]
                );
                return true;
            } catch (error) {
                elizaLogger.error("Error adding participant", error);
                return false;
            }
        }, "addParticpant");
    }

    async removeParticipant(userId: UUID, roomId: UUID): Promise<boolean> {
        return this.withDatabase(async () => {
            try {
                await this.pool.query(
                    `DELETE FROM participants WHERE "userId" = $1 AND "roomId" = $2`,
                    [userId, roomId]
                );
                return true;
            } catch (error) {
                elizaLogger.error("Error removing participant", error);
                return false;
            }
        }, "removeParticipant");
    }

    async updateGoalStatus(params: {
        goalId: UUID;
        status: GoalStatus;
    }): Promise<void> {
        return this.withDatabase(async () => {
            await this.pool.query(
                "UPDATE goals SET status = $1 WHERE id = $2",
                [params.status, params.goalId]
            );
        }, "updateGoalStatus");
    }

    async removeMemory(memoryId: UUID, tableName: string): Promise<void> {
        return this.withDatabase(async () => {
            await this.pool.query(
                "DELETE FROM memories WHERE type = $1 AND id = $2",
                [tableName, memoryId]
            );
        }, "removeMemory");
    }

    async removeAllMemories(roomId: UUID, tableName: string): Promise<void> {
        const query = `DELETE FROM ${tableName} WHERE room_id = $1`;
        await this.query(query, [roomId]);
    }

    async deleteAccount(userId: UUID): Promise<void> {
        elizaLogger.info(
            `[PostgresAdapter] Initiating transactional deletion for account ${userId}.`
        );
        const client: PoolClient = await this.pool.connect();
        try {
            await client.query("BEGIN");

            elizaLogger.debug(
                `[PostgresAdapter] Deleting memories for user ${userId}`
            );
            await client.query(`DELETE FROM memories WHERE "userId" = $1`, [
                userId,
            ]);

            elizaLogger.debug(
                `[PostgresAdapter] Deleting goals for user ${userId}`
            );
            await client.query(`DELETE FROM goals WHERE "userId" = $1`, [
                userId,
            ]);

            elizaLogger.debug(
                `[PostgresAdapter] Deleting participant records for user ${userId}`
            );
            await client.query(`DELETE FROM participants WHERE "userId" = $1`, [
                userId,
            ]);

            elizaLogger.debug(
                `[PostgresAdapter] Deleting relationships involving user ${userId}`
            );
            await client.query(
                `DELETE FROM relationships WHERE "userA" = $1 OR "userB" = $1 OR "userId" = $1`,
                [userId]
            );

            elizaLogger.debug(`[PostgresAdapter] Deleting account ${userId}`);
            await client.query("DELETE FROM accounts WHERE id = $1", [userId]);

            await client.query("COMMIT");
            elizaLogger.info(
                `[PostgresAdapter] Successfully deleted account and associated data for user ${userId}.`
            );
        } catch (error) {
            await client.query("ROLLBACK");
            elizaLogger.error(
                `[PostgresAdapter] Error during transactional account deletion for user ${userId}:`,
                error
            );
            throw error; // Re-throw the error after rolling back
        } finally {
            client.release();
        }
    }

    async countMemories(
        roomId: UUID,
        unique = true,
        tableName = ""
    ): Promise<number> {
        if (!tableName) throw new Error("tableName is required");

        return this.withDatabase(async () => {
            let sql = `SELECT COUNT(*) as count FROM memories WHERE type = $1 AND "roomId" = $2`;
            if (unique) {
                sql += ` AND "unique" = true`;
            }

            const { rows } = await this.pool.query(sql, [tableName, roomId]);
            return parseInt(rows[0].count);
        }, "countMemories");
    }

    async countMemoriesForUser(params: {
        userId: UUID;
        agentId: UUID;
        tableName: string;
    }): Promise<number> {
        if (!params.tableName) throw new Error("tableName is required");
        if (!params.userId) throw new Error("userId is required");
        if (!params.agentId) throw new Error("agentId is required");

        return this.withDatabase(async () => {
            const sql = `SELECT COUNT(*) as count FROM memories WHERE "userId" = $1 AND "agentId" = $2 AND type = $3`;
            const { rows } = await this.pool.query(sql, [
                params.userId,
                params.agentId,
                params.tableName,
            ]);
            return parseInt(rows[0].count);
        }, "countMemoriesForUser");
    }

    async removeAllGoals(roomId: UUID): Promise<void> {
        return this.withDatabase(async () => {
            await this.pool.query(`DELETE FROM goals WHERE "roomId" = $1`, [
                roomId,
            ]);
        }, "removeAllGoals");
    }

    async getIsUserInTheRoom(roomId: UUID, userId: UUID): Promise<boolean> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                `SELECT id FROM participants WHERE "roomId" = $1 AND "userId" = $2`,
                [roomId, userId]
            );
            return rows.length > 0 ? true : false;
        }, "getIsUserInTheRoom");
    }

    async getRoomsForParticipant(userId: UUID): Promise<UUID[]> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                `SELECT "roomId" FROM participants WHERE "userId" = $1`,
                [userId]
            );
            return rows.map((row) => row.roomId);
        }, "getRoomsForParticipant");
    }

    async getRoomsForParticipants(userIds: UUID[]): Promise<UUID[]> {
        return this.withDatabase(async () => {
            const placeholders = userIds.map((_, i) => `$${i + 1}`).join(", ");
            const { rows } = await this.pool.query(
                `SELECT "roomId"
                 FROM participants
                 WHERE "userId" IN (${placeholders})
                 GROUP BY "roomId"
                 HAVING COUNT(DISTINCT "userId") = $${userIds.length + 1}`,
                [...userIds, userIds.length]
            );
            return rows.map((row) => row.roomId);
        }, "getRoomsForParticipants");
    }

    async getActorDetails(params: { roomId: string }): Promise<Actor[]> {
        if (!params.roomId) {
            throw new Error("roomId is required");
        }

        return this.withDatabase(async () => {
            try {
                const sql = `
                    SELECT
                        a.id,
                        a.name,
                        a.username,
                        a."avatarUrl",
                        COALESCE(a.details::jsonb, '{}'::jsonb) as details
                    FROM participants p
                    LEFT JOIN accounts a ON p."userId" = a.id
                    WHERE p."roomId" = $1
                    ORDER BY a.name
                `;

                const result = await this.pool.query<Actor>(sql, [
                    params.roomId,
                ]);

                elizaLogger.debug("Retrieved actor details:", {
                    roomId: params.roomId,
                    actorCount: result.rows.length,
                });

                return result.rows.map((row) => {
                    try {
                        return {
                            ...row,
                            details:
                                typeof row.details === "string"
                                    ? JSON.parse(row.details)
                                    : row.details,
                        };
                    } catch (parseError) {
                        elizaLogger.warn("Failed to parse actor details:", {
                            actorId: row.id,
                            error:
                                parseError instanceof Error
                                    ? parseError.message
                                    : String(parseError),
                        });
                        return {
                            ...row,
                            details: {}, // Fallback to empty object if parsing fails
                        };
                    }
                });
            } catch (error) {
                elizaLogger.error("Failed to fetch actor details:", {
                    roomId: params.roomId,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
                throw new Error(
                    `Failed to fetch actor details: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }, "getActorDetails");
    }

    async getCache(params: {
        key: string;
        agentId: UUID;
    }): Promise<string | undefined> {
        return this.withDatabase(async () => {
            try {
                const sql = `SELECT "value"::TEXT FROM cache WHERE "key" = $1 AND "agentId" = $2`;
                const { rows } = await this.query<{ value: string }>(sql, [
                    params.key,
                    params.agentId,
                ]);
                return rows[0]?.value ?? undefined;
            } catch (error) {
                elizaLogger.error("Error fetching cache", {
                    error:
                        error instanceof Error ? error.message : String(error),
                    key: params.key,
                    agentId: params.agentId,
                });
                return undefined;
            }
        }, "getCache");
    }

    async setCache(params: {
        key: string;
        agentId: UUID;
        value: string;
    }): Promise<boolean> {
        return this.withDatabase(async () => {
            try {
                const client = await this.pool.connect();
                try {
                    await client.query("BEGIN");
                    await client.query(
                        `INSERT INTO cache ("key", "agentId", "value", "createdAt")
                         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                         ON CONFLICT ("key", "agentId")
                         DO UPDATE SET "value" = EXCLUDED.value, "createdAt" = CURRENT_TIMESTAMP`,
                        [params.key, params.agentId, params.value]
                    );
                    await client.query("COMMIT");
                    return true;
                } catch (error) {
                    await client.query("ROLLBACK");
                    elizaLogger.error("Error setting cache", {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        key: params.key,
                        agentId: params.agentId,
                    });
                    return false;
                } finally {
                    if (client) client.release();
                }
            } catch (error) {
                elizaLogger.error(
                    "Database connection error in setCache",
                    error
                );
                return false;
            }
        }, "setCache");
    }

    async deleteCache(params: {
        key: string;
        agentId: UUID;
    }): Promise<boolean> {
        return this.withDatabase(async () => {
            try {
                const client = await this.pool.connect();
                try {
                    await client.query("BEGIN");
                    await client.query(
                        `DELETE FROM cache WHERE "key" = $1 AND "agentId" = $2`,
                        [params.key, params.agentId]
                    );
                    await client.query("COMMIT");
                    return true;
                } catch (error) {
                    await client.query("ROLLBACK");
                    elizaLogger.error("Error deleting cache", {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        key: params.key,
                        agentId: params.agentId,
                    });
                    return false;
                } finally {
                    client.release();
                }
            } catch (error) {
                elizaLogger.error(
                    "Database connection error in deleteCache",
                    error
                );
                return false;
            }
        }, "deleteCache");
    }

    async getKnowledgeByIds(params: {
        ids: UUID[];
        agentId: UUID;
    }): Promise<RAGKnowledgeItem[]> {
        return this.withDatabase(async () => {
            // Early return if ids array is empty
            if (!params.ids || params.ids.length === 0) {
                elizaLogger.debug(
                    "Empty IDs array provided to getKnowledgeByIds, returning empty results"
                );
                return [];
            }

            let sql = `SELECT * FROM knowledge WHERE ("agentId" = $1 OR "isShared" = true)`;
            const queryParams: any[] = [params.agentId];
            let paramCount = 1;

            // Since we already checked for empty array, we can safely add the IN clause
            paramCount++;
            sql += ` AND id IN (${params.ids.map((_, i) => `$${paramCount + i}`).join(",")})`;
            queryParams.push(...params.ids);

            const { rows } = await this.pool.query(sql, queryParams);

            return rows.map((row) => ({
                id: row.id,
                agentId: row.agentId,
                content:
                    typeof row.content === "string"
                        ? JSON.parse(row.content)
                        : row.content,
                createdAt: row.createdAt.getTime(),
            }));
        }, "getKnowledge");
    }

    async getKnowledge(id: UUID): Promise<RAGKnowledgeItem | null> {
        return this.withDatabase(async () => {
            const { rows } = await this.pool.query(
                `SELECT * FROM knowledge WHERE id = $1`,
                [id]
            );
            return rows[0] ?? null;
        }, "getKnowledge");
    }

    async createKnowledge(knowledge: RAGKnowledgeItem): Promise<void> {
        return this.withDatabase(async () => {
            const client = await this.pool.connect();
            try {
                await client.query("BEGIN");

                const metadata = knowledge.content.metadata || {};

                // If this is a chunk, use createKnowledgeChunk
                if (metadata.isChunk && metadata.originalId) {
                    await this.createKnowledgeChunk({
                        id: knowledge.id,
                        originalId: metadata.originalId,
                        agentId: metadata.isShared ? null : knowledge.agentId,
                        content: knowledge.content,
                        chunkIndex: metadata.chunkIndex || 0,
                        isShared: metadata.isShared || false,
                        createdAt: knowledge.createdAt || Date.now(),
                    });
                } else {
                    // This is a main knowledge item
                    await client.query(
                        `
                        INSERT INTO knowledge (
                            id, "agentId", content, "createdAt",
                            "isMain", "originalId", "chunkIndex", "isShared"
                        ) VALUES ($1, $2, $3, to_timestamp($4/1000.0), $5, $6, $7, $8)
                        ON CONFLICT (id) DO NOTHING
                    `,
                        [
                            knowledge.id,
                            metadata.isShared ? null : knowledge.agentId,
                            knowledge.content,
                            knowledge.createdAt || Date.now(),
                            true,
                            null,
                            null,
                            metadata.isShared || false,
                        ]
                    );
                }

                await client.query("COMMIT");
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally {
                client.release();
            }
        }, "createKnowledge");
    }

    async removeKnowledge(id: UUID): Promise<void> {
        return this.withDatabase(async () => {
            const client = await this.pool.connect();
            try {
                await client.query("BEGIN");

                // Check if this is a pattern-based chunk deletion (e.g., "id-chunk-*")
                if (typeof id === "string" && id.includes("-chunk-*")) {
                    const mainId = id.split("-chunk-")[0];
                    // Delete chunks for this main ID
                    await client.query(
                        'DELETE FROM knowledge WHERE "originalId" = $1',
                        [mainId]
                    );
                } else {
                    // First delete all chunks associated with this knowledge item
                    await client.query(
                        'DELETE FROM knowledge WHERE "originalId" = $1',
                        [id]
                    );
                    // Then delete the main knowledge item
                    await client.query("DELETE FROM knowledge WHERE id = $1", [
                        id,
                    ]);
                }

                await client.query("COMMIT");
            } catch (error) {
                await client.query("ROLLBACK");
                elizaLogger.error("Error removing knowledge", {
                    error:
                        error instanceof Error ? error.message : String(error),
                    id,
                });
                throw error;
            } finally {
                client.release();
            }
        }, "removeKnowledge");
    }

    async clearKnowledge(agentId: UUID, shared?: boolean): Promise<void> {
        return this.withDatabase(async () => {
            const sql = shared
                ? 'DELETE FROM knowledge WHERE ("agentId" = $1 OR "isShared" = true)'
                : 'DELETE FROM knowledge WHERE "agentId" = $1';

            await this.pool.query(sql, [agentId]);
        }, "clearKnowledge");
    }

    private async createKnowledgeChunk(params: {
        id: UUID;
        originalId: UUID;
        agentId: UUID | null;
        content: any;
        chunkIndex: number;
        isShared: boolean;
        createdAt: number;
    }): Promise<void> {
        const contentWithPatternId = {
            ...params.content,
            metadata: {
                ...params.content.metadata,
                patternId: params.id,
            },
        };

        await this.pool.query(
            `
            INSERT INTO knowledge (
                id, "agentId", content, "createdAt",
                "isMain", "originalId", "chunkIndex", "isShared"
            ) VALUES ($1, $2, $3, to_timestamp($4/1000.0), $5, $6, $7, $8)
            ON CONFLICT (id) DO NOTHING
        `,
            [
                params.id, // Use the UUID that was passed in
                params.agentId,
                contentWithPatternId, // Store the pattern ID in metadata
                params.createdAt,
                false,
                params.originalId,
                params.chunkIndex,
                params.isShared,
            ]
        );
    }

    async getCharacterDbTraits(
        characterId: UUID
    ): Promise<CharacterDBTraits | undefined> {
        const { rows } = await this.pool.query(
            `SELECT * FROM characters
             WHERE agent_id = $1
             AND is_published = true
             ORDER BY version_number DESC, published_at DESC
             LIMIT 1`,
            [characterId]
        );
        return rows[0];
    }
}

export default PostgresDatabaseAdapter;
