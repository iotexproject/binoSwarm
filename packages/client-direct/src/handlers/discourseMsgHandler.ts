import express from "express";
import {
    stringToUuid,
    Memory,
    IAgentRuntime,
    Content,
    UUID,
    State,
} from "@elizaos/core";
import { DirectClient } from "../client";
import { DiscourseWebhookData } from "../types/discourse";
import { UserMessage } from "../types";

export class DiscourseMsgHandler {
    private req: express.Request;
    private res: express.Response;
    private directClient: DirectClient;

    constructor(
        req: express.Request,
        res: express.Response,
        directClient: DirectClient
    ) {
        this.req = req;
        this.res = res;
        this.directClient = directClient;
    }

    async initiateDiscourseProcessing(
        webhookData: DiscourseWebhookData
    ): Promise<{
        roomId: UUID;
        userId: UUID;
        runtime: IAgentRuntime;
        agentId: UUID;
        content: Content;
        messageId: UUID;
        memory: Memory;
        state: State;
        userMessage: UserMessage;
    }> {
        const { post } = webhookData.payload;

        const roomId = this.genDiscourseRoomId(post.topic_id);
        const userId = this.genDiscourseUserId(post.username);

        const runtime = this.directClient.getRuntime(this.req.params.agentId);
        if (!runtime) {
            throw new Error("Agent runtime not found");
        }
        const agentId = runtime.agentId;

        await runtime.ensureConnection(
            userId,
            roomId,
            post.username,
            post.username,
            "discourse"
        );

        // Create content from post data
        const content = this.composeDiscourseContent(post);

        // Create message structure
        const discourseMessage: UserMessage = {
            content,
            userId,
            roomId,
            agentId,
        };

        const messageId = stringToUuid(Date.now().toString());
        const memory: Memory = {
            id: stringToUuid(messageId + "-" + userId),
            ...discourseMessage,
            createdAt: Date.now(),
        };

        await runtime.messageManager.createMemory({
            memory,
            isUnique: true,
        });

        const state = await runtime.composeState(discourseMessage, {
            agentName: runtime.character.name,
        });

        return {
            roomId,
            userId,
            runtime,
            agentId,
            content,
            messageId,
            memory,
            state,
            userMessage: discourseMessage,
        };
    }

    private genDiscourseRoomId(topicId: number): UUID {
        return stringToUuid(`discourse-topic-${topicId}`);
    }

    private genDiscourseUserId(username: string): UUID {
        return stringToUuid(`discourse-user-${username}`);
    }

    private composeDiscourseContent(post: any): Content {
        return {
            text: post.raw,
            attachments: [], // Discourse posts don't have attachments in this implementation
            source: "discourse",
            inReplyTo: undefined,
        };
    }
}
