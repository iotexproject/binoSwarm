import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";

import {
    AgentRuntime,
    composeContext,
    generateMessageResponse,
} from "@elizaos/core";

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
        MsgPreprocessor: vi.fn().mockImplementation(() => ({
            preprocess: vi.fn(),
        })),
    };
});

describe("Message endpoint", () => {
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

    it("should handle message with text only", async () => {
        vi.mocked(generateMessageResponse).mockResolvedValue({
            text: "Test response",
            action: null,
        });
        vi.mocked(composeContext).mockReturnValue("mock context");

        const response = await request(client.app)
            .post(`/${mockAgentRuntime.agentId}/message`)
            .send({
                text: "Hello",
                userId: "test-user",
                roomId: "test-room",
            });

        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toContain("text/event-stream");
        expect(response.text).toContain('"text":"Test response"');
    });

    it("should handle message with action response", async () => {
        const mockResponse = {
            text: "Test response",
            action: "testAction",
        };
        const mockActionResponse = { text: "Action result" };
        vi.mocked(generateMessageResponse).mockResolvedValue(mockResponse);
        vi.mocked(composeContext).mockReturnValue("mock context");

        mockAgentRuntime.processActions = vi
            .fn()
            .mockImplementation(async (_, __, ___, callback) => {
                return callback(mockActionResponse);
            });

        const response = await request(client.app)
            .post(`/${mockAgentRuntime.agentId}/message`)
            .send({
                text: "Hello",
                userId: "test-user",
                roomId: "test-room",
            });

        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toContain("text/event-stream");
        expect(response.text).toContain('"text":"Action result"');
    });

    it("should handle agent not found", async () => {
        const response = await request(client.app)
            .post("/non-existent-agent/message")
            .send({
                text: "Hello",
            });

        expect(response.headers["content-type"]).toContain("text/event-stream");
        expect(response.text).toContain('"error":"Agent not found"');
    });
});
