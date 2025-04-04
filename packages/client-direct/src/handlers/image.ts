import express from "express";

import { generateCaption, generateImage } from "@elizaos/core";

import { DirectClient } from "../client";
import { AgentNotFound } from "../errors";

export async function handleImage(
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
        } else {
            res.status(500).json({
                error: "Error processing image",
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
    const agentId = req.params.agentId;
    const agent = directClient.getAgent(agentId);
    if (!agent) {
        res.status(404).send("Agent not found");
        return;
    }

    const images = await generateImage({ ...req.body }, agent);
    const imagesRes: { image: string; caption: string }[] = [];
    if (images.data && images.data.length > 0) {
        for (let i = 0; i < images.data.length; i++) {
            const caption = await generateCaption(
                { imageUrl: images.data[i] },
                agent
            );
            imagesRes.push({
                image: images.data[i],
                caption: caption.title,
            });
        }
    }
    res.json({ images: imagesRes });
}
