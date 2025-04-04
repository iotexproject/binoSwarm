import express from "express";

import { DirectClient } from "../client";

import { CustomRequest } from "../types";

export async function handleWhisper(
    req: CustomRequest,
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

    const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${runtime.token}`,
            },
            body: formData,
        }
    );

    const data = await response.json();
    res.json(data);
}
