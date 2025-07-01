import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { MessageHandler } from "../handlers/messageHandler";
import { DirectClient } from "../client";
import * as helpers from "../handlers/helpers";

// Mocking dependencies
vi.mock("../client");
vi.mock("../handlers/helpers");
vi.mock("@elizaos/core", async (importOriginal) => {
    const mod = await importOriginal<typeof import("@elizaos/core")>();
    return {
        ...mod,
        stringToUuid: vi.fn((input) => `mock-uuid-${input}`),
        elizaLogger: {
            log: vi.fn(),
            info: vi.fn(),
        },
    };
});

describe("MessageHandler", () => {
    let req: Partial<express.Request>;
    let res: Partial<express.Response>;
    let directClient: Partial<DirectClient>;
    let messageHandler: MessageHandler;

    beforeEach(() => {
        req = {
            params: { agentId: "testAgent" },
            body: { userName: "testUser", name: "Test Name" },
        };
        res = {
            setHeader: vi.fn(),
            write: vi.fn(),
            end: vi.fn(),
        };
        directClient = {
            getRuntime: vi.fn(
                () =>
                    ({
                        agentId: "testAgent",
                        ensureConnection: vi.fn(),
                        composeState: vi.fn(() =>
                            Promise.resolve("initialState")
                        ),
                        messageManager: {
                            createMemory: vi.fn(() => Promise.resolve()),
                        },
                        character: { name: "TestAgentName" },
                        updateRecentMessageState: vi.fn((state) =>
                            Promise.resolve(state)
                        ),
                        processActions: vi.fn(),
                        evaluate: vi.fn(),
                    }) as any
            ),
        };
        messageHandler = new MessageHandler(
            req as express.Request,
            res as express.Response,
            directClient as DirectClient
        );

        vi.clearAllMocks();
    });

    it("should set SSE headers", () => {
        messageHandler.setSseHeaders();
        expect(res.setHeader).toHaveBeenCalledWith(
            "Content-Type",
            "text/event-stream"
        );
        expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
        expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    });

    it("should handle stream error", () => {
        const error = new Error("Test Error");
        messageHandler.handleStreamError(error);
        expect(res.write).toHaveBeenCalledWith(
            `event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`
        );
        expect(res.end).toHaveBeenCalled();
    });

    it("should end the stream", () => {
        messageHandler.endStream();
        expect(res.write).toHaveBeenCalledWith(
            "event: end\ndata: stream completed\n\n"
        );
        expect(res.end).toHaveBeenCalled();
    });

    it("should initiate message processing", async () => {
        vi.mocked(helpers.genRoomId).mockReturnValue("testRoomId" as any);
        vi.mocked(helpers.genUserId).mockReturnValue("testUserId" as any);
        vi.mocked(helpers.composeContent).mockResolvedValue(
            "testContent" as any
        );

        const result = await messageHandler.initiateMessageProcessing();

        expect(result.roomId).toBe("testRoomId");
        expect(result.userId).toBe("testUserId");
        expect(result.runtime).toBeDefined();
        expect(result.agentId).toBe("testAgent");
        expect(result.userMessage).toEqual({
            content: "testContent",
            userId: "testUserId",
            roomId: "testRoomId",
            agentId: "testAgent",
        });
        expect(result.messageId).toMatch(/^mock-uuid-\d+$/);
        expect(result.memory).toBeDefined();
        expect(result.state).toBe("initialState");

        expect(directClient.getRuntime).toHaveBeenCalledWith("testAgent");
        expect(result.runtime.ensureConnection).toHaveBeenCalledWith(
            "testUserId",
            "testRoomId",
            "testUser",
            "Test Name",
            "direct"
        );
        expect(helpers.composeContent).toHaveBeenCalledWith(
            req,
            result.runtime
        );
        expect(
            result.runtime.messageManager.createMemory
        ).toHaveBeenCalledOnce();
        expect(result.runtime.composeState).toHaveBeenCalledWith(
            result.userMessage,
            { agentName: "TestAgentName" }
        );
    });
});
