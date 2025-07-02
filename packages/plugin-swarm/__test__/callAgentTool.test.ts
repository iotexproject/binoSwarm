import { describe, it, expect, vi, beforeEach } from "vitest";
import { callAgentTool } from "../src/tools/callAgentTool";

// Mock the callAgent function
vi.mock("../src/lib/requestHandler", () => ({
    callAgent: vi.fn(),
}));

import { callAgent } from "../src/lib/requestHandler";

describe("callAgentTool", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("tool structure", () => {
        it("should have correct name", () => {
            expect(callAgentTool.name).toBe("call_collaborator_agent");
        });

        it("should have descriptive description", () => {
            expect(callAgentTool.description).toContain(
                "Calls another agent to collaborate"
            );
            expect(callAgentTool.description).toContain(
                "specific specialization"
            );
        });

        it("should have parameters schema", () => {
            expect(callAgentTool.parameters).toBeDefined();
        });
    });

    describe("parameter validation", () => {
        it("should validate valid parameters", () => {
            const validParams = {
                agent_url: "https://example.com/agent",
                message: "Hello, collaborator!",
            };

            const result = callAgentTool.parameters.safeParse(validParams);
            expect(result.success).toBe(true);
        });

        it("should reject invalid URL", () => {
            const invalidParams = {
                agent_url: "not-a-url",
                message: "Hello",
            };

            const result = callAgentTool.parameters.safeParse(invalidParams);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain("A valid URL");
            }
        });

        it("should reject empty message", () => {
            const invalidParams = {
                agent_url: "https://example.com",
                message: "",
            };

            const result = callAgentTool.parameters.safeParse(invalidParams);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain(
                    "Message cannot be empty"
                );
            }
        });

        it("should reject missing agent_url", () => {
            const invalidParams = {
                message: "Hello",
            };

            const result = callAgentTool.parameters.safeParse(invalidParams);
            expect(result.success).toBe(false);
        });

        it("should reject missing message", () => {
            const invalidParams = {
                agent_url: "https://example.com",
            };

            const result = callAgentTool.parameters.safeParse(invalidParams);
            expect(result.success).toBe(false);
        });
    });

    describe("execute function", () => {
        it("should successfully call agent and aggregate response", async () => {
            const mockCallAgent = callAgent as any;
            mockCallAgent.mockImplementation(
                async (
                    url: string,
                    message: string,
                    onData: (chunk: string) => void
                ) => {
                    onData("Hello ");
                    onData("from ");
                    onData("collaborator!");
                }
            );

            const args = {
                agent_url: "https://example.com/agent",
                message: "Hello, collaborator!",
            };

            const result = await callAgentTool.execute(args);

            expect(mockCallAgent).toHaveBeenCalledWith(
                "https://example.com/agent",
                "Hello, collaborator!",
                expect.any(Function)
            );
            expect(result).toBe("Hello from collaborator!");
        });

        it("should handle empty response", async () => {
            const mockCallAgent = callAgent as any;
            mockCallAgent.mockImplementation(
                async (
                    url: string,
                    message: string,
                    onData: (chunk: string) => void
                ) => {
                    // No data chunks
                }
            );

            const args = {
                agent_url: "https://example.com/agent",
                message: "Hello",
            };

            const result = await callAgentTool.execute(args);

            expect(result).toBe("");
        });

        it("should handle single chunk response", async () => {
            const mockCallAgent = callAgent as any;
            mockCallAgent.mockImplementation(
                async (
                    url: string,
                    message: string,
                    onData: (chunk: string) => void
                ) => {
                    onData("Single response");
                }
            );

            const args = {
                agent_url: "https://example.com/agent",
                message: "Hello",
            };

            const result = await callAgentTool.execute(args);

            expect(result).toBe("Single response");
        });

        it("should handle Error instance and return formatted error message", async () => {
            const mockCallAgent = callAgent as any;
            const testError = new Error("Network connection failed");
            mockCallAgent.mockRejectedValue(testError);

            const args = {
                agent_url: "https://example.com/agent",
                message: "Hello",
            };

            const result = await callAgentTool.execute(args);

            expect(result).toBe(
                "Failed to call collaborator agent: Network connection failed"
            );
        });

        it("should handle non-Error instance and return generic error message", async () => {
            const mockCallAgent = callAgent as any;
            mockCallAgent.mockRejectedValue("String error");

            const args = {
                agent_url: "https://example.com/agent",
                message: "Hello",
            };

            const result = await callAgentTool.execute(args);

            expect(result).toBe(
                "Failed to call collaborator agent: An unknown error occurred"
            );
        });

        it("should handle null error and return generic error message", async () => {
            const mockCallAgent = callAgent as any;
            mockCallAgent.mockRejectedValue(null);

            const args = {
                agent_url: "https://example.com/agent",
                message: "Hello",
            };

            const result = await callAgentTool.execute(args);

            expect(result).toBe(
                "Failed to call collaborator agent: An unknown error occurred"
            );
        });

        it("should handle undefined error and return generic error message", async () => {
            const mockCallAgent = callAgent as any;
            mockCallAgent.mockRejectedValue(undefined);

            const args = {
                agent_url: "https://example.com/agent",
                message: "Hello",
            };

            const result = await callAgentTool.execute(args);

            expect(result).toBe(
                "Failed to call collaborator agent: An unknown error occurred"
            );
        });

        it("should aggregate multiple chunks in correct order", async () => {
            const mockCallAgent = callAgent as any;
            mockCallAgent.mockImplementation(
                async (
                    url: string,
                    message: string,
                    onData: (chunk: string) => void
                ) => {
                    onData("First ");
                    onData("Second ");
                    onData("Third ");
                    onData("Fourth");
                }
            );

            const args = {
                agent_url: "https://example.com/agent",
                message: "Test message",
            };

            const result = await callAgentTool.execute(args);

            expect(result).toBe("First Second Third Fourth");
        });

        it("should handle special characters in response", async () => {
            const mockCallAgent = callAgent as any;
            mockCallAgent.mockImplementation(
                async (
                    url: string,
                    message: string,
                    onData: (chunk: string) => void
                ) => {
                    onData("Special chars: ");
                    onData("émojis 🤖, ");
                    onData("newlines\n, ");
                    onData('quotes "test"');
                }
            );

            const args = {
                agent_url: "https://example.com/agent",
                message: "Test",
            };

            const result = await callAgentTool.execute(args);

            expect(result).toBe(
                'Special chars: émojis 🤖, newlines\n, quotes "test"'
            );
        });
    });
});
