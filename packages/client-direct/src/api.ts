import express from "express";
import { getEnvVariable } from "@elizaos/core";

import { DirectClient } from ".";
import { CustomRequest } from "./types";
import {
    handleImage,
    handleMessage,
    handleSpeak,
    handleWhisper,
    handleGetChannels,
} from "./handlers";
import { AgentNotFound, NoTextError } from "./errors";

export function createApiRouter(directClient: DirectClient) {
    const router = express.Router();
    const upload = directClient.upload;

    router.use(
        express.json({
            limit: getEnvVariable("EXPRESS_MAX_PAYLOAD") || "100kb",
        })
    );

    router.get("/", (_, res) => {
        res.send("Welcome, this is the REST API!");
    });

    router.get("/hello", (_, res) => {
        res.json({ message: "Hello World!" });
    });

    router.get("/agents", (_, res) => {
        const agents = directClient.getAgents();
        const agentsList = Array.from(agents.values()).map((agent) => ({
            id: agent.agentId,
            name: agent.character.name,
            clients: Object.keys(agent.clients),
        }));
        res.json({ agents: agentsList });
    });

    router.get(
        "/agents/:agentId/channels",
        async (req: express.Request, res: express.Response) => {
            try {
                await handleGetChannels(req, res, directClient);
            } catch (error) {
                if (error instanceof AgentNotFound) {
                    res.status(404).json({
                        error: error.message,
                    });
                } else {
                    res.status(500).json({
                        error: "Error processing channels",
                        details: error.message,
                    });
                }
            }
        }
    );

    router.post(
        "/:agentId/message",
        upload.single("file"),
        async (req: express.Request, res: express.Response) => {
            try {
                await handleMessage(req, res, directClient);
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
                        error: "Error processing message",
                        details: error.message,
                    });
                }
            }
        }
    );

    router.post(
        "/:agentId/whisper",
        upload.single("file"),
        async (req: CustomRequest, res: express.Response) => {
            try {
                await handleWhisper(req, res, directClient);
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
    );

    router.post(
        "/:agentId/image",
        async (req: express.Request, res: express.Response) => {
            try {
                await handleImage(req, res, directClient);
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
    );

    router.post(
        "/:agentId/speak",
        async (req: express.Request, res: express.Response) => {
            try {
                await handleSpeak(req, res, directClient);
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
    );

    return router;
}
