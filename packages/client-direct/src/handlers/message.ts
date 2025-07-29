import express from "express";

import { Content, InteractionLogger, UUID } from "@elizaos/core";

import { DirectClient } from "../client";
import { stringifyContent } from "./helpers";
import { MessageHandler } from "./messageHandler";
import { messageHandlerTemplate } from "../templates";

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
    const { roomId, userId, runtime, agentId, memory, state, msgProcessor } =
        await messageHandler.initiateMessageProcessing();

    InteractionLogger.logMessageReceived({
        client: "direct",
        agentId: agentId as UUID,
        userId: userId as UUID,
        roomId: roomId as UUID,
        messageId: memory.id,
    });

    const template =
        runtime.character.templates?.directMessageHandlerTemplate ||
        runtime.character.templates?.messageHandlerTemplate ||
        messageHandlerTemplate;

    const callback = async (content: Content) => {
        if (content) {
            const stringified = stringifyContent(userId, content);
            res.write(`data: ${stringified}\n\n`);
        }
        return [];
    };

    const tags = ["direct", "direct-response"];
    await msgProcessor.respond(template, tags, callback);

    InteractionLogger.logAgentResponse({
        client: "direct",
        agentId: agentId as UUID,
        userId: userId as UUID,
        roomId: roomId as UUID,
        messageId: memory.id,
        status: "sent",
    });

    await runtime.evaluate(memory, state);
    messageHandler.endStream();
}
