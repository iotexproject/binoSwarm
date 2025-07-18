import { describe, it, expect, beforeEach, vi } from "vitest";
import { Request, Response } from "express";
import crypto from "crypto";
import type { Mock } from "vitest";

vi.mock("@elizaos/core", async () => {
    const actual = await vi.importActual("@elizaos/core");
    return {
        ...actual,
        getEnvVariable: vi.fn(),
        generateMessageResponse: vi.fn(),
        composeContext: vi.fn(),
        InteractionLogger: {
            logMessageReceived: vi.fn(),
            logAgentResponse: vi.fn(),
        },
        elizaLogger: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        },
    };
});

// Mock helpers module
vi.mock("./helpers", () => ({
    genResponse: vi.fn(),
}));

import {
    handleDiscourseWebhook,
    validateDiscourseWebhook,
    validateWebhookSignature,
    shouldProcessEvent,
} from "./discourse";
import { DiscourseMsgHandler } from "./discourseMsgHandler";
import {
    getEnvVariable,
    generateMessageResponse as _generateMessageResponse,
    composeContext as _composeContext,
    InteractionLogger as _InteractionLogger,
} from "@elizaos/core";
import { DirectClient } from "../client";
import { genResponse } from "./helpers";

const mockGetEnvVariable = getEnvVariable as any;

const mockDirectClient = {
    start: vi.fn(),
    stop: vi.fn(),
    getRuntime: vi.fn((agentId) => {
        if (agentId === "test-agent-id") {
            return {
                agentId: "test-agent-id",
                ensureConnection: vi.fn(),
                messageManager: {
                    createMemory: vi.fn(),
                },
                character: {
                    name: "TestAgent",
                    templates: {
                        directMessageHandlerTemplate: "Test template",
                        messageHandlerTemplate: "Test template",
                    },
                },
                composeState: vi.fn().mockResolvedValue({}),
                updateRecentMessageState: vi.fn().mockResolvedValue({}),
                processActions: vi.fn(),
                evaluate: vi.fn(),
            };
        }
        return null;
    }),
    upload: vi.fn(),
};

vi.mock("../client", () => ({
    DirectClient: vi.fn(() => mockDirectClient),
}));

