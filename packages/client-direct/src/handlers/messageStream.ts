import express from "express";

import {
    composeContext,
    Memory,
    ModelClass,
    streamWithTools,
    stringToUuid,
    Content,
    IAgentRuntime,
    elizaLogger,
} from "@elizaos/core";

import { DirectClient } from "../client";
import { genRoomId, genUserId, composeContent } from "./helpers";
import { messageStreamTemplate } from "../templates";
import qsSchema from "../providers";
import { UUID } from "@elizaos/core";

export async function handleMessageStream(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    try {
        await handle(req, res, directClient);
    } catch (error) {
        res.write(
            `event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`
        );
        res.end();
    }
}

async function handle(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    const roomId = genRoomId(req);
    const userId = genUserId(req);
    const runtime = directClient.getRuntime(req.params.agentId);
    const agentId = runtime.agentId;

    await runtime.ensureConnection(
        userId,
        roomId,
        req.body.userName,
        req.body.name,
        "direct"
    );

    const content = await composeContent(req, runtime);
    const userMessage = {
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

    const context = composeContext({
        state,
        template:
            runtime.character.templates?.directMessageStreamTemplate ||
            messageStreamTemplate,
    });

    const responseStream = streamWithTools({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
        tools: [qsSchema],
        message: userMessage,
        functionId: "HANDLE_MESSAGE_STREAM",
    });

    responseStream.pipeDataStreamToResponse(res);
    const response = await responseStream.response;

    processAssistantMessages(
        response.messages,
        runtime,
        roomId,
        messageId,
        userId,
        userMessage,
        context
    );
}

type Message = {
    content: ResContent[];
    role: string;
    id: string;
};

type ResContent = {
    type: string;
    text?: string;
};

async function processAssistantMessages(
    messages: Message[],
    runtime: IAgentRuntime,
    roomId: UUID,
    inReplyTo: UUID,
    userId: UUID,
    message: Memory,
    context: string
) {
    messages.forEach(({ content, role, id }: Message) => {
        if (role === "assistant") {
            processMessageContents(
                id,
                runtime,
                roomId,
                content,
                inReplyTo,
                userId,
                message,
                context
            );
        }
    });
}

async function processMessageContents(
    messageId: string,
    runtime: IAgentRuntime,
    roomId: UUID,
    content: ResContent[],
    inReplyTo: UUID,
    userId: UUID,
    message: Memory,
    context: string
) {
    content.forEach(({ type, text }: ResContent) => {
        if (type === "text") {
            const content: Content = {
                text,
                inReplyTo,
            };
            buildAndSaveMemory(
                messageId,
                runtime,
                roomId,
                content,
                userId,
                message,
                context
            );
        }
    });
}

async function buildAndSaveMemory(
    messageId: string,
    runtime: IAgentRuntime,
    roomId: UUID,
    content: Content,
    userId: UUID,
    message: Memory,
    context: string
) {
    const agentId = runtime.agentId;

    const responseMessage: Memory = {
        id: stringToUuid(messageId + "-" + agentId),
        roomId,
        userId: agentId,
        agentId,
        content,
        createdAt: Date.now(),
    };

    elizaLogger.log("DIRECT_STREAM_RESPONSE_RES", {
        body: { message, context, responseMessage },
        userId,
        roomId,
        type: "response",
    });

    await runtime.messageManager.createMemory({
        memory: responseMessage,
        isUnique: true,
    });
}
