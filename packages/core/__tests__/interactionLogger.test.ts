import { describe, it, expect, vi, beforeEach } from "vitest";
import { InteractionLogger } from "../src/interactionLogger";
import type {
    AgentMessageReceivedPayload,
    AgentResponseSentPayload,
    AgentScheduledPostPayload,
    AgentActionCalledPayload,
} from "../src/interactionLogger";

// Mock the elizaLogger
vi.mock("../src/logger", () => ({
    elizaLogger: {
        log: vi.fn(),
    },
}));

import { elizaLogger } from "../src/logger";

describe("InteractionLogger", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("logMessageReceived", () => {
        it("should log AGENT_MESSAGE_RECEIVED with correct payload", () => {
            const payload: AgentMessageReceivedPayload = {
                client: "discord",
                agentId: "agent-123" as any,
                userId: "user-456" as any,
                roomId: "room-789" as any,
                messageId: "msg-001",
            };

            InteractionLogger.logMessageReceived(payload);

            expect(elizaLogger.log).toHaveBeenCalledOnce();
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "AGENT_MESSAGE_RECEIVED",
                {
                    client: "discord",
                    agentId: "agent-123",
                    userId: "user-456",
                    roomId: "room-789",
                    messageId: "msg-001",
                }
            );
        });

        it("should handle different client types", () => {
            const clients = [
                "direct",
                "twitter",
                "telegram",
                "unknown",
            ] as const;

            clients.forEach((client) => {
                const payload: AgentMessageReceivedPayload = {
                    client,
                    agentId: "agent-123" as any,
                    userId: "user-456" as any,
                    roomId: "room-789" as any,
                    messageId: "msg-001",
                };

                InteractionLogger.logMessageReceived(payload);

                expect(elizaLogger.log).toHaveBeenCalledWith(
                    "AGENT_MESSAGE_RECEIVED",
                    {
                        client,
                        agentId: "agent-123",
                        userId: "user-456",
                        roomId: "room-789",
                        messageId: "msg-001",
                    }
                );
            });
        });
    });

    describe("logAgentResponse", () => {
        it("should log AGENT_RESPONSE_SENT with sent status", () => {
            const payload: AgentResponseSentPayload = {
                client: "twitter",
                agentId: "agent-456" as any,
                userId: "user-789" as any,
                roomId: "room-123" as any,
                messageId: "msg-002",
                status: "sent",
            };

            InteractionLogger.logAgentResponse(payload);

            expect(elizaLogger.log).toHaveBeenCalledOnce();
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "AGENT_RESPONSE_SENT",
                {
                    client: "twitter",
                    agentId: "agent-456",
                    userId: "user-789",
                    roomId: "room-123",
                    messageId: "msg-002",
                    status: "sent",
                }
            );
        });

        it("should handle ignored status", () => {
            const payload: AgentResponseSentPayload = {
                client: "telegram",
                agentId: "agent-789" as any,
                userId: "user-123" as any,
                roomId: "room-456" as any,
                messageId: "msg-003",
                status: "ignored",
            };

            InteractionLogger.logAgentResponse(payload);

            expect(elizaLogger.log).toHaveBeenCalledWith(
                "AGENT_RESPONSE_SENT",
                {
                    client: "telegram",
                    agentId: "agent-789",
                    userId: "user-123",
                    roomId: "room-456",
                    messageId: "msg-003",
                    status: "ignored",
                }
            );
        });

        it("should handle error status", () => {
            const payload: AgentResponseSentPayload = {
                client: "direct",
                agentId: "agent-error" as any,
                userId: "user-error" as any,
                roomId: "room-error" as any,
                messageId: "msg-error",
                status: "error",
            };

            InteractionLogger.logAgentResponse(payload);

            expect(elizaLogger.log).toHaveBeenCalledWith(
                "AGENT_RESPONSE_SENT",
                {
                    client: "direct",
                    agentId: "agent-error",
                    userId: "user-error",
                    roomId: "room-error",
                    messageId: "msg-error",
                    status: "error",
                }
            );
        });
    });

    describe("logAgentScheduledPost", () => {
        it("should log AGENT_SCHEDULED_POST with scheduled status", () => {
            const payload: AgentScheduledPostPayload = {
                client: "discord",
                agentId: "agent-scheduled" as any,
                userId: "user-scheduled" as any,
                roomId: "room-scheduled" as any,
                messageId: "msg-scheduled",
                status: "scheduled",
            };

            InteractionLogger.logAgentScheduledPost(payload);

            expect(elizaLogger.log).toHaveBeenCalledOnce();
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "AGENT_SCHEDULED_POST",
                {
                    client: "discord",
                    agentId: "agent-scheduled",
                    userId: "user-scheduled",
                    roomId: "room-scheduled",
                    messageId: "msg-scheduled",
                    status: "scheduled",
                }
            );
        });

        it("should handle sent status for scheduled posts", () => {
            const payload: AgentScheduledPostPayload = {
                client: "twitter",
                agentId: "agent-sent" as any,
                userId: "user-sent" as any,
                roomId: "room-sent" as any,
                messageId: "msg-sent",
                status: "sent",
            };

            InteractionLogger.logAgentScheduledPost(payload);

            expect(elizaLogger.log).toHaveBeenCalledWith(
                "AGENT_SCHEDULED_POST",
                {
                    client: "twitter",
                    agentId: "agent-sent",
                    userId: "user-sent",
                    roomId: "room-sent",
                    messageId: "msg-sent",
                    status: "sent",
                }
            );
        });

        it("should handle failed status for scheduled posts", () => {
            const payload: AgentScheduledPostPayload = {
                client: "telegram",
                agentId: "agent-failed" as any,
                userId: "user-failed" as any,
                roomId: "room-failed" as any,
                messageId: "msg-failed",
                status: "failed",
            };

            InteractionLogger.logAgentScheduledPost(payload);

            expect(elizaLogger.log).toHaveBeenCalledWith(
                "AGENT_SCHEDULED_POST",
                {
                    client: "telegram",
                    agentId: "agent-failed",
                    userId: "user-failed",
                    roomId: "room-failed",
                    messageId: "msg-failed",
                    status: "failed",
                }
            );
        });
    });

    describe("logAgentActionCalled", () => {
        it("should log AGENT_ACTION_CALLED with action name", () => {
            const payload: AgentActionCalledPayload = {
                client: "direct",
                agentId: "agent-action" as any,
                userId: "user-action" as any,
                roomId: "room-action" as any,
                messageId: "msg-action",
                actionName: "sendMessage",
            };

            InteractionLogger.logAgentActionCalled(payload);

            expect(elizaLogger.log).toHaveBeenCalledOnce();
            expect(elizaLogger.log).toHaveBeenCalledWith(
                "AGENT_ACTION_CALLED",
                {
                    client: "direct",
                    agentId: "agent-action",
                    userId: "user-action",
                    roomId: "room-action",
                    messageId: "msg-action",
                    actionName: "sendMessage",
                    tags: undefined,
                }
            );
        });

        it("should log AGENT_ACTION_CALLED with tags", () => {
            const payload: AgentActionCalledPayload = {
                client: "discord",
                agentId: "agent-tags" as any,
                userId: "user-tags" as any,
                roomId: "room-tags" as any,
                messageId: "msg-tags",
                actionName: "processPayment",
                tags: ["payment", "financial", "critical"],
            };

            InteractionLogger.logAgentActionCalled(payload);

            expect(elizaLogger.log).toHaveBeenCalledWith(
                "AGENT_ACTION_CALLED",
                {
                    client: "discord",
                    agentId: "agent-tags",
                    userId: "user-tags",
                    roomId: "room-tags",
                    messageId: "msg-tags",
                    actionName: "processPayment",
                    tags: ["payment", "financial", "critical"],
                }
            );
        });

        it("should handle empty tags array", () => {
            const payload: AgentActionCalledPayload = {
                client: "twitter",
                agentId: "agent-empty-tags" as any,
                userId: "user-empty-tags" as any,
                roomId: "room-empty-tags" as any,
                messageId: "msg-empty-tags",
                actionName: "deleteMessage",
                tags: [],
            };

            InteractionLogger.logAgentActionCalled(payload);

            expect(elizaLogger.log).toHaveBeenCalledWith(
                "AGENT_ACTION_CALLED",
                {
                    client: "twitter",
                    agentId: "agent-empty-tags",
                    userId: "user-empty-tags",
                    roomId: "room-empty-tags",
                    messageId: "msg-empty-tags",
                    actionName: "deleteMessage",
                    tags: [],
                }
            );
        });
    });

    describe("integration tests", () => {
        it("should handle multiple sequential logging calls", () => {
            const messagePayload: AgentMessageReceivedPayload = {
                client: "discord",
                agentId: "agent-integration" as any,
                userId: "user-integration" as any,
                roomId: "room-integration" as any,
                messageId: "msg-integration-1",
            };

            const responsePayload: AgentResponseSentPayload = {
                client: "discord",
                agentId: "agent-integration" as any,
                userId: "user-integration" as any,
                roomId: "room-integration" as any,
                messageId: "msg-integration-2",
                status: "sent",
            };

            const actionPayload: AgentActionCalledPayload = {
                client: "discord",
                agentId: "agent-integration" as any,
                userId: "user-integration" as any,
                roomId: "room-integration" as any,
                messageId: "msg-integration-3",
                actionName: "integrationTest",
                tags: ["test"],
            };

            InteractionLogger.logMessageReceived(messagePayload);
            InteractionLogger.logAgentResponse(responsePayload);
            InteractionLogger.logAgentActionCalled(actionPayload);

            expect(elizaLogger.log).toHaveBeenCalledTimes(3);
            expect(elizaLogger.log).toHaveBeenNthCalledWith(
                1,
                "AGENT_MESSAGE_RECEIVED",
                expect.any(Object)
            );
            expect(elizaLogger.log).toHaveBeenNthCalledWith(
                2,
                "AGENT_RESPONSE_SENT",
                expect.any(Object)
            );
            expect(elizaLogger.log).toHaveBeenNthCalledWith(
                3,
                "AGENT_ACTION_CALLED",
                expect.any(Object)
            );
        });
    });
});
