import express from "express";
import { getEnvVariable } from "@elizaos/core";

import { DirectClient } from ".";
import { CustomRequest } from "./types";
import {
    handleImage,
    handleMessage,
    handleSpeak,
    handleWhisper,
} from "./handlersx";
import { AgentNotFound, NoTextError } from "./errors";
import { getRequests } from "./handlers";

export function createApiRouter(directClient: DirectClient) {
    const router = express.Router();
    const upload = directClient.upload;

    router.use(
        express.json({
            limit: getEnvVariable("EXPRESS_MAX_PAYLOAD") || "100kb",
        })
    );

    router.get("/", (_, res) => {
        getRequests.handleRoot(res);
    });

    router.get("/hello", (_, res) => {
        getRequests.handleHello(res);
    });

    router.get("/agents", (_, res) => {
        getRequests.handleAgents(res, directClient);
    });

    router.get(
        "/agents/:agentId/channels",
        async (req: express.Request, res: express.Response) => {
            getRequests.handleChannels(req, res, directClient);
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
