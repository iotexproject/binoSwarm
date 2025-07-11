import { describe, it, expect, vi, beforeEach } from "vitest";
import { mcpAction } from "../src/actions/call_mcp";
import * as core from "@elizaos/core";
import { ModelClass } from "@elizaos/core";

describe("mcpAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should return true if mcpTools are available in runtime", async () => {
        const runtime = {
            mcpTools: {
                tool1: {},
                tool2: {},
            },
            character: {
                mcpServers: {
                    tool1: {},
                    tool2: {},
                },
            },
        } as any;

        const result = await mcpAction.validate(runtime, null as any);
        expect(result).toBe(true);
    });

    it("should return false if mcpTools are not available in runtime", async () => {
        const runtime = {
            character: {
                mcpServers: {},
            },
        } as any;

        const result = await mcpAction.validate(runtime, null as any);
        expect(result).toBe(false);
    });

    describe("handler", () => {
        it("should call callback with successful response", async () => {
            const mockMessage = { id: "123" } as any;
            const mockState = { some: "state" } as any;
            const mockResult = "Generated text";
            const mockCallback = vi.fn();
            const mockOptions = {
                tags: [],
            };

            const runtime = {
                composeState: vi.fn().mockResolvedValue(mockState),
                updateRecentMessageState: vi.fn().mockResolvedValue(mockState),
                mcpTools: {},
            } as any;

            vi.spyOn(core, "generateTextWithTools").mockResolvedValue(
                mockResult
            );

            const result = await mcpAction.handler(
                runtime,
                mockMessage,
                null as any,
                mockOptions,
                mockCallback
            );

            expect(runtime.composeState).toHaveBeenCalledWith(mockMessage);
            expect(core.generateTextWithTools).toHaveBeenCalledWith({
                runtime,
                context: expect.any(String),
                modelClass: ModelClass.LARGE,
                tools: [],
                message: mockMessage,
                functionId: "CALL_MCP_TOOLS",
                tags: mockOptions.tags,
            });
            expect(mockCallback).toHaveBeenCalledWith({
                text: mockResult,
                inReplyTo: mockMessage.id,
            });
            expect(result).toBe(true);
        });

        it("should call callback with error message on failure", async () => {
            const mockMessage = { id: "123" } as any;
            const mockCallback = vi.fn();
            const mockOptions = {
                tags: [],
            };
            const runtime = {
                composeState: vi.fn().mockResolvedValue({}),
                updateRecentMessageState: vi.fn().mockResolvedValue({}),
                mcpTools: {},
            } as any;

            vi.spyOn(core, "generateTextWithTools").mockRejectedValue(
                new Error("Generation failed")
            );

            const result = await mcpAction.handler(
                runtime,
                mockMessage,
                null as any,
                mockOptions,
                mockCallback
            );

            expect(runtime.composeState).toHaveBeenCalled();
            expect(core.generateTextWithTools).toHaveBeenCalled();
            expect(mockCallback).toHaveBeenCalledWith({
                text: "Could not call MCP Tools for ya, try rephrasing your question.",
                inReplyTo: mockMessage.id,
            });
            expect(result).toBe(false);
        });
    });
});
