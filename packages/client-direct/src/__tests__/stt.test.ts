import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";

import { AgentRuntime } from "@elizaos/core";

import { DirectClient } from "..";
import { buildAgentRuntimeMock } from "./mocks";

describe("Whisper Endpoint", () => {
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

    it("should handle missing audio file", async () => {
        const response = await request(client.app).post(
            `/${mockAgentRuntime.agentId}/whisper`
        );

        expect(response.status).toBe(400);
        expect(response.text).toBe("No audio file provided");
    });
});
