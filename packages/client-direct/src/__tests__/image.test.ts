import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";

import { AgentRuntime, generateImage, generateCaption } from "@elizaos/core";

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

describe("Generate Image endpoint", () => {
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

    it("should generate image with caption", async () => {
        const mockImageUrl = "http://example.com/image.jpg";
        const mockCaption = "A test image";

        vi.mocked(generateImage).mockResolvedValue({
            success: true,
            data: [mockImageUrl],
        });
        vi.mocked(generateCaption).mockResolvedValue({
            title: mockCaption,
            description: mockCaption,
        });

        const response = await request(client.app)
            .post(`/${mockAgentRuntime.agentId}/image`)
            .send({
                prompt: "Generate a test image",
            });

        expect(response.status).toBe(200);
        expect(response.body.images).toHaveLength(1);
        expect(response.body.images[0]).toEqual({
            image: mockImageUrl,
            caption: mockCaption,
        });
    });

    it("should handle agent not found for image generation", async () => {
        const response = await request(client.app)
            .post("/non-existent-agent/image")
            .send({
                prompt: "Generate a test image",
            });

        expect(response.status).toBe(404);
        expect(response.text).toBe("Agent not found");
    });
});
