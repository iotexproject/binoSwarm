import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import { AgentRuntime } from "@elizaos/core";

import { DirectClient, DirectClientInterface } from "..";
import { buildAgentRuntimeMock } from "./mocks";

describe("DirectClient", () => {
    let client: DirectClient;
    let mockAgentRuntime: AgentRuntime;

    beforeEach(() => {
        vi.clearAllMocks();
        mockAgentRuntime = buildAgentRuntimeMock();
        client = new DirectClient();
        client.registerAgent(mockAgentRuntime);
    });

    afterEach(() => {
        client.stop();
    });

    describe("Agent Registration", () => {
        it("should register and unregister agents", () => {
            const newAgent = { ...mockAgentRuntime, agentId: "another-agent" };
            client.registerAgent(newAgent as AgentRuntime);
            expect(client["agents"].size).toBe(2);

            client.unregisterAgent(newAgent as AgentRuntime);
            expect(client["agents"].size).toBe(1);
        });
    });

    describe("DirectClientInterface", () => {
        it("should start and stop client through interface", async () => {
            const mockRuntime = {} as AgentRuntime;
            const client = await DirectClientInterface.start(mockRuntime);
            expect(client).toBeInstanceOf(DirectClient);

            await DirectClientInterface.stop(mockRuntime);
            // Verify the client was stopped
            expect(client instanceof DirectClient).toBe(true);
        });
    });
});
