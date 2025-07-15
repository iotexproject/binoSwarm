import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
    generateTextWithTools,
    streamWithTools,
} from "../src/generationWithTools";
import * as ai from "ai";
import { getModelSettings, getModel } from "../src/models";
import { elizaLogger, stringToUuid } from "../src/index";
import { trimTokens } from "../src/tokenTrimming";
import { buildGenerationSettings } from "../src/generationHelpers";
import { z } from "zod";
import type {
    IAgentRuntime,
    Memory,
    ModelClass,
    ModelSettings,
} from "../src/types";

// Mock dependencies
vi.mock("ai", () => ({
    generateText: vi.fn(),
    streamText: vi.fn(),
    smoothStream: vi.fn().mockReturnValue("smoothStream"),
    tool: vi.fn((t) => t),
}));

vi.mock("../src/models", () => ({
    getModelSettings: vi.fn(),
    getModel: vi.fn(),
}));

vi.mock("../src/index", () => ({
    elizaLogger: {
        debug: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("../src/tokenTrimming", () => ({
    trimTokens: vi.fn(),
}));

vi.mock("../src/generationHelpers", () => ({
    buildGenerationSettings: vi.fn(),
}));

describe("Generation With Tools", () => {
    let mockRuntime: IAgentRuntime;
    let mockModelSettings: ModelSettings;
    let mockContext: string;
    let mockTools: any[];
    let mockGenerationResult: {
        text: string;
        usage: { promptTokens: number; completionTokens: number };
    };
    let mockModelClass: ModelClass;
    let mockGenerationOptions: any;
    let originalEnv: NodeJS.ProcessEnv;
    let mockMessage: Memory;

    beforeEach(() => {
        // Store original environment variables
        originalEnv = { ...process.env };

        // Reset all mocks
        vi.clearAllMocks();

        // Setup mock runtime
        mockRuntime = {
            modelProvider: "openai",
            character: {
                system: "You are a helpful assistant",
            },
            metering: {
                trackPrompt: vi.fn(),
            },
            mcpManager: {
                close: vi.fn().mockResolvedValue(undefined),
                initialize: vi.fn().mockResolvedValue(undefined),
                getToolsForClients: vi.fn().mockResolvedValue(undefined),
                closeClients: vi.fn().mockResolvedValue(undefined),
            },
            mcpTools: {},
        } as unknown as IAgentRuntime;

        // Setup mock message
        mockMessage = {
            id: "123-123-123-123-123",
            userId: "123-123-123-123-123",
            agentId: "123-123-123-123-123",
            roomId: "123-123-123-123-123",
            content: {
                text: "What is the weather in Tokyo?",
            },
        };

        // Setup mock model settings
        mockModelSettings = {
            name: "gpt-4o",
            maxInputTokens: 128000,
            maxOutputTokens: 8192,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            temperature: 0.6,
            stop: [],
        };
        (getModelSettings as any).mockReturnValue(mockModelSettings);

        // Setup mock context
        mockContext = "Tell me about the weather";

        // Setup mock tools
        mockTools = [
            {
                name: "getWeather",
                description: "Get the current weather for a location",
                parameters: z.object({
                    location: z
                        .string()
                        .describe("The location to get weather for"),
                }),
                execute: vi.fn().mockResolvedValue({
                    temperature: 72,
                    conditions: "sunny",
                }),
            },
        ];

        // Setup mock model
        (getModel as any).mockReturnValue("openai-model");

        // Setup mockTrimTokens
        (trimTokens as any).mockResolvedValue(mockContext);

        // Setup mockGenerationOptions
        mockGenerationOptions = {
            prompt: mockContext,
            maxTokens: mockModelSettings.maxOutputTokens,
            temperature: mockModelSettings.temperature,
            stop: mockModelSettings.stop,
            frequencyPenalty: mockModelSettings.frequency_penalty,
            presencePenalty: mockModelSettings.presence_penalty,
        };

        // Setup mockBuildGenerationSettings
        (buildGenerationSettings as any).mockReturnValue(mockGenerationOptions);

        // Setup generateText mock result
        mockGenerationResult = {
            text: "The weather is sunny with a temperature of 72 degrees.",
            usage: {
                promptTokens: 100,
                completionTokens: 50,
            },
        };
        (ai.generateText as any).mockResolvedValue(mockGenerationResult);

        // Setup streamText mock
        (ai.streamText as any).mockReturnValue("mock-stream");

        // Set modelClass
        mockModelClass = "medium" as ModelClass;
    });

    afterEach(() => {
        // Restore original environment variables
        process.env = originalEnv;

        vi.resetAllMocks();
    });

    describe("TOOL_CALL_LIMIT Environment Variable", () => {
        it("should use default tool call limit (5) when environment variable is not set", async () => {
            // Arrange
            delete process.env.TOOL_CALL_LIMIT;

            // Force the module to be reloaded to pick up the environment variable change
            vi.resetModules();
            const { generateTextWithTools: freshGenerateTextWithTools } =
                await import("../src/generationWithTools");

            // Act
            await freshGenerateTextWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                tools: mockTools,
            });

            // Assert
            expect(ai.generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    maxSteps: 5, // Default value
                })
            );
        });

        it("should use the tool call limit from environment variable when set", async () => {
            // Arrange
            process.env.TOOL_CALL_LIMIT = "10";

            // Force the module to be reloaded to pick up the environment variable change
            vi.resetModules();
            const { generateTextWithTools: freshGenerateTextWithTools } =
                await import("../src/generationWithTools");

            // Act
            await freshGenerateTextWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                tools: mockTools,
            });

            // Assert
            expect(ai.generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    maxSteps: 10, // Value from environment variable
                })
            );
        });

        it("should parse the tool call limit as an integer", async () => {
            // Arrange
            process.env.TOOL_CALL_LIMIT = "7.5"; // Should be parsed as 7

            // Force the module to be reloaded to pick up the environment variable change
            vi.resetModules();
            const { generateTextWithTools: freshGenerateTextWithTools } =
                await import("../src/generationWithTools");

            // Act
            await freshGenerateTextWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                tools: mockTools,
            });

            // Assert
            expect(ai.generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    maxSteps: 7, // parseInt("7.5") results in 7
                })
            );
        });

        it("should also affect streamWithTools function", async () => {
            // Arrange
            process.env.TOOL_CALL_LIMIT = "8";

            // Force the module to be reloaded to pick up the environment variable change
            vi.resetModules();
            const { streamWithTools: freshStreamWithTools } = await import(
                "../src/generationWithTools"
            );

            // Act
            freshStreamWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                tools: mockTools,
            });

            // Assert
            const callArgs = (ai.streamText as any).mock.calls[0][0];
            expect(callArgs).toHaveProperty("maxSteps", 8);
        });
    });

    describe("generateTextWithTools", () => {
        it("should generate text with tools successfully", async () => {
            // Act
            const result = await generateTextWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                tools: mockTools,
                message: mockMessage,
                functionId: "generateTextWithTools",
                tags: ["test"],
            });

            // Assert
            expect(result).toBe(mockGenerationResult.text);
            expect(getModelSettings).toHaveBeenCalledWith(
                mockRuntime.modelProvider,
                mockModelClass
            );
            expect(trimTokens).toHaveBeenCalledWith(
                mockContext,
                mockModelSettings.maxInputTokens,
                mockRuntime
            );
            expect(buildGenerationSettings).toHaveBeenCalledWith(
                mockContext,
                mockModelSettings,
                mockMessage,
                "generateTextWithTools",
                ["test"]
            );
            expect(getModel).toHaveBeenCalledWith(
                mockRuntime.modelProvider,
                mockModelSettings.name
            );
            expect(ai.generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: "openai-model",
                    system: mockRuntime.character.system,
                    tools: expect.any(Object),
                    maxSteps: expect.any(Number),
                    experimental_continueSteps: true,
                    onStepFinish: expect.any(Function),
                })
            );
            expect(elizaLogger.debug).toHaveBeenCalledWith(
                "generateTextWithTools result:",
                mockGenerationResult.text
            );
        });

        it("should use custom system prompt when provided", async () => {
            // Arrange
            const customSystemPrompt = "You are a weather expert";

            // Act
            await generateTextWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                customSystemPrompt,
                tools: mockTools,
            });

            // Assert
            expect(ai.generateText).toHaveBeenCalledWith(
                expect.objectContaining({
                    system: customSystemPrompt,
                })
            );
        });

        it("should throw error when context is empty", async () => {
            // Arrange
            const emptyContext = "";

            // Act & Assert
            await expect(
                generateTextWithTools({
                    runtime: mockRuntime,
                    context: emptyContext,
                    modelClass: mockModelClass,
                    tools: mockTools,
                })
            ).rejects.toThrow("generateObject context is empty");
        });

        it("should throw error when model settings are not found", async () => {
            // Arrange
            (getModelSettings as any).mockReturnValue(null);

            // Act & Assert
            await expect(
                generateTextWithTools({
                    runtime: mockRuntime,
                    context: mockContext,
                    modelClass: mockModelClass,
                    tools: mockTools,
                })
            ).rejects.toThrow(
                `Model settings not found for provider: ${mockRuntime.modelProvider}`
            );
        });

        it("should meter tokens correctly", async () => {
            // Arrange
            const mockStep = {
                text: "Step result",
                usage: {
                    promptTokens: 100,
                    completionTokens: 50,
                },
                toolCalls: [],
                toolResults: [],
                finishReason: "stop",
            };

            // Setup generateText to capture the callback
            let onStepFinishCallback: Function | undefined;
            (ai.generateText as any).mockImplementation((options) => {
                onStepFinishCallback = options.onStepFinish;
                return Promise.resolve(mockGenerationResult);
            });

            // Act
            await generateTextWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                tools: mockTools,
            });

            // Call the captured callback
            if (onStepFinishCallback) {
                onStepFinishCallback(mockStep);
            }

            // Assert
            expect(mockRuntime.metering.trackPrompt).toHaveBeenCalledTimes(2);
            expect(mockRuntime.metering.trackPrompt).toHaveBeenCalledWith({
                tokens: mockStep.usage.promptTokens,
                model: mockModelSettings.name,
                type: "input",
            });
            expect(mockRuntime.metering.trackPrompt).toHaveBeenCalledWith({
                tokens: mockStep.usage.completionTokens,
                model: mockModelSettings.name,
                type: "output",
            });
        });

        it("should not initialize mcpManager or get mcpTools when enableGlobalMcp is false", async () => {
            // Act
            await generateTextWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                tools: mockTools,
                enableGlobalMcp: false,
            });

            // Assert
            expect(mockRuntime.mcpManager.initialize).not.toHaveBeenCalled();
            expect(
                mockRuntime.mcpManager.getToolsForClients
            ).not.toHaveBeenCalled();
            expect(mockRuntime.mcpManager.closeClients).not.toHaveBeenCalled(); // No clients initialized, so no clients to close
        });
    });

    describe("streamWithTools", () => {
        it("should stream text with tools successfully", () => {
            // Act
            const result = streamWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                tools: mockTools,
                message: mockMessage,
                functionId: "streamWithTools",
                tags: ["test"],
            });

            // Assert
            expect(result).toBe("mock-stream");
            expect(getModelSettings).toHaveBeenCalledWith(
                mockRuntime.modelProvider,
                mockModelClass
            );
            expect(buildGenerationSettings).toHaveBeenCalledWith(
                mockContext,
                mockModelSettings,
                mockMessage,
                "streamWithTools",
                ["test"]
            );
            expect(getModel).toHaveBeenCalledWith(
                mockRuntime.modelProvider,
                mockModelSettings.name
            );

            // Check that streamText is called with the right parameters without being too specific
            expect(ai.streamText).toHaveBeenCalled();
            const callArgs = (ai.streamText as any).mock.calls[0][0];
            expect(callArgs).toHaveProperty("model", "openai-model");
            expect(callArgs).toHaveProperty(
                "system",
                "You are a helpful assistant"
            );
            expect(callArgs).toHaveProperty("maxSteps", 5);
            expect(callArgs).toHaveProperty("experimental_continueSteps", true);
            expect(callArgs).toHaveProperty("toolCallStreaming", true);
            expect(callArgs).toHaveProperty("tools");
            expect(callArgs).toHaveProperty("onStepFinish");
            expect(callArgs).toHaveProperty("prompt", mockContext);
        });

        it("should use custom system prompt when provided for streaming", () => {
            // Arrange
            const customSystemPrompt = "You are a weather expert";

            // Act
            streamWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                customSystemPrompt,
                tools: mockTools,
            });

            // Assert
            expect(ai.streamText).toHaveBeenCalledWith(
                expect.objectContaining({
                    system: customSystemPrompt,
                })
            );
        });

        it("should use custom smoothStreamBy parameter", () => {
            // Arrange
            const smoothStreamBy = "line";

            // Act
            streamWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                tools: mockTools,
                smoothStreamBy,
            });

            // Assert
            expect(ai.smoothStream).toHaveBeenCalledWith({
                chunking: smoothStreamBy,
            });
        });

        it("should throw error when context is empty for streaming", () => {
            // Arrange
            const emptyContext = "";

            // Act & Assert
            expect(() =>
                streamWithTools({
                    runtime: mockRuntime,
                    context: emptyContext,
                    modelClass: mockModelClass,
                    tools: mockTools,
                })
            ).toThrow("generateObject context is empty");
        });

        it("should throw error when model settings are not found for streaming", () => {
            // Arrange
            (getModelSettings as any).mockReturnValue(null);

            // Act & Assert
            expect(() =>
                streamWithTools({
                    runtime: mockRuntime,
                    context: mockContext,
                    modelClass: mockModelClass,
                    tools: mockTools,
                })
            ).toThrow(
                `Model settings not found for provider: ${mockRuntime.modelProvider}`
            );
        });

        it("should log step information correctly", () => {
            // Arrange
            const mockStep = {
                text: "Step result",
                usage: {
                    promptTokens: 100,
                    completionTokens: 50,
                },
                toolCalls: ["tool1"],
                toolResults: ["result1"],
                finishReason: "stop",
            };

            // Setup streamText to capture the callback
            let onStepFinishCallback: Function | undefined;
            (ai.streamText as any).mockImplementation((options) => {
                onStepFinishCallback = options.onStepFinish;
                return "mock-stream";
            });

            // Act
            streamWithTools({
                runtime: mockRuntime,
                context: mockContext,
                modelClass: mockModelClass,
                tools: mockTools,
            });

            // Call the captured callback
            if (onStepFinishCallback) {
                onStepFinishCallback(mockStep);
            }

            // Assert
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "step: ",
                mockStep.text
            );
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "toolCalls: ",
                mockStep.toolCalls
            );
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "toolResults: ",
                mockStep.toolResults
            );
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "finishReason: ",
                mockStep.finishReason
            );
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "usage: ",
                mockStep.usage
            );
        });
    });
});
