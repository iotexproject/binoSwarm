import express from "express";

import { stringToUuid, Content, Memory, elizaLogger } from "@elizaos/core";

import { DirectClient } from "../client";
import { genRoomId, genUserId, composeContent } from "./helpers";
import { HandlerCallback } from "@elizaos/core";

export async function handlePaidMessage(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

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

    let state = await runtime.composeState(userMessage, {
        agentName: runtime.character.name,
    });

    const callback: HandlerCallback = async (content: Content) => {
        if (content) {
            const messageData = {
                id: stringToUuid(Date.now().toString() + "-" + userId),
                ...content,
            };
            const stringifiedMessageData = JSON.stringify(messageData);
            res.write(`data: ${stringifiedMessageData}\n\n`);

            const responseMessage: Memory = {
                id: stringToUuid(messageId + "-" + agentId),
                ...userMessage,
                userId: agentId,
                content,
                createdAt: Date.now(),
            };

            elizaLogger.log("DIRECT_MESSAGE_RESPONSE_RES", {
                body: { userMessage, responseMessage },
                userId,
                roomId,
                type: "response",
            });

            await runtime.messageManager.createMemory({
                memory: responseMessage,
                isUnique: true,
            });
            state = await runtime.updateRecentMessageState(state);

            return [responseMessage];
        }
    };

    const mcpAction = runtime.actions.filter(
        (action) => action.name === "CALL_MCP_TOOLS"
    );
    await mcpAction[0].handler(runtime, userMessage, state, {}, callback);

    // // Run evaluators last
    await runtime.evaluate(memory, state);

    // // End the stream
    res.write("event: end\ndata: stream completed\n\n");
    res.end();
}
