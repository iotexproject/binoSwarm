import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";

import { AgentRuntime } from "@elizaos/core";

import { DirectClient } from "..";
import { buildAgentRuntimeMock } from "./mocks";

vi.mock("@elizaos/core", async () => {
    const actual = await vi.importActual("@elizaos/core");
    return {
        ...actual,
        elizaLogger: {
            log: vi.fn(),
            success: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
        },
        generateMessageResponse: vi.fn(),
        composeContext: vi.fn(),
        generateImage: vi.fn(),
        generateCaption: vi.fn(),
        getEmbeddingZeroVector: vi.fn().mockReturnValue([]),
    };
});

describe("Message stream endpoint", () => {
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

    it("should handle message stream request", async () => {
        const response = await request(client.app)
            .post(`/${mockAgentRuntime.agentId}/message-stream`)
            .send();

        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toContain("text/event-stream");
        expect(response.text).toContain('"text":"Test response"');
    }, 1000);
});
