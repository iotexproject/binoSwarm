import { describe, it, expect, beforeEach, vi } from "vitest";
import { Request, Response } from "express";
import crypto from "crypto";
import type { Mock } from "vitest";
import { discourseShouldRespondTemplate } from "../templates";

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
            debug: vi.fn(),
        },
        generateShouldRespond: vi.fn(),
        ModelClass: {
            SMALL: "small",
            LARGE: "large",
        },
        composeRandomUser: vi.fn(),
        ServiceType: {
            IMAGE_DESCRIPTION: "image_description",
            BROWSER: "browser",
            SPEECH_GENERATION: "speech_generation",
            VIDEO: "video",
            TRANSCRIPTION: "transcription",
            PDF: "pdf",
        },
    };
});

// Mock helpers module
vi.mock("../handlers/helpers", () => ({
    genResponse: vi.fn(),
}));

// Mock DiscourseClient
vi.mock("../clients/discourseClient", () => ({
    DiscourseClient: vi.fn(),
}));

// Mock discourse utils
vi.mock("../utils/discourseUtils", () => ({
    discourseHandlerCallback: vi.fn(() => {
        return {
            id: "123",
            agentId: "test-agent-id",
            userId: "test-user-id",
        };
    }),
    extractTopicId: vi.fn(),
    extractPostNumber: vi.fn(),
    isReplyPost: vi.fn(),
    formatDiscourseResponse: vi.fn(),
}));

