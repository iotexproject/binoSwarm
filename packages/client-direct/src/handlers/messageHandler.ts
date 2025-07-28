import express from "express";
import {
    stringToUuid,
    Memory,
    IAgentRuntime,
    MsgPreprocessor,
} from "@elizaos/core";
import { DirectClient } from "../client";
import { genRoomId, genUserId, composeContent } from "./helpers";
import { UserMessage } from "../types";

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

        const roomId = genRoomId(this.req);
        const userId = genUserId(this.req);
        const agentId = runtime.agentId;

        await msgPreprocessor.preprocess({
            rawUserId: this.req.body.userId,
            rawRoomId: this.req.body.roomId,
            userName: this.req.body.userName,
            userScreenName: this.req.body.name,
            source: "direct",
        });

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
