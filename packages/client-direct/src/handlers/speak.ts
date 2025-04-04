import express from "express";

import {
    stringToUuid,
    getEmbeddingZeroVector,
    Content,
    Memory,
    ServiceType,
} from "@elizaos/core";

import { DirectClient } from "../client";

import { ISpeechService } from "@elizaos/core";
import { genRoomId, genUserId, genResponse, composeContent } from "./helpers";
import { AgentNotFound, NoTextError } from "../errors";

export async function handleSpeak(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    try {
        await handle(req, res, directClient);
    } catch (error) {
        if (error instanceof AgentNotFound) {
            res.status(404).json({
                error: error.message,
            });
        } else if (error instanceof NoTextError) {
            res.status(400).json({
                error: error.message,
            });
        } else {
            res.status(500).json({
                error: "Error processing speech",
                details: error.message,
            });
        }
    }
}

async function handle(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    const { response, runtime } = await processTextualRequest(
        req,
        directClient
    );

    const speechService = runtime.getService<ISpeechService>(
        ServiceType.SPEECH_GENERATION
    );
    const responseStream = await speechService.generate(runtime, response.text);

    if (!responseStream) {
        res.status(500).send("Failed to generate speech");
        return;
    }

    res.set({
        "Content-Type": "audio/mpeg",
        // 'Transfer-Encoding': 'chunked'
    });

    responseStream.pipe(res);
}

async function processTextualRequest(
    req: express.Request,
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

    await runtime.messageManager.addEmbeddingToMemory(memory);
    await runtime.messageManager.createMemory(memory);

    let state = await runtime.composeState(userMessage, {
        agentName: runtime.character.name,
    });

    const response = await genResponse(runtime, state);

    const responseMessage: Memory = {
        id: stringToUuid(messageId + "-" + agentId),
        ...userMessage,
        userId: agentId,
        content: response,
        embedding: getEmbeddingZeroVector(),
        createdAt: Date.now(),
    };

    await runtime.messageManager.createMemory(responseMessage);

    state = await runtime.updateRecentMessageState(state);

    let message = null as Content | null;

    await runtime.processActions(
        memory,
        [responseMessage],
        state,
        async (newMessages) => {
            message = newMessages;
            return [memory];
        }
    );
    await runtime.evaluate(memory, state);

    return { runtime, memory, state, message, response, messageId };
}
