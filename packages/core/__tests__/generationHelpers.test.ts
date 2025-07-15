import { describe, it, expect } from "vitest";
import {
    buildGenerationSettings,
    toTraceId,
} from "../src/generationHelpers.ts";
import type { ModelSettings, Memory, UUID } from "../src/types.ts";

describe("buildGenerationSettings", () => {
    const mockModelSettings: ModelSettings = {
        name: "test-model",
        maxInputTokens: 4000,
        maxOutputTokens: 2000,
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
        repetition_penalty: 0.7,
        stop: ["<|end|>", "STOP"],
        temperature: 0.8,
    };

    const mockMemory: Memory = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        userId: "550e8400-e29b-41d4-a716-446655440001",
        agentId: "550e8400-e29b-41d4-a716-446655440002",
        roomId: "550e8400-e29b-41d4-a716-446655440003",
        content: {
            text: "Test message",
        },
        createdAt: Date.now(),
    };

    describe("when called with required parameters only", () => {
        it("should return GenerationSettings with mapped model settings", () => {
            const context = "Test prompt context";

            const result = buildGenerationSettings(context, mockModelSettings);

            expect(result).toEqual({
                prompt: context,
                temperature: mockModelSettings.temperature,
                maxTokens: mockModelSettings.maxOutputTokens,
                frequencyPenalty: mockModelSettings.frequency_penalty,
                presencePenalty: mockModelSettings.presence_penalty,
                experimental_telemetry: {
                    isEnabled: true,
                    functionId: undefined,
                    metadata: {
                        tags: [],
                    },
                },
                stop: mockModelSettings.stop,
            });
        });

        it("should handle undefined optional penalties", () => {
            const modelSettingsWithoutPenalties: ModelSettings = {
                ...mockModelSettings,
                frequency_penalty: undefined,
                presence_penalty: undefined,
            };

            const result = buildGenerationSettings(
                "test",
                modelSettingsWithoutPenalties
            );

            expect(result.frequencyPenalty).toBeUndefined();
            expect(result.presencePenalty).toBeUndefined();
        });
    });

    describe("when called with functionId but no message", () => {
        it("should set functionId in telemetry", () => {
            const functionId = "test-function-123";

            const result = buildGenerationSettings(
                "test",
                mockModelSettings,
                undefined,
                functionId
            );

            expect(result.experimental_telemetry!.functionId).toBe(functionId);
            expect(result.experimental_telemetry!.metadata).toEqual({
                tags: [],
            });
        });
    });

    describe("when called with message but no functionId", () => {
        it("should set metadata and functionId with undefined prefix", () => {
            const result = buildGenerationSettings(
                "test",
                mockModelSettings,
                mockMemory
            );

            expect(result.experimental_telemetry!.functionId).toBe(undefined);
            expect(result.experimental_telemetry!.metadata).toEqual({
                langfuseTraceId: toTraceId(mockMemory.id as UUID),
                userId: mockMemory.userId,
                agentId: mockMemory.agentId,
                sessionId: mockMemory.id,
                roomId: mockMemory.roomId,
                tags: [mockMemory.agentId],
            });
        });
    });

    describe("when called with both message and functionId", () => {
        it("should combine functionId with message id and include metadata", () => {
            const functionId = "test-function";

            const result = buildGenerationSettings(
                "test",
                mockModelSettings,
                mockMemory,
                functionId
            );

            expect(result.experimental_telemetry!.functionId).toBe(functionId);
            expect(result.experimental_telemetry!.metadata).toEqual({
                langfuseTraceId: toTraceId(mockMemory.id as UUID),
                userId: mockMemory.userId,
                agentId: mockMemory.agentId,
                sessionId: mockMemory.id,
                roomId: mockMemory.roomId,
                tags: [mockMemory.agentId],
            });
        });
    });

    describe("when called with message without id", () => {
        it("should handle message without id gracefully", () => {
            const memoryWithoutId: Memory = {
                ...mockMemory,
                id: undefined,
            };
            const functionId = "test-function-789";

            const result = buildGenerationSettings(
                "test",
                mockModelSettings,
                memoryWithoutId,
                functionId
            );

            expect(result.experimental_telemetry!.functionId).toBe(functionId);
            expect(result.experimental_telemetry!.metadata).toEqual({
                langfuseTraceId: toTraceId(memoryWithoutId.id as UUID),
                userId: memoryWithoutId.userId,
                agentId: memoryWithoutId.agentId,
                sessionId: memoryWithoutId.id,
                roomId: memoryWithoutId.roomId,
                tags: [memoryWithoutId.agentId],
            });
        });
    });

    describe("edge cases", () => {
        it("should handle empty context string", () => {
            const result = buildGenerationSettings("", mockModelSettings);

            expect(result.prompt).toBe("");
        });

        it("should handle empty stop array", () => {
            const modelSettingsEmptyStop: ModelSettings = {
                ...mockModelSettings,
                stop: [],
            };

            const result = buildGenerationSettings(
                "test",
                modelSettingsEmptyStop
            );

            expect(result.stop).toEqual([]);
        });

        it("should handle zero temperature", () => {
            const modelSettingsZeroTemp: ModelSettings = {
                ...mockModelSettings,
                temperature: 0,
            };

            const result = buildGenerationSettings(
                "test",
                modelSettingsZeroTemp
            );

            expect(result.temperature).toBe(0);
        });

        it("should handle zero penalties", () => {
            const modelSettingsZeroPenalties: ModelSettings = {
                ...mockModelSettings,
                frequency_penalty: 0,
                presence_penalty: 0,
            };

            const result = buildGenerationSettings(
                "test",
                modelSettingsZeroPenalties
            );

            expect(result.frequencyPenalty).toBe(0);
            expect(result.presencePenalty).toBe(0);
        });
    });

    describe("telemetry configuration", () => {
        it("should always enable telemetry", () => {
            const result = buildGenerationSettings("test", mockModelSettings);

            expect(result.experimental_telemetry!.isEnabled).toBe(true);
        });

        it("should preserve all model settings properties", () => {
            const context = "Complex test prompt";

            const result = buildGenerationSettings(context, mockModelSettings);

            expect(result.prompt).toBe(context);
            expect(result.temperature).toBe(mockModelSettings.temperature);
            expect(result.maxTokens).toBe(mockModelSettings.maxOutputTokens);
            expect(result.frequencyPenalty).toBe(
                mockModelSettings.frequency_penalty
            );
            expect(result.presencePenalty).toBe(
                mockModelSettings.presence_penalty
            );
            expect(result.stop).toEqual(mockModelSettings.stop);
        });
    });
});
