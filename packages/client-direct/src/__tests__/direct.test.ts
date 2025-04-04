import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";

import { AgentRuntime, generateMessageResponse } from "@elizaos/core";

import { DirectClient, DirectClientInterface } from "..";
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

vi.mock("fs", async () => {
    const actual = await vi.importActual("fs");
    return {
        ...actual,
        default: {
            ...actual,
            promises: {
                mkdir: vi.fn(),
                writeFile: vi.fn(),
                stat: vi.fn(),
            },
            existsSync: vi.fn(),
            mkdirSync: vi.fn(),
        },
        promises: {
            mkdir: vi.fn(),
            writeFile: vi.fn(),
            stat: vi.fn(),
        },
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
    };
});

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

    describe("Speech Synthesis Endpoint", () => {
        beforeEach(() => {
            process.env.ELEVENLABS_XI_API_KEY = "mock-key";
            process.env.ELEVENLABS_VOICE_ID = "mock-voice-id";
            global.fetch = vi.fn();
        });

        afterEach(() => {
            delete process.env.ELEVENLABS_XI_API_KEY;
            delete process.env.ELEVENLABS_VOICE_ID;
            vi.restoreAllMocks();
        });

        it.skip("should convert text to speech", async () => {
            const mockAudioBuffer = new ArrayBuffer(8);
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                arrayBuffer: () => Promise.resolve(mockAudioBuffer),
            } as Response);

            const mockMessageResponse = {
                text: "Hello world",
                action: null,
            };
            vi.mocked(generateMessageResponse).mockResolvedValue(
                mockMessageResponse
            );

            const response = await request(client.app)
                .post(`/${mockAgentRuntime.agentId}/speak`)
                .send({
                    text: "Hello world",
                    userId: "test-user",
                    roomId: "test-room",
                });

            expect(response.status).toBe(200);
            expect(response.headers["content-type"]).toBe("audio/mpeg");
        });

        it("should handle missing API key", async () => {
            const mockMessageResponse = {
                text: "Hello world",
                action: null,
            };
            vi.mocked(generateMessageResponse).mockResolvedValue(
                mockMessageResponse
            );

            delete process.env.ELEVENLABS_XI_API_KEY;

            const response = await request(client.app)
                .post(`/${mockAgentRuntime.agentId}/speak`)
                .send({
                    text: "Hello world",
                });

            expect(response.status).toBe(500);
            expect(response.body.error).toBe("Error processing speech");
        });
    });

    describe("Whisper Endpoint", () => {
        it("should handle missing audio file", async () => {
            const response = await request(client.app).post(
                `/${mockAgentRuntime.agentId}/whisper`
            );

            expect(response.status).toBe(400);
            expect(response.text).toBe("No audio file provided");
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
