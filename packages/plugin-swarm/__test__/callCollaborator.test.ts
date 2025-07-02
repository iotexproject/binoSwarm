import { describe, it, expect, vi, beforeEach } from "vitest";
import { callCollaboratorAction } from "../src/actions/callCollaborator";

// Mock dependencies
vi.mock("@elizaos/core", () => ({
    elizaLogger: {
        info: vi.fn(),
        error: vi.fn(),
    },
    composeContext: vi.fn(),
    ModelClass: {
        LARGE: "LARGE",
    },
    generateTextWithTools: vi.fn(),
}));

vi.mock("../src/tools/callAgentTool", () => ({
    callAgentTool: {
        name: "call_collaborator_agent",
        description: "Mock tool",
    },
}));

vi.mock("../src/templates/callCollaboratorTemplate", () => ({
    callCollaboratorTemplate: "Mock template",
}));

import {
    elizaLogger,
    composeContext,
    generateTextWithTools,
    ModelClass,
} from "@elizaos/core";
import { callAgentTool } from "../src/tools/callAgentTool";
import { callCollaboratorTemplate } from "../src/templates/callCollaboratorTemplate";

describe("callCollaboratorAction", () => {
    const mockRuntime = {
        composeState: vi.fn(),
        updateRecentMessageState: vi.fn(),
        character: {
            collaborators: [
                {
                    name: "TestAgent1",
                    url: "https://test.example.com/agent1",
                    expertise: "Testing Domain",
                },
                {
                    name: "TestAgent2",
                    url: "https://test.example.com/agent2",
                    expertise: "Mock Services",
                },
            ],
        },
    };

    const mockMessage = {
        id: "test-message-id",
        content: { text: "Test message" },
    };

    const mockState = {
        collaborators: JSON.stringify([
            {
                name: "TestAgent1",
                url: "https://test.example.com/agent1",
                expertise: "Testing Domain",
            },
            {
                name: "TestAgent2",
                url: "https://test.example.com/agent2",
                expertise: "Mock Services",
            },
        ]),
    };

    const mockCallback = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("action structure", () => {
        it("should have correct name", () => {
            expect(callCollaboratorAction.name).toBe("CALL_COLLABORATOR");
        });

        it("should have descriptive description", () => {
            expect(callCollaboratorAction.description).toBe(
                "Call a collaborator when the current agent's expertise is insufficient and a better available agent with more focused expertise in the user's question area exists."
            );
        });

        it("should have empty examples and similes arrays", () => {
            expect(callCollaboratorAction.examples).toEqual([]);
            expect(callCollaboratorAction.similes).toEqual([]);
        });

        it("should have validate function", () => {
            expect(typeof callCollaboratorAction.validate).toBe("function");
        });

        it("should have handler function", () => {
            expect(typeof callCollaboratorAction.handler).toBe("function");
        });
    });

    describe("validate function", () => {
        it("should return true when EVM_PRIVATE_KEY is present", async () => {
            const originalEnv = process.env.EVM_PRIVATE_KEY;
            process.env.EVM_PRIVATE_KEY = "test_private_key";

            const result = await callCollaboratorAction.validate(
                mockRuntime as any,
                mockMessage as any
            );

            expect(result).toBe(true);

            // Restore original env
            if (originalEnv) {
                process.env.EVM_PRIVATE_KEY = originalEnv;
            } else {
                delete process.env.EVM_PRIVATE_KEY;
            }
        });

        it("should return false when EVM_PRIVATE_KEY is not present", async () => {
            const originalEnv = process.env.EVM_PRIVATE_KEY;
            delete process.env.EVM_PRIVATE_KEY;

            const result = await callCollaboratorAction.validate(
                mockRuntime as any,
                mockMessage as any
            );

            expect(result).toBe(false);

            // Restore original env
            if (originalEnv) {
                process.env.EVM_PRIVATE_KEY = originalEnv;
            }
        });

        it("should return false when EVM_PRIVATE_KEY is empty string", async () => {
            const originalEnv = process.env.EVM_PRIVATE_KEY;
            process.env.EVM_PRIVATE_KEY = "";

            const result = await callCollaboratorAction.validate(
                mockRuntime as any,
                mockMessage as any
            );

            expect(result).toBe(false);

            // Restore original env
            if (originalEnv) {
                process.env.EVM_PRIVATE_KEY = originalEnv;
            } else {
                delete process.env.EVM_PRIVATE_KEY;
            }
        });
    });

    describe("handler function", () => {
        it("should return false when callback is not provided", async () => {
            const result = await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                mockState as any,
                {},
                undefined
            );

            expect(result).toBe(false);
        });

        it("should compose state when state is null", async () => {
            const composedState = { ...mockState };
            mockRuntime.composeState.mockResolvedValue(composedState);
            (generateTextWithTools as any).mockResolvedValue(
                "Generated response"
            );

            await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                undefined as any,
                {},
                mockCallback
            );

            expect(mockRuntime.composeState).toHaveBeenCalledWith(mockMessage);
            expect(mockRuntime.updateRecentMessageState).not.toHaveBeenCalled();
        });

        it("should update recent message state when state exists", async () => {
            const updatedState = { ...mockState };
            mockRuntime.updateRecentMessageState.mockResolvedValue(
                updatedState
            );
            (generateTextWithTools as any).mockResolvedValue(
                "Generated response"
            );

            await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                mockState as any,
                {},
                mockCallback
            );

            expect(mockRuntime.updateRecentMessageState).toHaveBeenCalledWith(
                mockState
            );
            expect(mockRuntime.composeState).not.toHaveBeenCalled();
        });

        it("should use collaborators from state", async () => {
            const testState = { ...mockState };
            mockRuntime.updateRecentMessageState.mockResolvedValue(testState);
            (generateTextWithTools as any).mockResolvedValue(
                "Generated response"
            );

            await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                testState as any,
                {},
                mockCallback
            );

            // Verify that collaborators from state are available and not modified
            expect(testState.collaborators).toBeDefined();
            const collaborators = JSON.parse(testState.collaborators);
            expect(collaborators).toHaveLength(2);
            expect(collaborators[0].name).toBe("TestAgent1");
            expect(collaborators[1].name).toBe("TestAgent2");
        });

        it("should compose context with state and template", async () => {
            const testState = { ...mockState };
            mockRuntime.updateRecentMessageState.mockResolvedValue(testState);
            (generateTextWithTools as any).mockResolvedValue(
                "Generated response"
            );

            await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                testState as any,
                {},
                mockCallback
            );

            expect(composeContext).toHaveBeenCalledWith({
                state: testState,
                template: callCollaboratorTemplate,
            });
        });

        it("should log context information", async () => {
            const testState = { ...mockState };
            const mockContext = "composed-context";
            mockRuntime.updateRecentMessageState.mockResolvedValue(testState);
            (composeContext as any).mockReturnValue(mockContext);
            (generateTextWithTools as any).mockResolvedValue(
                "Generated response"
            );

            await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                testState as any,
                {},
                mockCallback
            );

            expect(elizaLogger.info).toHaveBeenCalledWith(
                "callCollaboratorContext:",
                mockContext
            );
        });

        it("should call generateTextWithTools with correct parameters", async () => {
            const testState = { ...mockState };
            const mockContext = "composed-context";
            mockRuntime.updateRecentMessageState.mockResolvedValue(testState);
            (composeContext as any).mockReturnValue(mockContext);
            (generateTextWithTools as any).mockResolvedValue(
                "Generated response"
            );

            await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                testState as any,
                {},
                mockCallback
            );

            expect(generateTextWithTools).toHaveBeenCalledWith({
                runtime: mockRuntime,
                context: mockContext,
                enableGlobalMcp: false,
                modelClass: ModelClass.LARGE,
                tools: [callAgentTool],
            });
        });

        it("should call callback with generated response", async () => {
            const testState = { ...mockState };
            const generatedText = "Generated collaboration response";
            mockRuntime.updateRecentMessageState.mockResolvedValue(testState);
            (generateTextWithTools as any).mockResolvedValue(generatedText);

            const result = await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                testState as any,
                {},
                mockCallback
            );

            expect(mockCallback).toHaveBeenCalledWith({
                text: generatedText,
                inReplyTo: mockMessage.id,
            });
            expect(result).toBe(true);
        });

        it("should handle errors and call callback with error message", async () => {
            const testState = { ...mockState };
            const testError = new Error("Test error");
            mockRuntime.updateRecentMessageState.mockResolvedValue(testState);
            (generateTextWithTools as any).mockRejectedValue(testError);

            const result = await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                testState as any,
                {},
                mockCallback
            );

            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error in CALL_COLLABORATOR action:",
                testError
            );
            expect(mockCallback).toHaveBeenCalledWith({
                text: "Could not call collaborator for you, try rephrasing your question.",
                inReplyTo: mockMessage.id,
            });
            expect(result).toBe(false);
        });

        it("should handle errors when composeContext fails", async () => {
            const testState = { ...mockState };
            const testError = new Error("Context composition failed");
            mockRuntime.updateRecentMessageState.mockResolvedValue(testState);
            (composeContext as any).mockImplementation(() => {
                throw testError;
            });

            const result = await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                testState as any,
                {},
                mockCallback
            );

            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error in CALL_COLLABORATOR action:",
                testError
            );
            expect(result).toBe(false);
        });

        it("should handle different message IDs correctly", async () => {
            const testState = { ...mockState };
            const differentMessage = { ...mockMessage, id: "different-id" };
            const generatedText = "Response text";
            const mockContext = "composed-context";

            mockRuntime.updateRecentMessageState.mockResolvedValue(testState);
            (composeContext as any).mockReturnValue(mockContext);
            (generateTextWithTools as any).mockResolvedValue(generatedText);

            await callCollaboratorAction.handler(
                mockRuntime as any,
                differentMessage as any,
                testState as any,
                {},
                mockCallback
            );

            expect(mockCallback).toHaveBeenCalledWith({
                text: generatedText,
                inReplyTo: "different-id",
            });
        });

        it("should access collaborators from character configuration via state", async () => {
            const testState = { ...mockState };
            mockRuntime.updateRecentMessageState.mockResolvedValue(testState);
            (generateTextWithTools as any).mockResolvedValue(
                "Generated response"
            );

            await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                testState as any,
                {},
                mockCallback
            );

            expect(testState.collaborators).toBeDefined();
            const collaborators = JSON.parse(testState.collaborators!);
            expect(collaborators).toHaveLength(2);
            expect(collaborators[0]).toEqual({
                name: "TestAgent1",
                url: "https://test.example.com/agent1",
                expertise: "Testing Domain",
            });
            expect(collaborators[1]).toEqual({
                name: "TestAgent2",
                url: "https://test.example.com/agent2",
                expertise: "Mock Services",
            });
        });

        it("should handle empty collaborators gracefully", async () => {
            const emptyCollaboratorsState = {
                collaborators: "",
            };
            mockRuntime.updateRecentMessageState.mockResolvedValue(
                emptyCollaboratorsState
            );
            (generateTextWithTools as any).mockResolvedValue(
                "Generated response"
            );

            const result = await callCollaboratorAction.handler(
                mockRuntime as any,
                mockMessage as any,
                emptyCollaboratorsState as any,
                {},
                mockCallback
            );

            expect(result).toBe(true);
            expect(mockCallback).toHaveBeenCalledWith({
                text: "Generated response",
                inReplyTo: mockMessage.id,
            });
        });
    });
});