describe("Discourse Webhook Handler", () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        // Reset all mocks
        vi.clearAllMocks();
    });

    describe("validateWebhookSignature", () => {
        const testSecret =
            "90aee7c4d0b18da33a963299007617d6b3c44e943537014c2fa2839d5a3273d6";
        const testPayload = { test: "data" };

        beforeEach(() => {
            mockGetEnvVariable.mockReturnValue(testSecret);
        });

        it("should validate correct signature", () => {
            const payloadString = JSON.stringify(testPayload);
            const expectedHash = crypto
                .createHmac("sha256", testSecret)
                .update(payloadString, "utf8")
                .digest("hex");
            const signature = `sha256=${expectedHash}`;

            expect(validateWebhookSignature(testPayload, signature)).toBe(true);
        });

        it("should reject incorrect signature", () => {
            const signature = "sha256=wronghash";
            expect(validateWebhookSignature(testPayload, signature)).toBe(
                false
            );
        });

        it("should reject malformed signature without sha256 prefix", () => {
            const signature = "invalidformat";
            expect(validateWebhookSignature(testPayload, signature)).toBe(
                false
            );
        });

        it("should allow through when no secret is configured", () => {
            mockGetEnvVariable.mockReturnValue(null);
            const signature = "sha256=anyhash";
            expect(validateWebhookSignature(testPayload, signature)).toBe(true);
        });

        it("should handle signature validation errors gracefully", () => {
            const signature = "sha256=invalidhexformat!@#";
            expect(validateWebhookSignature(testPayload, signature)).toBe(
                false
            );
        });

        it("should validate the provided test signature", () => {
            // Test that our signature generation works correctly with the provided secret
            const payloadString = JSON.stringify(testPayload);
            const generatedHash = crypto
                .createHmac("sha256", testSecret)
                .update(payloadString, "utf8")
                .digest("hex");
            const generatedSignature = `sha256=${generatedHash}`;

            expect(
                validateWebhookSignature(testPayload, generatedSignature)
            ).toBe(true);
        });
    });

    describe("validateDiscourseWebhook", () => {
        const testSecret =
            "90aee7c4d0b18da33a963299007617d6b3c44e943537014c2fa2839d5a3273d6";

        beforeEach(() => {
            mockGetEnvVariable.mockReturnValue(testSecret);
        });

        it("should validate webhook with correct signature", () => {
            const payloadString = JSON.stringify(mockPostCreatedPayload);
            const expectedHash = crypto
                .createHmac("sha256", testSecret)
                .update(payloadString, "utf8")
                .digest("hex");
            const signature = `sha256=${expectedHash}`;

            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "post",
                    "x-discourse-event": "post_created",
                    "x-discourse-event-signature": signature,
                },
                body: mockPostCreatedPayload,
                params: { agentId: "test-agent-id" },
            };

            const result = validateDiscourseWebhook(mockReq as Request);

            expect(result.eventType).toBe("post_created");
            expect(result.instance).toBe("https://community.example.com");
            expect(result.eventId).toBe("12345");
            expect(result.payload.post.id).toBe(12345);
        });

        it("should throw error for invalid signature", () => {
            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "post",
                    "x-discourse-event": "post_created",
                    "x-discourse-event-signature": "sha256=invalidsignature",
                },
                body: mockPostCreatedPayload,
                params: { agentId: "test-agent-id" },
            };

            expect(() => validateDiscourseWebhook(mockReq as Request)).toThrow(
                "Invalid webhook signature"
            );
        });

        it("should validate any webhook with required headers when no secret configured", () => {
            mockGetEnvVariable.mockReturnValue(null);

            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "topic",
                    "x-discourse-event": "topic_created",
                    "x-discourse-event-signature": "sha256=any-signature",
                },
                body: { topic: { id: 123 } },
                params: { agentId: "test-agent-id" },
            };

            const result = validateDiscourseWebhook(mockReq as Request);

            expect(result.eventType).toBe("topic_created");
            expect(result.instance).toBe("https://community.example.com");
            expect(result.eventId).toBe("12345");
        });

        it("should throw error for missing headers", () => {
            mockReq = {
                headers: {},
                body: {},
                params: { agentId: "test-agent-id" },
            };

            expect(() => validateDiscourseWebhook(mockReq as Request)).toThrow(
                "Missing required Discourse webhook headers"
            );
        });
    });

    describe("shouldProcessEvent", () => {
        it("should process post_created events for original posts", () => {
            const webhookData = {
                eventType: "post_created" as const,
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: mockPostCreatedPayload,
            };

            expect(shouldProcessEvent(webhookData)).toBe(true);
        });

        it("should skip unsupported event types", () => {
            const webhookData = {
                eventType: "topic_created",
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: mockPostCreatedPayload,
            };

            expect(shouldProcessEvent(webhookData)).toBe(false);
        });

        it("should skip post_updated event type", () => {
            const webhookData = {
                eventType: "post_updated",
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: mockPostCreatedPayload,
            };

            expect(shouldProcessEvent(webhookData)).toBe(false);
        });

        it("should process post events for replies (let LLM decide)", () => {
            const replyPayload = {
                ...mockPostCreatedPayload,
                post: {
                    ...mockPostCreatedPayload.post,
                    post_number: 2,
                    reply_to_post_number: 1,
                },
            };

            const webhookData = {
                eventType: "post_created" as const,
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: replyPayload,
            };

            expect(shouldProcessEvent(webhookData)).toBe(true);
        });

        it("should skip deleted posts", () => {
            const deletedPayload = {
                ...mockPostCreatedPayload,
                post: {
                    ...mockPostCreatedPayload.post,
                    deleted_at: "2025-01-15T19:00:00.000Z",
                },
            };

            const webhookData = {
                eventType: "post_created" as const,
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: deletedPayload,
            };

            expect(shouldProcessEvent(webhookData)).toBe(false);
        });

        it("should skip hidden posts", () => {
            const hiddenPayload = {
                ...mockPostCreatedPayload,
                post: {
                    ...mockPostCreatedPayload.post,
                    hidden: true,
                },
            };

            const webhookData = {
                eventType: "post_created" as const,
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: hiddenPayload,
            };

            expect(shouldProcessEvent(webhookData)).toBe(false);
        });

        it("should process posts from staff members (let LLM decide)", () => {
            const staffPayload = {
                ...mockPostCreatedPayload,
                post: {
                    ...mockPostCreatedPayload.post,
                    staff: true,
                    admin: true,
                },
            };

            const webhookData = {
                eventType: "post_created" as const,
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: staffPayload,
            };

            expect(shouldProcessEvent(webhookData)).toBe(true);
        });

        it("should process short posts (let LLM decide)", () => {
            const shortPayload = {
                ...mockPostCreatedPayload,
                post: {
                    ...mockPostCreatedPayload.post,
                    raw: "Hi",
                },
            };

            const webhookData = {
                eventType: "post_created" as const,
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: shortPayload,
            };

            expect(shouldProcessEvent(webhookData)).toBe(true);
        });
    });

    describe("handleDiscourseWebhook", () => {
        const testSecret =
            "90aee7c4d0b18da33a963299007617d6b3c44e943537014c2fa2839d5a3273d6";

        beforeEach(() => {
            mockGetEnvVariable.mockReturnValue(testSecret);
            // Mock genResponse to return a test response
            vi.mocked(genResponse).mockResolvedValue({
                response: {
                    text: "Test response from agent",
                    action: "CONTINUE",
                },
                context: "test context",
            });
        });

        it("should process valid webhook and return success", async () => {
            const payloadString = JSON.stringify(mockPostCreatedPayload);
            const expectedHash = crypto
                .createHmac("sha256", testSecret)
                .update(payloadString, "utf8")
                .digest("hex");
            const signature = `sha256=${expectedHash}`;

            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "post",
                    "x-discourse-event": "post_created",
                    "x-discourse-event-signature": signature,
                },
                body: mockPostCreatedPayload,
                params: { agentId: "test-agent-id" },
            };

            const mockDirectClient = new DirectClient();
            await handleDiscourseWebhook(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient
            );

            expect(mockRes.json).toHaveBeenCalledWith({ status: "processed" });
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it("should ignore events that should not be processed", async () => {
            const deletedPayload = {
                ...mockPostCreatedPayload,
                post: {
                    ...mockPostCreatedPayload.post,
                    deleted_at: "2025-01-15T19:00:00.000Z",
                },
            };

            const payloadString = JSON.stringify(deletedPayload);
            const expectedHash = crypto
                .createHmac("sha256", testSecret)
                .update(payloadString, "utf8")
                .digest("hex");
            const signature = `sha256=${expectedHash}`;

            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "post",
                    "x-discourse-event": "post_created",
                    "x-discourse-event-signature": signature,
                },
                body: deletedPayload,
                params: { agentId: "test-agent-id" },
            };

            await handleDiscourseWebhook(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient as any
            );

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                status: "ignored",
                reason: "Event filtered out",
            });
        });

        it("should return 500 for missing headers", async () => {
            mockReq = {
                headers: {},
                body: {},
                params: { agentId: "test-agent-id" },
            };

            await handleDiscourseWebhook(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient as any
            );

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: "Missing required Discourse webhook headers",
            });
        });

        it("should return bad request for missing agentId", async () => {
            mockReq = {
                headers: {},
                body: {},
                params: {},
            };

            await handleDiscourseWebhook(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient as any
            );

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: "Agent ID is required",
            });
        });

        it("should return 401 for invalid signature", async () => {
            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "post",
                    "x-discourse-event": "post_created",
                    "x-discourse-event-signature": "sha256=invalidsignature",
                },
                body: mockPostCreatedPayload,
                params: { agentId: "test-agent-id" },
            };

            await handleDiscourseWebhook(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient as any
            );

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: "Invalid webhook signature",
            });
        });

        it("should return 404 for missing agent runtime", async () => {
            mockGetEnvVariable.mockReturnValue(null);
            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "post",
                    "x-discourse-event": "post_created",
                    "x-discourse-event-signature": "sha256=test",
                },
                body: mockPostCreatedPayload,
                params: { agentId: "non-existent-agent-id" },
            };

            await handleDiscourseWebhook(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient as any
            );

            expect(mockRes.json).toHaveBeenCalledWith({
                error: "Agent runtime not found",
            });
            expect(mockRes.status).toHaveBeenCalledWith(404);
        });

        it("should return 200 for unsupported event types", async () => {
            const topicPayload = { topic: { id: 123 } };
            const payloadString = JSON.stringify(topicPayload);
            const expectedHash = crypto
                .createHmac("sha256", testSecret)
                .update(payloadString, "utf8")
                .digest("hex");
            const signature = `sha256=${expectedHash}`;

            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "topic",
                    "x-discourse-event": "topic_created",
                    "x-discourse-event-signature": signature,
                },
                body: topicPayload,
                params: { agentId: "test-agent-id" },
            };

            await handleDiscourseWebhook(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient as any
            );

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({
                status: "ignored",
                reason: "Event filtered out",
            });
        });
    });
});

