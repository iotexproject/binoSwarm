import express from "express";
import * as path from "path";
import { REST, Routes } from "discord.js";

import {
    AgentRuntime,
    stringToUuid,
    Media,
    getEmbeddingZeroVector,
    Content,
    Memory,
    ModelClass,
    composeContext,
    generateMessageResponse,
    State,
    generateCaption,
    generateImage,
    ServiceType,
    IImageDescriptionService,
} from "@elizaos/core";

import { DirectClient } from "./client";
import { NoResponseError, NoTextError } from "./errors";
import { messageHandlerTemplate } from "./templates";
import { CustomRequest } from "./types";
import { ISpeechService } from "@elizaos/core";

export async function handleMessage(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
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

        // Send initial response immediately
        const responseData = {
            id: messageId,
            ...response,
        };
        res.write(`data: ${JSON.stringify(responseData)}\n\n`);

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

        // Process actions and stream any additional messages
        await runtime.processActions(
            memory,
            [responseMessage],
            state,
            async (content: Content) => {
                if (content) {
                    const messageData = {
                        id: stringToUuid(Date.now().toString() + "-" + userId),
                        ...content,
                    };
                    const stringifiedMessageData = JSON.stringify(messageData);
                    console.log(stringifiedMessageData);
                    res.write(`data: ${stringifiedMessageData}\n\n`);
                }
                return [memory];
            }
        );

        // Run evaluators last
        await runtime.evaluate(memory, state);

        // End the stream
        res.write("event: end\ndata: stream completed\n\n");
        res.end();
    } catch (error) {
        res.write(
            `event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`
        );
        res.end();
    }
}

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

export async function handleSpeak(
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

export async function handleImage(
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

export async function handleGetChannels(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    const runtime = directClient.getRuntime(req.params.agentId);

    const API_TOKEN = runtime.getSetting("DISCORD_API_TOKEN") as string;
    const rest = new REST({ version: "10" }).setToken(API_TOKEN);

    const guilds = (await rest.get(Routes.userGuilds())) as Array<any>;

    res.json({
        id: runtime.agentId,
        guilds,
        serverCount: guilds.length,
    });
}

async function collectAndDescribeAttachments(
    req: express.Request,
    runtime: AgentRuntime
) {
    const attachments: Media[] = [];
    if (req.file) {
        const filePath = path.join(
            process.cwd(),
            "data",
            "uploads",
            req.file.filename
        );
        const { title, description } = await desribePhoto(filePath, runtime);

        attachments.push({
            id: Date.now().toString(),
            url: filePath,
            title,
            source: "direct",
            description,
            text: "",
            contentType: req.file.mimetype,
        });
    }

    return attachments;
}

async function desribePhoto(photoUrl: string, runtime: AgentRuntime) {
    return runtime
        .getService<IImageDescriptionService>(ServiceType.IMAGE_DESCRIPTION)
        .describeImage(photoUrl);
}

async function genResponse(runtime: AgentRuntime, state: State) {
    const context = composeContext({
        state,
        template: messageHandlerTemplate,
    });

    const response = await generateMessageResponse({
        runtime: runtime,
        context,
        modelClass: ModelClass.LARGE,
    });

    if (!response) {
        throw new NoResponseError();
    }

    return response;
}

function genRoomId(req: express.Request) {
    return stringToUuid(
        req.body.roomId ?? "default-room-" + req.params.agentId
    );
}

function genUserId(req: express.Request) {
    return stringToUuid(req.body.userId ?? "user");
}

function extractTextFromRequest(req: express.Request) {
    const text = req.body.text;

    if (!text) {
        throw new NoTextError();
    }

    return text;
}

async function composeContent(
    req: express.Request,
    runtime: AgentRuntime
): Promise<Content> {
    const text = extractTextFromRequest(req);
    const attachments = await collectAndDescribeAttachments(req, runtime);

    return {
        text,
        attachments,
        source: "direct",
        inReplyTo: undefined,
    };
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
