import { describe, it, expect, beforeEach, vi } from "vitest";
import { Request, Response } from "express";
import {
    handleDiscourseWebhook,
    validateDiscourseWebhook,
    shouldProcessEvent,
} from "./discourse";

// Mock the DirectClient to prevent server startup
const mockDirectClient = {
    start: vi.fn(),
    stop: vi.fn(),
    getRuntime: vi.fn(),
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

    describe("validateDiscourseWebhook", () => {
        it("should validate post_created webhook", () => {
            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "post",
                    "x-discourse-event": "post_created",
                    "x-discourse-event-signature": "sha256=test-signature",
                },
                body: mockPostCreatedPayload,
            };

            const result = validateDiscourseWebhook(mockReq as Request);

            expect(result.eventType).toBe("post_created");
            expect(result.instance).toBe("https://community.example.com");
            expect(result.eventId).toBe("12345");
            expect(result.payload.post.id).toBe(12345);
        });

        it("should validate any webhook with required headers", () => {
            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "topic",
                    "x-discourse-event": "topic_created",
                    "x-discourse-event-signature": "sha256=test-signature",
                },
                body: { topic: { id: 123 } },
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
        it("should process valid webhook and return success", async () => {
            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "post",
                    "x-discourse-event": "post_created",
                    "x-discourse-event-signature": "sha256=test-signature",
                },
                body: mockPostCreatedPayload,
            };

            await handleDiscourseWebhook(
                mockReq as Request,
                mockRes as Response,
                mockDirectClient as any // DirectClient is mocked, so we can pass any mock
            );

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ status: "processed" });
        });

        it("should ignore events that should not be processed", async () => {
            const deletedPayload = {
                ...mockPostCreatedPayload,
                post: {
                    ...mockPostCreatedPayload.post,
                    deleted_at: "2025-01-15T19:00:00.000Z",
                },
            };

            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "post",
                    "x-discourse-event": "post_created",
                    "x-discourse-event-signature": "sha256=test-signature",
                },
                body: deletedPayload,
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

        it("should return 200 for unsupported event types", async () => {
            mockReq = {
                headers: {
                    "x-discourse-instance": "https://community.example.com",
                    "x-discourse-event-id": "12345",
                    "x-discourse-event-type": "topic",
                    "x-discourse-event": "topic_created",
                    "x-discourse-event-signature": "sha256=test-signature",
                },
                body: { topic: { id: 123 } },
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
