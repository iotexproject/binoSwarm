import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { REST } from "discord.js";
import request from "supertest";

import { AgentRuntime, Character } from "@elizaos/core";
import { DirectClient } from "..";

vi.mock("discord.js");

describe("GET requests", () => {
    let client: DirectClient;
    let mockAgentRuntime: AgentRuntime;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create mock agent runtime
        mockAgentRuntime = {
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
        } as unknown as AgentRuntime;

        // Initialize client
        client = new DirectClient();
        client.registerAgent(mockAgentRuntime);
    });

    afterEach(() => {
        client.stop();
    });

    describe("Constructor and Basic Setup", () => {
        it("should initialize with express app and middleware", () => {
            expect(client.app).toBeDefined();
            expect(client.app._router).toBeDefined();
        });
    });

    describe("GET /agents/:agentId/channels", () => {
        it("should return agent channels when valid token is provided", async () => {
            const mockGuilds = [
                { id: "guild1", name: "Guild 1" },
                { id: "guild2", name: "Guild 2" },
            ];

            // Mock Discord.js REST
            const mockGet = vi.fn().mockResolvedValue(mockGuilds);
            vi.mocked(REST).mockImplementation(
                () =>
                    ({
                        setToken: () => ({ get: mockGet }),
                    }) as any
            );

            const response = await request(client.app).get(
                `/agents/${mockAgentRuntime.agentId}/channels`
            );

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                id: mockAgentRuntime.agentId,
                guilds: mockGuilds,
                serverCount: 2,
            });
        });

        it("should return 404 when agent is not found", async () => {
            const response = await request(client.app).get(
                "/agents/non-existent-agent/channels"
            );
            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: "Agent not found" });
        });

        it("should handle Discord API errors", async () => {
            vi.mocked(REST).mockImplementation(
                () =>
                    ({
                        setToken: () => ({
                            get: vi
                                .fn()
                                .mockRejectedValue(
                                    new Error("Discord API Error")
                                ),
                        }),
                    }) as any
            );

            const response = await request(client.app).get(
                `/agents/${mockAgentRuntime.agentId}/channels`
            );
            expect(response.status).toBe(500);
            expect(response.body.error).toBe("Error processing channels");
        });
    });

    describe("GET /", () => {
        it("should return welcome message", async () => {
            const response = await request(client.app).get("/");
            expect(response.status).toBe(200);
            expect(response.text).toContain("Welcome to the DePIN");
        });
    });

    describe("GET /hello", () => {
        it("should return hello world message", async () => {
            const response = await request(client.app).get("/hello");
            expect(response.status).toBe(200);
            expect(response.text).toContain("the DePIN revolution");
        });
    });

    describe("GET /agents", () => {
        it("should return list of agents", async () => {
            const response = await request(client.app).get("/agents");
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                agents: [
                    {
                        id: mockAgentRuntime.agentId,
                        name: "Test Agent",
                        clients: ["discord"],
                    },
                ],
            });
        });

        it("should return empty list when no agents exist", async () => {
            // @ts-ignore: even though it's private, we can clear it for testing
            client.agents.clear();
            const response = await request(client.app).get("/agents");
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ agents: [] });
        });
    });
});
