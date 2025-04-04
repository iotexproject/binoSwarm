import express from "express";
import * as path from "path";

import {
    AgentRuntime,
    stringToUuid,
    Content,
    ModelClass,
    composeContext,
    generateMessageResponse,
    State,
    Media,
    ServiceType,
    IImageDescriptionService,
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

export async function genResponse(runtime: AgentRuntime, state: State) {
    const context = composeContext({
        state,
        template: messageHandlerTemplate,
    });

    return generateMessageResponse({
        runtime: runtime,
        context,
        modelClass: ModelClass.LARGE,
    });
}

export async function composeContent(
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

function extractTextFromRequest(req: express.Request) {
    const text = req.body.text;

    if (!text) {
        throw new NoTextError();
    }

    return text;
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
