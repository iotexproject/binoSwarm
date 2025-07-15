import { elizaLogger } from "./logger";
import { UUID } from "./types";

export type AgentClient =
    | "direct"
    | "discord"
    | "twitter"
    | "telegram"
    | "unknown";

export type AgentMessageReceivedPayload = {
    client: AgentClient;
    agentId: UUID;
    userId: UUID;
    roomId: UUID;
    messageId: string;
};

export type AgentResponseSentPayload = {
    client: AgentClient;
    agentId: UUID;
    userId: UUID;
    roomId: UUID;
    messageId: string;
    status: "sent" | "ignored" | "error";
};

export type AgentScheduledPostPayload = {
    client: AgentClient;
    agentId: UUID;
    userId: UUID;
    roomId: UUID;
    messageId: string;
    status: "scheduled" | "sent" | "failed";
};

export type AgentActionCalledPayload = {
    client: AgentClient;
    agentId: UUID;
    userId: UUID;
    roomId: UUID;
    messageId: string;
    actionName: string;
    tags?: string[];
};

export class InteractionLogger {
    public static logMessageReceived(
        payload: AgentMessageReceivedPayload
    ): void {
        elizaLogger.log("AGENT_MESSAGE_RECEIVED", {
            client: payload.client,
            agentId: payload.agentId,
            userId: payload.userId,
            roomId: payload.roomId,
            messageId: payload.messageId,
        });
    }

    public static logAgentResponse(payload: AgentResponseSentPayload): void {
        elizaLogger.log("AGENT_RESPONSE_SENT", {
            client: payload.client,
            agentId: payload.agentId,
            userId: payload.userId,
            roomId: payload.roomId,
            messageId: payload.messageId,
            status: payload.status,
        });
    }

    public static logAgentScheduledPost(
        payload: AgentScheduledPostPayload
    ): void {
        elizaLogger.log("AGENT_SCHEDULED_POST", {
            client: payload.client,
            agentId: payload.agentId,
            userId: payload.userId,
            roomId: payload.roomId,
            messageId: payload.messageId,
            status: payload.status,
        });
    }

    public static logAgentActionCalled(
        payload: AgentActionCalledPayload
    ): void {
        elizaLogger.log("AGENT_ACTION_CALLED", {
            client: payload.client,
            agentId: payload.agentId,
            userId: payload.userId,
            roomId: payload.roomId,
            messageId: payload.messageId,
            actionName: payload.actionName,
            tags: payload.tags,
        });
    }
}
