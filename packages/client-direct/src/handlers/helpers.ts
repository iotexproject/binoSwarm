import express from "express";
import * as path from "path";

import {
    stringToUuid,
    Content,
    ModelClass,
    composeContext,
    generateMessageResponse,
    State,
    Media,
    ServiceType,
    IImageDescriptionService,
    IAgentRuntime,
    Memory,
} from "@elizaos/core";

import { NoTextError } from "../errors";
import { messageHandlerTemplate } from "../templates";

export function genRoomId(req: express.Request) {
    return stringToUuid(
        req.body.roomId ?? "default-room-" + req.params.agentId
    );
}

export function genUserId(req: express.Request) {
    return stringToUuid(req.body.userId ?? "user");
}

export async function genResponse(
    runtime: IAgentRuntime,
    state: State,
    message: Memory,
    customTemplate?: string
) {
    const context = composeContext({
        state,
        template:
            customTemplate ||
            runtime.character.templates?.directMessageHandlerTemplate ||
            runtime.character.templates?.messageHandlerTemplate ||
            messageHandlerTemplate,
    });

    const response = await generateMessageResponse({
        runtime: runtime,
        context,
        modelClass: ModelClass.LARGE,
        message,
        tags: ["direct", "direct-response"],
    });

    return { response, context };
}

export async function composeContent(
    req: express.Request,
    runtime: IAgentRuntime
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

function extractTextFromRequest(req: express.Request) {
    const text = req.body.text;

    if (!text) {
        throw new NoTextError();
    }

    return text;
}

export async function collectAndDescribeAttachments(
    req: express.Request,
    runtime: IAgentRuntime
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

async function desribePhoto(photoUrl: string, runtime: IAgentRuntime) {
    return runtime
        .getService<IImageDescriptionService>(ServiceType.IMAGE_DESCRIPTION)
        .describeImage(photoUrl);
}

export function stringifyContent(userId: string, content: Content) {
    const messageData = {
        id: stringToUuid(Date.now().toString() + "-" + userId),
        ...content,
    };
    return JSON.stringify(messageData);
}