// Simplified test data matching our cleaned interface
const mockPostCreatedPayload = {
    post: {
        id: 12345,
        username: "testuser123",
        created_at: "2025-01-15T18:45:15.444Z",
        raw: "How does IoTeX's DID system work? I'm trying to understand the technical implementation and how it differs from other identity solutions. Any documentation or examples would be helpful.",
        post_number: 1,
        topic_id: 12345,
        topic_slug: "how-does-iotex-did-system-work",
        topic_title: "How does IoTeX DID system work?",
        category_id: 75,
        category_slug: "technical-discussion",
        user_id: 5678,
        moderator: false,
        admin: false,
        staff: false,
        hidden: false,
        deleted_at: null,
        user_deleted: false,
    },
};

describe("DiscourseMsgHandler", () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockDirectClient: Partial<DirectClient>;
    let handler: DiscourseMsgHandler;

    beforeEach(() => {
        mockReq = {
            headers: {},
            body: {},
            params: { agentId: "test-agent-id" },
        };

        mockRes = {
            status: vi.fn().mockReturnThis() as Mock,
            json: vi.fn().mockReturnThis() as Mock,
        };

        mockDirectClient = new DirectClient();

        handler = new DiscourseMsgHandler(
            mockReq as Request,
            mockRes as Response,
            mockDirectClient as DirectClient
        );
    });

    describe("constructor", () => {
        it("should create instance with required dependencies", () => {
            expect(handler).toBeInstanceOf(DiscourseMsgHandler);
            expect(handler["req"]).toBe(mockReq);
            expect(handler["res"]).toBe(mockRes);
            expect(handler["directClient"]).toBe(mockDirectClient);
        });
    });

    describe("initializeDiscourseProcessing", () => {
        it("should initialize basic processing components", async () => {
            const webhookData = {
                eventType: "post_created",
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: {
                    post: {
                        id: 1,
                        username: "testuser",
                        created_at: "2025-01-15T19:00:00.000Z",
                        raw: "How does IoTeX DID work?",
                        topic_id: 123,
                        topic_slug: "test-question",
                        topic_title: "Test Question",
                        category_id: 1,
                        category_slug: "general",
                        user_id: 5678,
                        post_number: 1,
                        moderator: false,
                        admin: false,
                        staff: false,
                        deleted_at: null,
                        user_deleted: false,
                        hidden: false,
                    },
                },
            };

            const result =
                await handler.initiateDiscourseProcessing(webhookData);

            expect(result).toHaveProperty("roomId");
            expect(result).toHaveProperty("userId");
            expect(result).toHaveProperty("runtime");
            expect(result).toHaveProperty("agentId");
            expect(result).toHaveProperty("content");
            expect(result).toHaveProperty("messageId");
            expect(result).toHaveProperty("memory");
            expect(result).toHaveProperty("state");
            expect(result).toHaveProperty("userMessage");

            expect(mockDirectClient.getRuntime).toHaveBeenCalledWith(
                "test-agent-id"
            );
        });

        it("should generate discourse-specific roomId from topic_id", async () => {
            const webhookData = {
                eventType: "post_created",
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: {
                    post: {
                        id: 1,
                        username: "testuser",
                        created_at: "2025-01-15T19:00:00.000Z",
                        raw: "Test question",
                        topic_id: 456,
                        topic_slug: "test-question",
                        topic_title: "Test Question",
                        category_id: 1,
                        category_slug: "general",
                        user_id: 5678,
                        post_number: 1,
                        moderator: false,
                        admin: false,
                        staff: false,
                        deleted_at: null,
                        user_deleted: false,
                        hidden: false,
                    },
                },
            };

            const result =
                await handler.initiateDiscourseProcessing(webhookData);

            expect(typeof result.roomId).toBe("string");
            expect(result.roomId).toMatch(/^[0-9a-f-]+$/); // UUID format
        });

        it("should generate userId from username", async () => {
            const webhookData = {
                eventType: "post_created",
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: {
                    post: {
                        id: 1,
                        username: "discourse_user",
                        created_at: "2025-01-15T19:00:00.000Z",
                        raw: "Test question",
                        topic_id: 123,
                        topic_slug: "test-question",
                        topic_title: "Test Question",
                        category_id: 1,
                        category_slug: "general",
                        user_id: 5678,
                        post_number: 1,
                        moderator: false,
                        admin: false,
                        staff: false,
                        deleted_at: null,
                        user_deleted: false,
                        hidden: false,
                    },
                },
            };

            const result =
                await handler.initiateDiscourseProcessing(webhookData);

            expect(typeof result.userId).toBe("string");
            expect(result.userId).toMatch(/^[0-9a-f-]+$/); // UUID format
        });

        it("should create proper content from post data", async () => {
            const webhookData = {
                eventType: "post_created",
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: {
                    post: {
                        id: 1,
                        username: "testuser",
                        created_at: "2025-01-15T19:00:00.000Z",
                        raw: "How does IoTeX DID identity system work with blockchain?",
                        topic_id: 123,
                        topic_slug: "test-question",
                        topic_title: "IoTeX DID Question",
                        category_id: 1,
                        category_slug: "general",
                        user_id: 5678,
                        post_number: 1,
                        moderator: false,
                        admin: false,
                        staff: false,
                        deleted_at: null,
                        user_deleted: false,
                        hidden: false,
                    },
                },
            };

            const result =
                await handler.initiateDiscourseProcessing(webhookData);

            expect(result.content).toHaveProperty(
                "text",
                "How does IoTeX DID identity system work with blockchain?"
            );
            expect(result.content).toHaveProperty("source", "discourse");
            expect(result.content).toHaveProperty("attachments", []);
        });
    });
});

