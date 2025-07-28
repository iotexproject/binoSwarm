import express from "express";
import {
    stringToUuid,
    Memory,
    IAgentRuntime,
    MsgPreprocessor,
} from "@elizaos/core";
import { DirectClient } from "../client";
import { collectAndDescribeAttachments } from "./helpers";

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
        const runtime = this.directClient.getRuntime(this.req.params.agentId);
        const msgPreprocessor = new MsgPreprocessor(runtime);

        const messageId = stringToUuid(Date.now().toString());
        const attachments = await collectAndDescribeAttachments(
            this.req,
            runtime
        );

        const memory = await msgPreprocessor.preprocess({
            rawMessageId: messageId,
            text: this.req.body.text,
            attachments,
            rawUserId: this.req.body.userId,
            rawRoomId: this.req.body.roomId,
            userName: this.req.body.userName,
            userScreenName: this.req.body.name,
            source: "direct",
        });

        const state = await runtime.composeState(
            {
                content: memory.content,
                userId: memory.userId,
                roomId: memory.roomId,
                agentId: memory.agentId,
            },
            {
                agentName: runtime.character.name,
            }
        );

        return {
            roomId: memory.roomId,
            userId: memory.userId,
            runtime,
            agentId: memory.agentId,
            userMessage: {
                content: memory.content,
                userId: memory.userId,
                roomId: memory.roomId,
                agentId: memory.agentId,
            },
            messageId,
            memory,
            state,
        };
    }
}
