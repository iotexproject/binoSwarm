import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";

import { AgentRuntime, Content, Action } from "@elizaos/core";

import { DirectClient } from "..";
import { handleMCPMessage } from "../handlers/mcpHandler";
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
        stringToUuid: vi.fn().mockReturnValue("mock-uuid"),
        getEmbeddingZeroVector: vi.fn().mockReturnValue([]),
    };
});

describe("MCP Handler", () => {
    let client: DirectClient;
    let mockAgentRuntime: AgentRuntime;
    let mockMcpAction: Action;
    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockMcpAction = {
            name: "CALL_MCP_TOOLS",
            handler: vi.fn(),
            description: "Mock MCP action",
            examples: [],
            validate: vi.fn(),
            similes: [],
        };

        mockAgentRuntime = buildAgentRuntimeMock();
        mockAgentRuntime.actions = [mockMcpAction];

        client = new DirectClient();
        client.registerAgent(mockAgentRuntime);

        // Mock Express request and response objects
        mockReq = {
            params: { agentId: mockAgentRuntime.agentId },
            body: {
                text: "Test MCP message",
                userId: "test-user",
                roomId: "test-room",
            },
        };

        mockRes = {
            setHeader: vi.fn(),
            write: vi.fn(),
            end: vi.fn(),
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
    });

    afterEach(() => {
        client.stop();
    });

    describe("x402 Payment Protocol", () => {
        it("should return 402 for unpaid request via API", async () => {
            // Test the full API endpoint to verify paywall middleware
            const response = await request(client.app)
                .post(`/${mockAgentRuntime.agentId}/message-paid`)
                .send({
                    text: "Test MCP message",
                    userId: "test-user",
                    roomId: "test-room",
                });

            expect(response.status).toBe(402);
            expect(response.headers["content-type"]).toContain(
                "application/json"
            );
            expect(response.body).toHaveProperty("x402Version");
        });
    });

    describe("handleMCPMessage", () => {
        it("should handle MCP message successfully", async () => {
            const mockContent: Content = {
                text: "MCP response",
                source: "test",
            };

            mockMcpAction.handler = vi
                .fn()
                .mockImplementation(
                    async (runtime, message, state, options, callback) => {
                        await callback(mockContent);
                    }
                );

            await handleMCPMessage(mockReq, mockRes, client);

            expect(mockRes.setHeader).toHaveBeenCalledWith(
                "Content-Type",
                "text/event-stream"
            );
            expect(mockRes.setHeader).toHaveBeenCalledWith(
                "Cache-Control",
                "no-cache"
            );
            expect(mockRes.setHeader).toHaveBeenCalledWith(
                "Connection",
                "keep-alive"
            );
            expect(mockRes.write).toHaveBeenCalledWith(
                expect.stringContaining('"text":"MCP response"')
            );
            expect(mockMcpAction.handler).toHaveBeenCalledOnce();
        });

        it("should handle MCP message with no content response", async () => {
            mockMcpAction.handler = vi
                .fn()
                .mockImplementation(
                    async (runtime, message, state, options, callback) => {
                        await callback(null);
                    }
                );

            await handleMCPMessage(mockReq, mockRes, client);

            expect(mockRes.setHeader).toHaveBeenCalledWith(
                "Content-Type",
                "text/event-stream"
            );
            expect(mockMcpAction.handler).toHaveBeenCalledOnce();
            expect(mockRes.end).toHaveBeenCalled();
        });

        it("should handle MCP message with multiple content responses", async () => {
            const mockContents: Content[] = [
                { text: "First response", source: "test" },
                { text: "Second response", source: "test" },
            ];

            mockMcpAction.handler = vi
                .fn()
                .mockImplementation(
                    async (runtime, message, state, options, callback) => {
                        for (const content of mockContents) {
                            await callback(content);
                        }
                    }
                );

            await handleMCPMessage(mockReq, mockRes, client);

            expect(mockRes.write).toHaveBeenCalledWith(
                expect.stringContaining('"text":"First response"')
            );
            expect(mockRes.write).toHaveBeenCalledWith(
                expect.stringContaining('"text":"Second response"')
            );
            expect(mockMcpAction.handler).toHaveBeenCalledOnce();
        });

        it("should create memory for each response", async () => {
            const mockContent: Content = {
                text: "MCP response",
                source: "test",
            };

            mockMcpAction.handler = vi
                .fn()
                .mockImplementation(
                    async (runtime, message, state, options, callback) => {
                        await callback(mockContent);
                    }
                );

            await handleMCPMessage(mockReq, mockRes, client);

            expect(
                mockAgentRuntime.messageManager.createMemory
            ).toHaveBeenCalledWith({
                memory: expect.objectContaining({
                    id: "mock-uuid",
                    userId: mockAgentRuntime.agentId,
                    content: mockContent,
                    createdAt: expect.any(Number),
                }),
                isUnique: true,
            });
        });

        it("should update recent message state", async () => {
            const mockContent: Content = {
                text: "MCP response",
                source: "test",
            };

            mockMcpAction.handler = vi
                .fn()
                .mockImplementation(
                    async (runtime, message, state, options, callback) => {
                        await callback(mockContent);
                    }
                );

            await handleMCPMessage(mockReq, mockRes, client);

            expect(
                mockAgentRuntime.updateRecentMessageState
            ).toHaveBeenCalled();
        });

        it("should call runtime.evaluate", async () => {
            const mockContent: Content = {
                text: "MCP response",
                source: "test",
            };

            mockMcpAction.handler = vi
                .fn()
                .mockImplementation(
                    async (runtime, message, state, options, callback) => {
                        await callback(mockContent);
                    }
                );

            await handleMCPMessage(mockReq, mockRes, client);

            expect(mockAgentRuntime.evaluate).toHaveBeenCalled();
        });

        it("should handle error during MCP action execution", async () => {
            const mockError = new Error("MCP action failed");
            mockMcpAction.handler = vi.fn().mockRejectedValue(mockError);

            await handleMCPMessage(mockReq, mockRes, client);

            expect(mockRes.write).toHaveBeenCalledWith(
                expect.stringContaining('"error"')
            );
        });

        it("should handle missing MCP action", async () => {
            mockAgentRuntime.actions = []; // No MCP action available

            await handleMCPMessage(mockReq, mockRes, client);

            expect(mockRes.write).toHaveBeenCalledWith(
                expect.stringContaining('"error"')
            );
        });

        it("should handle agent not found", async () => {
            const invalidReq = {
                ...mockReq,
                params: { agentId: "non-existent-agent" },
            };

            await handleMCPMessage(invalidReq, mockRes, client);

            expect(mockRes.write).toHaveBeenCalledWith(
                expect.stringContaining('"error":"Agent not found"')
            );
        });

        it("should handle invalid request body", async () => {
            const invalidReq = {
                ...mockReq,
                body: {}, // Missing required fields
            };

            await handleMCPMessage(invalidReq, mockRes, client);

            expect(mockRes.write).toHaveBeenCalledWith(
                expect.stringContaining('"error"')
            );
        });

        it("should filter actions to find CALL_MCP_TOOLS", async () => {
            const otherAction: Action = {
                name: "OTHER_ACTION",
                handler: vi.fn(),
                description: "Other action",
                examples: [],
                validate: vi.fn(),
                similes: [],
            };

            mockAgentRuntime.actions = [otherAction, mockMcpAction];

            mockMcpAction.handler = vi
                .fn()
                .mockImplementation(
                    async (runtime, message, state, options, callback) => {
                        await callback({
                            text: "MCP response",
                            source: "test",
                        });
                    }
                );

            await handleMCPMessage(mockReq, mockRes, client);

            expect(mockMcpAction.handler).toHaveBeenCalledOnce();
            expect(otherAction.handler).not.toHaveBeenCalled();
        });

        it("should pass correct parameters to MCP action handler", async () => {
            mockMcpAction.handler = vi
                .fn()
                .mockImplementation(
                    async (runtime, message, state, options, callback) => {
                        await callback({
                            text: "MCP response",
                            source: "test",
                        });
                    }
                );

            await handleMCPMessage(mockReq, mockRes, client);

            expect(mockMcpAction.handler).toHaveBeenCalledWith(
                mockAgentRuntime,
                expect.objectContaining({
                    content: expect.objectContaining({
                        text: "Test MCP message",
                    }),
                    userId: "mock-uuid",
                    roomId: "mock-uuid",
                }),
                expect.any(Object), // state
                {}, // options
                expect.any(Function) // callback
            );
        });

        it("should set SSE headers correctly", async () => {
            const mockContent: Content = {
                text: "MCP response",
                source: "test",
            };

            mockMcpAction.handler = vi
                .fn()
                .mockImplementation(
                    async (runtime, message, state, options, callback) => {
                        await callback(mockContent);
                    }
                );

            await handleMCPMessage(mockReq, mockRes, client);

            expect(mockRes.setHeader).toHaveBeenCalledWith(
                "Content-Type",
                "text/event-stream"
            );
            expect(mockRes.setHeader).toHaveBeenCalledWith(
                "Cache-Control",
                "no-cache"
            );
            expect(mockRes.setHeader).toHaveBeenCalledWith(
                "Connection",
                "keep-alive"
            );
        });
    });
});
