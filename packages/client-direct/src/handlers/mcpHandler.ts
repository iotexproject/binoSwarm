import express from "express";

import { stringToUuid, Content, Memory, HandlerCallback } from "@elizaos/core";

import { DirectClient } from "../client";
import { MessageHandler } from "./messageHandler";
import { stringifyContent } from "./helpers";

export async function handleMCPMessage(
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
        userId,
        roomId,
        runtime,
        agentId,
        userMessage,
        messageId,
        memory,
        state: initialState,
    } = await messageHandler.initiateMessageProcessing();
    let state = initialState;

    const callback: HandlerCallback = async (content: Content) => {
        if (content) {
            const stringified = stringifyContent(userId, content);
            res.write(`data: ${stringified}\n\n`);

            const responseMessage: Memory = {
                id: stringToUuid(messageId + "-" + agentId),
                ...userMessage,
                userId: agentId,
                content,
                createdAt: Date.now(),
            };

            messageHandler.logResponse(
                userMessage,
                null,
                responseMessage,
                userId,
                roomId
            );

            await runtime.messageManager.createMemory({
                memory: responseMessage,
                isUnique: true,
            });
            state = await runtime.updateRecentMessageState(state);

            return [responseMessage];
        }
        return [];
    };

    const mcpAction = runtime.actions.filter(
        (action) => action.name === "CALL_MCP_TOOLS"
    );
    await mcpAction[0].handler(runtime, userMessage, state, {}, callback);

    await runtime.evaluate(memory, state);
    messageHandler.endStream();
}
