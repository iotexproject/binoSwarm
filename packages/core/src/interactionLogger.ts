import { elizaLogger } from "./logger";
import { Memory, UUID } from "./types";

export type AgentClient = "direct" | "discord" | "twitter" | "telegram";

export type AgentMessageReceivedPayload = {
    client: AgentClient;
    agentId: UUID;
    userId: UUID;
    roomId: UUID;
    messageId: UUID; // The user's incoming message ID
    traceId?: string;
};

export type AgentResponseSentPayload = {
    client: AgentClient;
    agentId: UUID;
    userId: UUID;
    roomId: UUID;
    responseMemory: Memory; // The agent's response
    traceId?: string;
    status: "sent" | "ignored" | "error";
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
            traceId: payload.traceId,
        });
    }

    public static logAgentResponse(payload: AgentResponseSentPayload): void {
        elizaLogger.log("AGENT_RESPONSE_SENT", {
            client: payload.client,
            agentId: payload.agentId,
            userId: payload.userId,
            roomId: payload.roomId,
            messageId: payload.responseMemory.id,
            status: payload.status,
            traceId: payload.traceId,
        });
    }
}