describe("handle function", () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockDirectClient: any;
    let mockWebhookData: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockReq = {
            headers: {
                "x-discourse-instance": "https://community.example.com",
                "x-discourse-event-id": "12345",
                "x-discourse-event-type": "post",
                "x-discourse-event": "post_created",
            },
            body: mockPostCreatedPayload,
            params: { agentId: "test-agent-id" },
        };

        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };

        mockDirectClient = {
            getRuntime: vi.fn().mockReturnValue({
                agentId: "test-agent-id",
                ensureConnection: vi.fn(),
                messageManager: {
                    createMemory: vi.fn(),
                },
                character: {
                    name: "TestAgent",
                    templates: {
                        directMessageHandlerTemplate: "Test template",
                    },
                },
                composeState: vi.fn().mockResolvedValue({ test: "state" }),
                updateRecentMessageState: vi.fn().mockResolvedValue({}),
                processActions: vi.fn(),
                evaluate: vi.fn(),
            }),
        };

        mockWebhookData = {
            eventType: "post_created" as const,
            instance: "https://community.example.com",
            eventId: "12345",
            signature: "sha256=test",
            payload: mockPostCreatedPayload,
        };

        // Mock genResponse to return a test response
        vi.mocked(genResponse).mockResolvedValue({
            response: {
                text: "Test response from agent",
                action: "CONTINUE",
            },
            context: "test context",
        });
    });

    it("should successfully process discourse webhook", async () => {
        const { handle } = await import("./discourse");

        await handle(
            mockReq as Request,
            mockRes as Response,
            mockDirectClient,
            mockWebhookData
        );

        // Verify InteractionLogger was called for message received
        expect(_InteractionLogger.logMessageReceived).toHaveBeenCalledWith({
            client: "direct",
            agentId: "test-agent-id",
            userId: expect.any(String),
            roomId: expect.any(String),
            messageId: expect.any(String),
        });

        // Verify genResponse was called
        expect(genResponse).toHaveBeenCalledWith(
            expect.objectContaining({
                agentId: "test-agent-id",
                character: expect.objectContaining({
                    name: "TestAgent",
                }),
            }),
            expect.objectContaining({ test: "state" }),
            expect.objectContaining({
                content: expect.objectContaining({
                    text: expect.stringContaining("IoTeX"),
                }),
            })
        );

        // Verify InteractionLogger was called for agent response
        expect(_InteractionLogger.logAgentResponse).toHaveBeenCalledWith({
            client: "direct",
            agentId: "test-agent-id",
            userId: expect.any(String),
            roomId: expect.any(String),
            messageId: expect.any(String),
            status: "sent",
        });

        // Verify both memories were created (user message and agent response)
        expect(
            mockDirectClient.getRuntime().messageManager.createMemory
        ).toHaveBeenCalledTimes(2);
    });

    it("should handle genResponse throwing an error", async () => {
        vi.mocked(genResponse).mockRejectedValue(
            new Error("Generation failed")
        );

        const { handle } = await import("./discourse");

        await expect(
            handle(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient,
                mockWebhookData
            )
        ).rejects.toThrow("Generation failed");

        // Verify that memory creation was still attempted for user message
        expect(
            mockDirectClient.getRuntime().messageManager.createMemory
        ).toHaveBeenCalledTimes(1);
    });

    it("should handle runtime methods throwing errors", async () => {
        mockDirectClient.getRuntime().messageManager.createMemory = vi
            .fn()
            .mockRejectedValueOnce(new Error("Memory creation failed"))
            .mockResolvedValueOnce(undefined);

        const { handle } = await import("./discourse");

        await expect(
            handle(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient,
                mockWebhookData
            )
        ).rejects.toThrow("Memory creation failed");
    });

    it("should create proper response message structure", async () => {
        const { handle } = await import("./discourse");

        await handle(
            mockReq as Request,
            mockRes as Response,
            mockDirectClient,
            mockWebhookData
        );

        const createMemoryCalls =
            mockDirectClient.getRuntime().messageManager.createMemory.mock
                .calls;

        // Check the response message (second call)
        const responseMemoryCall = createMemoryCalls[1];
        const responseMemory = responseMemoryCall[0].memory;

        expect(responseMemory).toMatchObject({
            id: expect.any(String),
            userId: "test-agent-id", // Should be agent ID for response
            content: {
                text: "Test response from agent",
                action: "CONTINUE",
            },
            createdAt: expect.any(Number),
        });
    });

    it("should log console message about response", async () => {
        const consoleSpy = vi
            .spyOn(console, "log")
            .mockImplementation(() => {});

        const { handle } = await import("./discourse");

        await handle(
            mockReq as Request,
            mockRes as Response,
            mockDirectClient,
            mockWebhookData
        );

        expect(consoleSpy).toHaveBeenCalledWith(
            "The agent would have responded with:",
            {
                text: "Test response from agent",
                action: "CONTINUE",
            }
        );

        consoleSpy.mockRestore();
    });

    it("should handle InteractionLogger errors gracefully", async () => {
        // Mock InteractionLogger to throw an error
        vi.mocked(_InteractionLogger.logMessageReceived).mockImplementation(
            () => {
                throw new Error("Logging failed");
            }
        );

        const { handle } = await import("./discourse");

        // Should still complete despite logging error
        await expect(
            handle(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient,
                mockWebhookData
            )
        ).rejects.toThrow("Logging failed");
    });
});
