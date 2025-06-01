import { IAgentRuntime, Memory, Evaluator } from "@elizaos/core";

interface CleanupConfig {
    readonly maxAgeInDays: number;
    readonly maxMessageCount: number;
}

function getCleanupConfig(): CleanupConfig {
    const maxAgeInDays = parseInt(
        process.env.MESSAGE_RETENTION_DAYS || "30",
        10
    );
    const maxMessageCount = parseInt(process.env.MAX_USER_MESSAGES || "50", 10);

    return {
        maxAgeInDays,
        maxMessageCount,
    };
}

async function cleanupUserMessages(
    runtime: IAgentRuntime,
    userId: string,
    config: CleanupConfig
): Promise<number> {
    const adapter = runtime.databaseAdapter as any; // Cast to access query method

    // Delete old messages (time-based cleanup across all rooms)
    const expiredResult = await adapter.query(
        `DELETE FROM memories
         WHERE type = 'messages'
         AND "userId" = $1
         AND "createdAt" < NOW() - INTERVAL '${config.maxAgeInDays} days'`,
        [userId]
    );

    // Delete excess messages (count-based cleanup across all rooms)
    const excessResult = await adapter.query(
        `DELETE FROM memories
         WHERE type = 'messages'
         AND "userId" = $1
         AND id NOT IN (
           SELECT id FROM memories
           WHERE type = 'messages'
           AND "userId" = $1
           ORDER BY "createdAt" DESC
           LIMIT ${config.maxMessageCount}
         )`,
        [userId]
    );

    return (expiredResult.rowCount || 0) + (excessResult.rowCount || 0);
}

async function handler(runtime: IAgentRuntime, message: Memory): Promise<void> {
    const { userId } = message;

    if (!userId) {
        return;
    }

    const config = getCleanupConfig();

    try {
        const totalRemoved = await cleanupUserMessages(runtime, userId, config);

        if (totalRemoved > 0) {
            console.log(
                `Cleanup: Removed ${totalRemoved} messages for user ${userId} across all rooms`
            );
        }
    } catch (error) {
        console.error(`Cleanup failed for user ${userId}:`, error);
    }
}

export const cleanupEvaluator: Evaluator = {
    name: "CLEANUP_MESSAGES",
    similes: [
        "REMOVE_OLD_MESSAGES",
        "CLEANUP_USER_DATA",
        "ENFORCE_RETENTION_POLICY",
        "PURGE_EXPIRED_MESSAGES",
    ],
    validate: async (
        runtime: IAgentRuntime,
        message: Memory
    ): Promise<boolean> => {
        const messageCount = await runtime.messageManager.countMemories(
            message.roomId
        );

        // Run cleanup every 10 messages to avoid excessive processing
        return messageCount % 10 === 0;
    },
    description:
        "Removes user messages that exceed data retention policies: messages older than configured days and excess messages beyond the configured limit per user.",
    handler,
    examples: [],
};