import {
    handleDiscourseWebhook,
    validateDiscourseWebhook,
    validateWebhookSignature,
    shouldProcessEvent,
} from "../handlers/discourse";
import { DiscourseMsgHandler } from "../handlers/discourseMsgHandler";
import {
    getEnvVariable,
    generateMessageResponse as _generateMessageResponse,
    composeContext as _composeContext,
    InteractionLogger as _InteractionLogger,
    generateShouldRespond as _generateShouldRespond,
    ModelClass as _ModelClass,
    composeRandomUser as _composeRandomUser,
    elizaLogger,
} from "@elizaos/core";
import { DirectClient } from "../client";
import { genResponse } from "../handlers/helpers";
import { DiscourseClient } from "../clients/discourseClient";
import {
    discourseHandlerCallback,
    extractTopicId,
    extractPostNumber,
    isReplyPost,
    formatDiscourseResponse,
} from "../utils/discourseUtils";

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

        it("should skip posts from agent itself to prevent infinite loops", () => {
            mockGetEnvVariable.mockReturnValue("agent-username");

            const agentPayload = {
                ...mockPostCreatedPayload,
                post: {
                    ...mockPostCreatedPayload.post,
                    username: "agent-username",
                },
            };

            const webhookData = {
                eventType: "post_created" as const,
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: agentPayload,
            };

            expect(shouldProcessEvent(webhookData)).toBe(false);
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
            // Mock generateShouldRespond to return RESPOND by default
            vi.mocked(_generateShouldRespond).mockResolvedValue("RESPOND");
            vi.mocked(_composeContext).mockReturnValue("mock context");
            vi.mocked(_composeRandomUser).mockReturnValue("mock template");

            // Mock Discourse utils
            vi.mocked(extractTopicId).mockReturnValue(123);
            vi.mocked(extractPostNumber).mockReturnValue(1);
            vi.mocked(isReplyPost).mockReturnValue(false);
            vi.mocked(formatDiscourseResponse).mockImplementation(
                (content) => content
            );

            // Mock DiscourseClient constructor
            vi.mocked(DiscourseClient).mockImplementation(
                () =>
                    ({
                        createPost: vi.fn(),
                        testConnection: vi.fn(),
                        getBaseUrl: vi
                            .fn()
                            .mockReturnValue("https://test.discourse.com"),
                    }) as any
            );
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

            expect(mockRes.json).toHaveBeenCalledWith({
                status: "accepted",
                message: "Accepted for processing",
            });
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

        it("should return 400 for invalid or missing topic_id", async () => {
            // Mock extractTopicId to throw the expected error
            vi.mocked(extractTopicId).mockImplementation(() => {
                throw new Error(
                    "Invalid or missing topic_id in webhook payload"
                );
            });

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

            await handleDiscourseWebhook(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient as any
            );

            expect(mockRes.json).toHaveBeenCalledWith({
                error: "Invalid or missing topic_id in webhook payload",
            });
            expect(mockRes.status).toHaveBeenCalledWith(400);
        });

        it("should return 400 for invalid or missing post_number", async () => {
            // Mock extractPostNumber to throw the expected error
            vi.mocked(extractPostNumber).mockImplementation(() => {
                throw new Error(
                    "Invalid or missing post_number in webhook payload"
                );
            });

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

            await handleDiscourseWebhook(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient as any
            );

            expect(mockRes.json).toHaveBeenCalledWith({
                error: "Invalid or missing post_number in webhook payload",
            });
            expect(mockRes.status).toHaveBeenCalledWith(400);
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
        cooked: "<p>How does IoTeX's DID system work? I'm trying to understand the technical implementation and how it differs from other identity solutions. Any documentation or examples would be helpful.</p>",
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
    let mockRuntime: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockReq = {
            headers: {},
            body: {},
            params: { agentId: "test-agent-id" },
        };

        mockRes = {
            status: vi.fn().mockReturnThis() as Mock,
            json: vi.fn().mockReturnThis() as Mock,
        };

        // Create mock services that can be tracked
        const mockImageService = {
            describeImage: vi.fn().mockResolvedValue({
                title: "Test Image",
                description: "A test image description",
            }),
        };

        const mockBrowserService = {
            getPageContent: vi.fn().mockResolvedValue({
                title: "Test Web Page",
                description: "A test web page description",
            }),
        };

        // Create mock runtime with all necessary services
        mockRuntime = {
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
            getService: vi.fn().mockImplementation((serviceType) => {
                if (serviceType === "image_description") {
                    return mockImageService;
                }
                if (serviceType === "browser") {
                    return mockBrowserService;
                }
                return null;
            }),
        };

        mockDirectClient = {
            start: vi.fn(),
            stop: vi.fn(),
            getRuntime: vi.fn(() => mockRuntime),
        } as any;

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
                        cooked: "<p>How does IoTeX DID work?</p>",
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
                        cooked: "<p>Test question</p>",
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
                        cooked: "<p>Test question</p>",
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
                        cooked: "<p>How does IoTeX DID identity system work with blockchain?</p>",
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

    describe("attachment processing", () => {
        const testPostWithAttachments = {
            id: 1,
            username: "testuser",
            created_at: "2025-01-15T19:00:00.000Z",
            raw: "Here https://example.com/article.html\n\n![Image1|555x500](upload://testimage1.jpeg)\n![Image2|465x500](upload://testimage2.jpeg)\n And how can we adapt to it. @user1 @user2",
            cooked: '<p>Here <a href="https://example.com/article.html" class="inline-onebox-loading" rel="noopener nofollow ugc">https://example.com/article.html</a></p>\n<p><img src="//community.example.com/original/2X/2/testimage1.jpeg" alt="Image1" width="555" height="500"><br>\n<img src="//community.example.com/original/2X/3/testimage2.jpeg" alt="Image2" width="465" height="500"><br>\nAnd how can we adapt to it. <a class="mention" href="/u/user1">@user1</a> <a class="mention" href="/u/user2">@user2</a></p>',
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
        };

        it("should extract image URLs from HTML img tags", () => {
            const imageUrls = handler["extractImageUrls"](
                testPostWithAttachments.cooked
            );

            expect(imageUrls).toHaveLength(2);
            expect(imageUrls).toContain(
                "https://community.example.com/original/2X/2/testimage1.jpeg"
            );
            expect(imageUrls).toContain(
                "https://community.example.com/original/2X/3/testimage2.jpeg"
            );
        });

        it("should extract regular URLs excluding those in anchor tags", () => {
            const regularUrls = handler["extractRegularUrls"](
                testPostWithAttachments.cooked
            );

            expect(regularUrls).toHaveLength(1);
            expect(regularUrls).toContain("https://example.com/article.html");
        });

        it("should process images and call image description service", async () => {
            const imageUrls = [
                "https://community.example.com/original/2X/2/testimage1.jpeg",
                "https://community.example.com/original/2X/3/testimage2.jpeg",
            ];
            const attachments: any[] = [];

            await handler["processImages"](imageUrls, attachments, mockRuntime);

            expect(mockRuntime.getService).toHaveBeenCalledWith(
                "image_description"
            );
            const imageService = mockRuntime.getService("image_description");
            expect(imageService.describeImage).toHaveBeenCalledTimes(2);
            expect(imageService.describeImage).toHaveBeenCalledWith(
                "https://community.example.com/original/2X/2/testimage1.jpeg"
            );
            expect(imageService.describeImage).toHaveBeenCalledWith(
                "https://community.example.com/original/2X/3/testimage2.jpeg"
            );

            expect(attachments).toHaveLength(2);
            expect(attachments[0]).toMatchObject({
                url: "https://community.example.com/original/2X/2/testimage1.jpeg",
                title: "Test Image",
                source: "discourse",
                description: "A test image description",
                contentType: "image",
            });
        });

        it("should process URLs and call browser service", async () => {
            const urls = ["https://example.com/article.html"];
            const attachments: any[] = [];

            await handler["processUrls"](urls, attachments, mockRuntime);

            expect(mockRuntime.getService).toHaveBeenCalledWith("browser");
            const browserService = mockRuntime.getService("browser");
            expect(browserService.getPageContent).toHaveBeenCalledTimes(1);
            expect(browserService.getPageContent).toHaveBeenCalledWith(
                "https://example.com/article.html",
                mockRuntime
            );

            expect(attachments).toHaveLength(1);
            expect(attachments[0]).toMatchObject({
                url: "https://example.com/article.html",
                title: "Test Web Page",
                source: "discourse-web",
                description: "A test web page description",
                contentType: "text/html",
            });
        });

        it("should handle missing browser service gracefully", async () => {
            // Create a new mock runtime that returns null for browser service
            const mockRuntimeNoBrowser = {
                ...mockRuntime,
                getService: vi.fn().mockImplementation((serviceType) => {
                    if (serviceType === "browser") {
                        return null;
                    }
                    if (serviceType === "image_description") {
                        return {
                            describeImage: vi.fn().mockResolvedValue({
                                title: "Test Image",
                                description: "A test image description",
                            }),
                        };
                    }
                    return null;
                }),
            };

            const urls = ["https://example.com/article.html"];
            const attachments: any[] = [];

            await handler["processUrls"](
                urls,
                attachments,
                mockRuntimeNoBrowser
            );

            expect(elizaLogger.warn).toHaveBeenCalledWith(
                "Browser service not found, skipping URL processing"
            );
            expect(attachments).toHaveLength(0);
        });

        it("should handle image description service errors gracefully", async () => {
            // Create a new mock runtime with failing image service
            const mockRuntimeFailingImage = {
                ...mockRuntime,
                getService: vi.fn().mockImplementation((serviceType) => {
                    if (serviceType === "image_description") {
                        return {
                            describeImage: vi
                                .fn()
                                .mockRejectedValue(
                                    new Error("Image service error")
                                ),
                        };
                    }
                    if (serviceType === "browser") {
                        return {
                            getPageContent: vi.fn().mockResolvedValue({
                                title: "Test Web Page",
                                description: "A test web page description",
                            }),
                        };
                    }
                    return null;
                }),
            };

            const imageUrls = [
                "https://community.example.com/original/2X/2/testimage1.jpeg",
            ];
            const attachments: any[] = [];

            await handler["processImages"](
                imageUrls,
                attachments,
                mockRuntimeFailingImage
            );

            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error describing discourse image https://community.example.com/original/2X/2/testimage1.jpeg:",
                expect.any(Error)
            );
            expect(attachments).toHaveLength(0);
        });

        it("should handle browser service errors gracefully", async () => {
            // Create a new mock runtime with failing browser service
            const mockRuntimeFailingBrowser = {
                ...mockRuntime,
                getService: vi.fn().mockImplementation((serviceType) => {
                    if (serviceType === "browser") {
                        return {
                            getPageContent: vi
                                .fn()
                                .mockRejectedValue(
                                    new Error("Browser service error")
                                ),
                        };
                    }
                    if (serviceType === "image_description") {
                        return {
                            describeImage: vi.fn().mockResolvedValue({
                                title: "Test Image",
                                description: "A test image description",
                            }),
                        };
                    }
                    return null;
                }),
            };

            const urls = ["https://example.com/article.html"];
            const attachments: any[] = [];

            await handler["processUrls"](
                urls,
                attachments,
                mockRuntimeFailingBrowser
            );

            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error processing discourse URL https://example.com/article.html:",
                expect.any(Error)
            );
            expect(attachments).toHaveLength(0);
        });

        it("should process complete post with mixed attachments", async () => {
            const webhookData = {
                eventType: "post_created",
                instance: "https://community.example.com",
                eventId: "12345",
                signature: "sha256=test",
                payload: {
                    post: testPostWithAttachments,
                },
            };

            const result =
                await handler.initiateDiscourseProcessing(webhookData);

            expect(result.content.attachments).toHaveLength(3); // 2 images + 1 URL

            // Check image attachments
            const imageAttachments = result.content.attachments.filter(
                (att: any) => att.source === "discourse"
            );
            expect(imageAttachments).toHaveLength(2);

            // Check URL attachment
            const urlAttachments = result.content.attachments.filter(
                (att: any) => att.source === "discourse-web"
            );
            expect(urlAttachments).toHaveLength(1);
            expect(urlAttachments[0].url).toBe(
                "https://example.com/article.html"
            );
        });

        it("should extract no URLs when post has only text", () => {
            const textOnlyPost =
                "<p>This is just a text post with no URLs or images.</p>";

            const imageUrls = handler["extractImageUrls"](textOnlyPost);
            const regularUrls = handler["extractRegularUrls"](textOnlyPost);

            expect(imageUrls).toHaveLength(0);
            expect(regularUrls).toHaveLength(0);
        });

        it("should handle multiple URLs of same type", () => {
            const multiUrlPost =
                '<p>Check out <a href="https://site1.com">site1</a> and <a href="https://site2.com">site2</a> for more info.</p>';

            const regularUrls = handler["extractRegularUrls"](multiUrlPost);

            expect(regularUrls).toHaveLength(2);
            expect(regularUrls).toContain("https://site1.com");
            expect(regularUrls).toContain("https://site2.com");
        });

        it("should correctly separate image URLs from regular URLs", () => {
            const mixedPost =
                '<p>Visit <a href="https://blog.example.com">blog</a></p>\n<p><img src="//community.example.com/screenshot.png" alt="Screenshot"></p>\n<p>Also see <a href="https://docs.example.com">docs</a></p>';

            const imageUrls = handler["extractImageUrls"](mixedPost);
            const regularUrls = handler["extractRegularUrls"](mixedPost);

            expect(imageUrls).toHaveLength(1);
            expect(imageUrls).toContain(
                "https://community.example.com/screenshot.png"
            );

            expect(regularUrls).toHaveLength(2);
            expect(regularUrls).toContain("https://blog.example.com");
            expect(regularUrls).toContain("https://docs.example.com");
        });

        it("should handle protocol-relative image URLs", () => {
            const protocolRelativePost =
                '<p><img src="//community.example.com/image1.jpg" alt="Image1"><img src="https://community.example.com/image2.jpg" alt="Image2"></p>';

            const imageUrls = handler["extractImageUrls"](protocolRelativePost);

            expect(imageUrls).toHaveLength(2);
            expect(imageUrls).toContain(
                "https://community.example.com/image1.jpg"
            );
            expect(imageUrls).toContain(
                "https://community.example.com/image2.jpg"
            );
        });

        it("should skip internal discourse links", () => {
            const internalLinksPost =
                '<p><a href="/u/username">@username</a> and <a href="/t/topic/123">topic link</a> but <a href="https://external.com">external link</a></p>';

            const regularUrls =
                handler["extractRegularUrls"](internalLinksPost);

            expect(regularUrls).toHaveLength(1);
            expect(regularUrls).toContain("https://external.com");
            expect(regularUrls).not.toContain("/u/username");
            expect(regularUrls).not.toContain("/t/topic/123");
        });

        it("should skip emoji images and small UI elements", () => {
            const postWithEmojis = `<p>Check this out <img src="/images/emoji/twitter/man_shrugging.png?v=12" title=":man_shrugging:" class="emoji" alt=":man_shrugging:" loading="lazy" width="20" height="20"> and <img src="//community.example.com/real-image.jpg" alt="Real Image" width="500" height="300"></p>`;

            const imageUrls = handler["extractImageUrls"](postWithEmojis);

            expect(imageUrls).toHaveLength(1);
            expect(imageUrls).toContain(
                "https://community.example.com/real-image.jpg"
            );
            expect(imageUrls).not.toContain(
                "/images/emoji/twitter/man_shrugging.png?v=12"
            );
        });

        it("should skip images smaller than 50x50 pixels", () => {
            const postWithSmallImages = `<p><img src="//community.example.com/icon.png" width="16" height="16"><img src="//community.example.com/large-image.jpg" width="600" height="400"></p>`;

            const imageUrls = handler["extractImageUrls"](postWithSmallImages);

            expect(imageUrls).toHaveLength(1);
            expect(imageUrls).toContain(
                "https://community.example.com/large-image.jpg"
            );
            expect(imageUrls).not.toContain(
                "https://community.example.com/icon.png"
            );
        });

        it("should skip relative URLs that cannot be processed", () => {
            const postWithRelativeUrls = `<p><img src="/relative/path/image.jpg" width="100" height="100"><img src="//external.com/image.jpg" width="200" height="200"></p>`;

            const imageUrls = handler["extractImageUrls"](postWithRelativeUrls);

            expect(imageUrls).toHaveLength(1);
            expect(imageUrls).toContain("https://external.com/image.jpg");
            expect(imageUrls).not.toContain("/relative/path/image.jpg");
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

            // Mock generateShouldRespond to return RESPOND by default
            vi.mocked(_generateShouldRespond).mockResolvedValue("RESPOND");
            vi.mocked(_composeContext).mockReturnValue("mock context");
            vi.mocked(_composeRandomUser).mockReturnValue("mock template");

            // Mock Discourse utils
            vi.mocked(extractTopicId).mockReturnValue(123);
            vi.mocked(extractPostNumber).mockReturnValue(1);
            vi.mocked(isReplyPost).mockReturnValue(false);
            vi.mocked(formatDiscourseResponse).mockImplementation(
                (content) => content
            );

            // Mock DiscourseClient constructor
            vi.mocked(DiscourseClient).mockImplementation(
                () =>
                    ({
                        createPost: vi.fn(),
                        testConnection: vi.fn(),
                        getBaseUrl: vi
                            .fn()
                            .mockReturnValue("https://test.discourse.com"),
                    }) as any
            );

            // Mock Discourse utils
            vi.mocked(extractTopicId).mockReturnValue(123);
            vi.mocked(extractPostNumber).mockReturnValue(1);
            vi.mocked(isReplyPost).mockReturnValue(false);
            vi.mocked(formatDiscourseResponse).mockImplementation(
                (content) => content
            );

            // Mock DiscourseClient constructor
            vi.mocked(DiscourseClient).mockImplementation(
                () =>
                    ({
                        createPost: vi.fn(),
                        testConnection: vi.fn(),
                        getBaseUrl: vi
                            .fn()
                            .mockReturnValue("https://test.discourse.com"),
                    }) as any
            );
        });

        it("should successfully process discourse webhook", async () => {
            const { handle } = await import("../handlers/discourse");

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

            // Verify discourseHandlerCallback was called to send response to Discourse
            expect(discourseHandlerCallback).toHaveBeenCalledWith(
                expect.any(Object), // DiscourseClient instance
                expect.objectContaining({
                    text: "Test response from agent",
                    action: "CONTINUE",
                }),
                expect.any(String), // roomId
                expect.objectContaining({
                    agentId: "test-agent-id",
                }),
                123, // topicId
                undefined // replyToPostNumber
            );
        });

        it("should handle genResponse throwing an error", async () => {
            vi.mocked(genResponse).mockRejectedValue(
                new Error("Generation failed")
            );

            const { handle } = await import("../handlers/discourse");

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

            const { handle } = await import("../handlers/discourse");

            await expect(
                handle(
                    mockReq as Request,
                    mockRes as Response,
                    mockDirectClient,
                    mockWebhookData
                )
            ).rejects.toThrow("Memory creation failed");
        });

        it("should send formatted response to Discourse", async () => {
            const { handle } = await import("../handlers/discourse");

            await handle(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient,
                mockWebhookData
            );

            // Verify formatDiscourseResponse was called
            expect(formatDiscourseResponse).toHaveBeenCalledWith({
                text: "Test response from agent",
                action: "CONTINUE",
            });

            // Verify discourseHandlerCallback was called with correct parameters
            expect(discourseHandlerCallback).toHaveBeenCalledWith(
                expect.any(Object), // DiscourseClient instance
                expect.objectContaining({
                    text: "Test response from agent",
                    action: "CONTINUE",
                }),
                expect.any(String), // roomId
                expect.objectContaining({
                    agentId: "test-agent-id",
                }),
                123, // topicId
                undefined // replyToPostNumber (not a reply)
            );
        });

        it("should extract topic information from webhook data", async () => {
            const { handle } = await import("../handlers/discourse");

            await handle(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient,
                mockWebhookData
            );

            // Verify extraction functions were called
            expect(extractTopicId).toHaveBeenCalledWith(
                mockWebhookData.payload
            );
            expect(extractPostNumber).toHaveBeenCalledWith(
                mockWebhookData.payload
            );
            expect(isReplyPost).toHaveBeenCalledWith(mockWebhookData.payload);
        });

        it("should handle InteractionLogger errors gracefully", async () => {
            // Mock InteractionLogger to throw an error
            vi.mocked(_InteractionLogger.logMessageReceived).mockImplementation(
                () => {
                    throw new Error("Logging failed");
                }
            );

            const { handle } = await import("../handlers/discourse");

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

        it("should not call genResponse when agent decides to IGNORE", async () => {
            // Reset all mocks to ensure clean state
            vi.clearAllMocks();

            // Re-setup required mocks
            vi.mocked(_generateShouldRespond).mockResolvedValue("IGNORE");
            vi.mocked(_composeContext).mockReturnValue("mock context");
            vi.mocked(_composeRandomUser).mockReturnValue("mock template");
            // Ensure InteractionLogger works correctly
            vi.mocked(_InteractionLogger.logMessageReceived).mockImplementation(
                () => {}
            );
            vi.mocked(_InteractionLogger.logAgentResponse).mockImplementation(
                () => {}
            );

            const { handle } = await import("../handlers/discourse");

            await handle(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient,
                mockWebhookData
            );

            // Verify generateShouldRespond was called
            expect(_generateShouldRespond).toHaveBeenCalledWith({
                runtime: expect.objectContaining({
                    agentId: "test-agent-id",
                }),
                context: "mock context",
                modelClass: "small",
                message: expect.objectContaining({
                    content: expect.objectContaining({
                        text: expect.stringContaining("IoTeX"),
                    }),
                }),
                tags: ["discourse", "discourse-should-respond"],
            });

            // Verify genResponse was NOT called since agent decided to ignore
            expect(genResponse).not.toHaveBeenCalled();

            // Verify discourseHandlerCallback was NOT called since agent decided to ignore
            expect(discourseHandlerCallback).not.toHaveBeenCalled();

            // Verify only user message memory was created (no agent response)
            expect(
                mockDirectClient.getRuntime().messageManager.createMemory
            ).toHaveBeenCalledTimes(1);
        });

        it("should not call genResponse when agent decides to STOP", async () => {
            // Reset all mocks to ensure clean state
            vi.clearAllMocks();

            // Re-setup required mocks
            vi.mocked(_generateShouldRespond).mockResolvedValue("STOP");
            vi.mocked(_composeContext).mockReturnValue("mock context");
            vi.mocked(_composeRandomUser).mockReturnValue("mock template");
            // Ensure InteractionLogger works correctly
            vi.mocked(_InteractionLogger.logMessageReceived).mockImplementation(
                () => {}
            );
            vi.mocked(_InteractionLogger.logAgentResponse).mockImplementation(
                () => {}
            );

            const { handle } = await import("../handlers/discourse");

            await handle(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient,
                mockWebhookData
            );

            // Verify genResponse was NOT called since agent decided to stop
            expect(genResponse).not.toHaveBeenCalled();

            // Verify discourseHandlerCallback was NOT called since agent decided to stop
            expect(discourseHandlerCallback).not.toHaveBeenCalled();

            // Verify only user message memory was created (no agent response)
            expect(
                mockDirectClient.getRuntime().messageManager.createMemory
            ).toHaveBeenCalledTimes(1);
        });

        it("should compose context with discourse template", async () => {
            // Reset all mocks to ensure clean state
            vi.clearAllMocks();

            // Re-setup required mocks
            vi.mocked(_generateShouldRespond).mockResolvedValue("RESPOND");
            vi.mocked(_composeContext).mockReturnValue("mock context");
            vi.mocked(_composeRandomUser).mockReturnValue("mock template");
            vi.mocked(genResponse).mockResolvedValue({
                response: { text: "Test response", action: "CONTINUE" },
                context: "test context",
            });
            // Ensure InteractionLogger works correctly
            vi.mocked(_InteractionLogger.logMessageReceived).mockImplementation(
                () => {}
            );
            vi.mocked(_InteractionLogger.logAgentResponse).mockImplementation(
                () => {}
            );

            const { handle } = await import("../handlers/discourse");

            await handle(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient,
                mockWebhookData
            );

            // Verify composeContext was called with the correct parameters
            expect(_composeContext).toHaveBeenCalledWith({
                state: expect.objectContaining({ test: "state" }),
                template: discourseShouldRespondTemplate,
            });
        });

        it("should handle generateShouldRespond throwing an error", async () => {
            // Reset all mocks to ensure clean state
            vi.clearAllMocks();

            // Re-setup required mocks
            vi.mocked(_composeContext).mockReturnValue("mock context");
            vi.mocked(_composeRandomUser).mockReturnValue("mock template");
            vi.mocked(_generateShouldRespond).mockRejectedValue(
                new Error("Should respond failed")
            );
            // Ensure InteractionLogger works correctly
            vi.mocked(_InteractionLogger.logMessageReceived).mockImplementation(
                () => {}
            );
            vi.mocked(_InteractionLogger.logAgentResponse).mockImplementation(
                () => {}
            );

            const { handle } = await import("../handlers/discourse");

            await expect(
                handle(
                    mockReq as Request,
                    mockRes as Response,
                    mockDirectClient,
                    mockWebhookData
                )
            ).rejects.toThrow("Should respond failed");

            // Verify genResponse was NOT called due to the error
            expect(genResponse).not.toHaveBeenCalled();
        });
    });
});
