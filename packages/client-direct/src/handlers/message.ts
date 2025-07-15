import express from "express";

import {
    stringToUuid,
    Content,
    Memory,
    InteractionLogger,
    UUID,
} from "@elizaos/core";

import { DirectClient } from "../client";
import { genResponse, stringifyContent } from "./helpers";
import { MessageHandler } from "./messageHandler";

export async function handleMessage(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    const messageHandler = new MessageHandler(req, res, directClient);
    messageHandler.setSseHeaders();

    try {
        await handle(res, messageHandler);
    } catch (error) {
        messageHandler.handleStreamError(error);
    }
}

async function handle(res: express.Response, messageHandler: MessageHandler) {
    const {
        roomId,
        userId,
        runtime,
        agentId,
        userMessage,
        messageId,
        memory,
        state: initialState,
    } = await messageHandler.initiateMessageProcessing();
    let state = initialState;

    InteractionLogger.logMessageReceived({
        client: "direct",
        agentId: agentId as UUID,
        userId: userId as UUID,
        roomId: roomId as UUID,
        messageId: memory.id,
    });

    const { response } = await genResponse(runtime, state, memory);

    // Send initial response immediately
    const responseData = {
        id: messageId,
        ...response,
    };
    res.write(`data: ${JSON.stringify(responseData)}\n\n`);

    const responseMessage: Memory = {
        id: stringToUuid(messageId + "-" + agentId),
        ...userMessage,
        userId: agentId,
        content: response,
        createdAt: Date.now(),
    };

    InteractionLogger.logAgentResponse({
        client: "direct",
        agentId: agentId as UUID,
        userId: userId as UUID,
        roomId: roomId as UUID,
        messageId: memory.id,
        status: "sent",
    });

    await runtime.messageManager.createMemory({
        memory: responseMessage,
        isUnique: true,
    });
    state = await runtime.updateRecentMessageState(state);

    await runtime.processActions(
        memory,
        [responseMessage],
        state,
        async (content: Content) => {
            if (content) {
                const stringified = stringifyContent(userId, content);
                res.write(`data: ${stringified}\n\n`);
            }
            return [memory];
        },
        {
            tags: ["direct-client", "direct-client-message"],
        }
    );

    await runtime.evaluate(memory, state);
    messageHandler.endStream();
}
