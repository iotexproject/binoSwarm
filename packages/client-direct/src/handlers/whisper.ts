import express from "express";

import { DirectClient } from "../client";

import { CustomRequest } from "../types";
import { AgentNotFound } from "../errors";

const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

export async function handleWhisper(
    req: CustomRequest,
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
                error: "Error processing whisper",
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
    const audioFile = req.file; // Access the uploaded file using req.file
    const agentId = req.params.agentId;

    if (!audioFile) {
        res.status(400).send("No audio file provided");
        return;
    }

    const runtime = directClient.getRuntime(agentId);

    const formData = new FormData();
    const audioBlob = new Blob([audioFile.buffer], {
        type: audioFile.mimetype,
    });
    formData.append("file", audioBlob, audioFile.originalname);
    formData.append("model", "whisper-1");

    const response = await fetch(TRANSCRIBE_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${runtime.token}`,
        },
        body: formData,
    });

    const data = await response.json();
    res.json(data);
}
