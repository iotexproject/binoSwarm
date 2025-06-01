import { describe, it, expect, beforeEach, vi } from "vitest";
import { cleanupEvaluator } from "../evaluators/cleanup";
import { IAgentRuntime, Memory } from "@elizaos/core";

describe("CleanupEvaluator", () => {
    let mockRuntime: Partial<IAgentRuntime>;
    let mockMessage: Memory;

    beforeEach(() => {
        mockRuntime = {
            messageManager: {
                countMemories: vi.fn().mockResolvedValue(20),
            } as any,
            databaseAdapter: {
                query: vi.fn().mockResolvedValue({ rowCount: 5 }),
            } as any,
        };

        mockMessage = {
            id: "550e8400-e29b-41d4-a716-446655440000" as any,
            userId: "550e8400-e29b-41d4-a716-446655440001" as any,
            roomId: "550e8400-e29b-41d4-a716-446655440002" as any,
            agentId: "550e8400-e29b-41d4-a716-446655440003" as any,
            content: { text: "test message" },
            createdAt: Date.now(),
        };
    });

    it("should validate cleanup trigger every 10 messages", async () => {
        mockRuntime.messageManager!.countMemories = vi
            .fn()
            .mockResolvedValue(30);

        const shouldRun = await cleanupEvaluator.validate!(
            mockRuntime as IAgentRuntime,
            mockMessage
        );

        expect(shouldRun).toBe(true);
    });

    it("should not validate when message count is not divisible by 10", async () => {
        mockRuntime.messageManager!.countMemories = vi
            .fn()
            .mockResolvedValue(25);

        const shouldRun = await cleanupEvaluator.validate!(
            mockRuntime as IAgentRuntime,
            mockMessage
        );

        expect(shouldRun).toBe(false);
    });

    it("should have correct evaluator properties", () => {
        expect(cleanupEvaluator.name).toBe("CLEANUP_MESSAGES");
        expect(cleanupEvaluator.description).toContain("retention policies");
        expect(cleanupEvaluator.similes).toContain("REMOVE_OLD_MESSAGES");
        expect(typeof cleanupEvaluator.handler).toBe("function");
    });

    it("should handle missing userId gracefully", async () => {
        const messageWithoutUser = { ...mockMessage, userId: undefined };

        await expect(
            cleanupEvaluator.handler(
                mockRuntime as IAgentRuntime,
                messageWithoutUser
            )
        ).resolves.toBeUndefined();
    });
});
