import express from "express";

import { Content, Memory, stringToUuid, UUID } from "@elizaos/core";

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
    const { userId, runtime, agentId, memory, state, msgProcessor } =
        await messageHandler.initiateMessageProcessing();

    const template =
        runtime.character.templates?.directMessageHandlerTemplate ||
        runtime.character.templates?.messageHandlerTemplate ||
        messageHandlerTemplate;

    const callback = async (content: Content) => {
        if (content) {
            const stringified = stringifyContent(userId, content);
            res.write(`data: ${stringified}\n\n`);
        }
        const responseMessage: Memory = {
            ...memory,
            id: stringToUuid(memory.id + "-" + agentId),
            content,
            userId: agentId as UUID,
            createdAt: Date.now(),
        };
        return [responseMessage];
    };

    const tags = ["direct", "direct-response"];
    await msgProcessor.respond(template, tags, callback);

    await runtime.evaluate(memory, state);
    messageHandler.endStream();
}
