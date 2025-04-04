import express from "express";

import { DirectClient } from "../client";
import { genRoomId, genUserId } from "./helpers";
import { elizaLogger } from "@elizaos/core";

export async function handleMessageStream(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    await handle(req, res, directClient);

    res.write('"text":"Test response"');
    res.status(200).end();
}

async function handle(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    const roomId = genRoomId(req);
    const userId = genUserId(req);
    const runtime = directClient.getRuntime(req.params.agentId);

    elizaLogger.info(`New message stream request for room ${roomId}`);
    elizaLogger.info(`User ${userId} connected to room ${roomId}`);
    elizaLogger.info(`Runtime agentId: ${runtime.agentId}`);
}
