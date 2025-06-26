import express from "express";
import {
    stringToUuid,
    Memory,
    IAgentRuntime,
    Content,
    UUID,
    elizaLogger,
} from "@elizaos/core";
import { DirectClient } from "../client";
import { genRoomId, genUserId, composeContent } from "./helpers";

type UserMessage = {
    content: Content;
    userId: UUID;
    roomId: UUID;
    agentId: UUID;
};

export class MessageHandler {
    private req: express.Request;
    private res: express.Response;
    private directClient: DirectClient;

    constructor(
        req: express.Request,
        res: express.Response,
        directClient: DirectClient
    ) {
        this.req = req;
        this.res = res;
        this.directClient = directClient;
    }

    setSseHeaders(): void {
        this.res.setHeader("Content-Type", "text/event-stream");
        this.res.setHeader("Cache-Control", "no-cache");
        this.res.setHeader("Connection", "keep-alive");
    }

    handleStreamError(error: Error): void {
        this.res.write(
            `event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`
        );
        this.res.end();
    }

    endStream(): void {
        this.res.write("event: end\ndata: stream completed\n\n");
        this.res.end();
    }

    logResponse(
        userMessage: any,
        context: string,
        responseMessage: Memory,
        userId: string,
        roomId: string
    ): void {
        elizaLogger.log("DIRECT_MESSAGE_RESPONSE_RES", {
            body: { userMessage, context, responseMessage },
            userId,
            roomId,
            type: "response",
        });
    }

    async initiateMessageProcessing(): Promise<{
        roomId: string;
        userId: string;
        runtime: IAgentRuntime;
        agentId: string;
        userMessage: any;
        messageId: string;
        memory: Memory;
        state: any; // Consider a more specific type if available
    }> {
        const roomId = genRoomId(this.req);
        const userId = genUserId(this.req);
        const runtime = this.directClient.getRuntime(this.req.params.agentId);
        const agentId = runtime.agentId;

        await runtime.ensureConnection(
            userId,
            roomId,
            this.req.body.userName,
            this.req.body.name,
            "direct"
        );

        const content = await composeContent(this.req, runtime);
        const userMessage: UserMessage = {
            content,
            userId,
            roomId,
            agentId,
        };

        const messageId = stringToUuid(Date.now().toString());
        const memory: Memory = {
            id: stringToUuid(messageId + "-" + userId),
            ...userMessage,
            createdAt: Date.now(),
        };

        await runtime.messageManager.createMemory({
            memory,
            isUnique: true,
        });

        const state = await runtime.composeState(userMessage, {
            agentName: runtime.character.name,
        });

        return {
            roomId,
            userId,
            runtime,
            agentId,
            userMessage,
            messageId,
            memory,
            state,
        };
    }
}
