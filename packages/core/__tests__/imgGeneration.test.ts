import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { generateImage } from "../src/imgGeneration";
import * as ai from "ai";
import * as openaiModule from "@ai-sdk/openai";
import { getImageModelSettings } from "../src/models";
import { elizaLogger } from "../src/index";
import type { IAgentRuntime } from "../src/types";

// Mock dependencies
vi.mock("ai", () => ({
    experimental_generateImage: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
    openai: {
        image: vi.fn(),
    },
}));

vi.mock("../src/models", () => ({
    getImageModelSettings: vi.fn(),
}));

vi.mock("../src/index", () => ({
    elizaLogger: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe("Image Generation", () => {
    let mockRuntime: IAgentRuntime;
    let mockModelSettings: { name: string };
    let mockImage: { base64: string };

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Setup mock runtime
        mockRuntime = {
            imageModelProvider: "openai",
            metering: {
                createEvent: vi.fn().mockReturnValue({ id: "mock-event-id" }),
                track: vi.fn(),
            },
        } as unknown as IAgentRuntime;

        // Setup mock model settings
        mockModelSettings = { name: "dall-e-3" };
        (getImageModelSettings as any).mockReturnValue(mockModelSettings);

        // Setup mock image response
        mockImage = { base64: "base64-encoded-image-data" };
        (ai.experimental_generateImage as any).mockResolvedValue({
            image: mockImage,
        });

        // Setup openai mock
        (openaiModule.openai.image as any).mockReturnValue(
            "openai-image-model"
        );
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it("should generate an image successfully with default size", async () => {
        // Arrange
        const data = {
            prompt: "A beautiful sunset over mountains",
            width: 1024,
            height: 1024,
        };

        // Act
        const result = await generateImage(data, mockRuntime);

        // Assert
        expect(result.success).toBe(true);
        expect(result.data).toEqual([mockImage.base64]);
        expect(getImageModelSettings).toHaveBeenCalledWith(
            mockRuntime.imageModelProvider
        );
        expect(openaiModule.openai.image).toHaveBeenCalledWith(
            mockModelSettings.name
        );
        expect(ai.experimental_generateImage).toHaveBeenCalledWith({
            model: "openai-image-model",
            prompt: data.prompt,
            size: "1024x1024",
        });
        expect(elizaLogger.info).toHaveBeenCalledWith(
            "Generating image with options:",
            { imageModelProvider: mockModelSettings.name }
        );
        expect(mockRuntime.metering.createEvent).toHaveBeenCalledWith({
            type: "image",
            data: {
                model: mockModelSettings.name,
                size: "1024x1024",
            },
        });
        expect(mockRuntime.metering.track).toHaveBeenCalled();
    });

    it("should use 1024x1024 when dimensions are not supported", async () => {
        // Arrange
        const data = {
            prompt: "A beautiful sunset over mountains",
            width: 800, // Unsupported width
            height: 600, // Unsupported height
        };

        // Act
        const result = await generateImage(data, mockRuntime);

        // Assert
        expect(result.success).toBe(true);
        expect(ai.experimental_generateImage).toHaveBeenCalledWith({
            model: "openai-image-model",
            prompt: data.prompt,
            size: "1024x1024", // Should default to this size
        });
    });

    it("should support 1792x1024 dimension", async () => {
        // Arrange
        const data = {
            prompt: "A beautiful landscape in wide format",
            width: 1792,
            height: 1024,
        };

        // Act
        const result = await generateImage(data, mockRuntime);

        // Assert
        expect(result.success).toBe(true);
        expect(ai.experimental_generateImage).toHaveBeenCalledWith({
            model: "openai-image-model",
            prompt: data.prompt,
            size: "1792x1024",
        });
    });

    it("should support 1024x1792 dimension", async () => {
        // Arrange
        const data = {
            prompt: "A beautiful portrait in tall format",
            width: 1024,
            height: 1792,
        };

        // Act
        const result = await generateImage(data, mockRuntime);

        // Assert
        expect(result.success).toBe(true);
        expect(ai.experimental_generateImage).toHaveBeenCalledWith({
            model: "openai-image-model",
            prompt: data.prompt,
            size: "1024x1792",
        });
    });

    it("should handle errors and return failure result", async () => {
        // Arrange
        const data = {
            prompt: "A beautiful sunset over mountains",
            width: 1024,
            height: 1024,
        };

        const error = new Error("API error");
        (ai.experimental_generateImage as any).mockRejectedValue(error);

        // Act
        const result = await generateImage(data, mockRuntime);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe(error);
        expect(elizaLogger.error).toHaveBeenCalledWith(error);
    });
});
