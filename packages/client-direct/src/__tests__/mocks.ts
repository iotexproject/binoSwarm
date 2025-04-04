import { vi } from "vitest";
import { Character, AgentRuntime } from "@elizaos/core";;

export const buildAgentRuntimeMock = (): AgentRuntime =>
    ({
        agentId: "00000000-0000-0000-0000-000000000000",
        character: {
            name: "Test Agent",
        } as Character,
        clients: {
            discord: true,
        },
        token: "mock-token",
        getSetting: vi.fn().mockReturnValue("mock-setting"),
        messageManager: {
            addEmbeddingToMemory: vi.fn(),
            createMemory: vi.fn(),
            getMemories: vi.fn().mockResolvedValue([]),
        },
        composeState: vi.fn().mockResolvedValue({}),
        updateRecentMessageState: vi.fn().mockResolvedValue({}),
        processActions: vi.fn().mockResolvedValue(null),
        evaluate: vi.fn(),
        ensureConnection: vi.fn(),
        actions: [],
    }) as unknown as AgentRuntime;
