import express from "express";
import crypto from "crypto";
import {
    elizaLogger,
    getEnvVariable,
    InteractionLogger,
    Memory,
    stringToUuid,
    UUID,
    generateShouldRespond,
    composeContext,
    ModelClass,
} from "@elizaos/core";
import { DirectClient } from "../client";
import {
    DiscourseWebhookData,
    DiscourseEventType,
    PostCreatedPayload,
} from "../types/discourse";
import { DiscourseMsgHandler } from "./discourseMsgHandler";
import { genResponse } from "./helpers";
import { discourseShouldRespondTemplate } from "../templates";
import { DiscourseClient } from "../clients/discourseClient";
import {
    discourseHandlerCallback,
    extractTopicId,
    extractPostNumber,
    isReplyPost,
    formatDiscourseResponse,
} from "../utils/discourseUtils";

const VALID_EVENT_TYPES = ["post_created"];

export async function handleDiscourseWebhook(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
): Promise<void> {
    try {
        validateRequestParams(req);
        const webhookData = validateDiscourseWebhook(req);

        elizaLogger.debug("Validated webhook:", webhookData);

        if (!shouldProcessEvent(webhookData)) {
            res.status(200).json({
                status: "ignored",
                reason: "Event filtered out",
            });
            return;
        }

        // Validate agent runtime exists before accepting
        const agentId = req.params.agentId;
        const runtime = directClient.getRuntime(agentId);
        if (!runtime) {
            res.status(404).json({
                error: "Agent runtime not found",
            });
            return;
        }

        // Validate critical payload fields before accepting
        try {
            extractTopicId(webhookData.payload);
            extractPostNumber(webhookData.payload);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            res.status(400).json({
                error: errorMessage,
            });
            return;
        }

        res.status(200).json({
            status: "accepted",
            message: "Accepted for processing",
        });

        processWebhookAsync(req, res, directClient, webhookData);
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        elizaLogger.error("Error processing discourse webhook:", error);

        if (errorMessage === "Agent ID is required") {
            res.status(400).json({
                error: errorMessage,
            });
            return;
        }

        if (errorMessage === "Invalid webhook signature") {
            res.status(401).json({
                error: errorMessage,
            });
            return;
        }

        res.status(500).json({
            error: errorMessage,
        });
    }
}

async function processWebhookAsync(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient,
    webhookData: DiscourseWebhookData
): Promise<void> {
    try {
        await handle(req, res, directClient, webhookData);
    } catch (error) {
        elizaLogger.error("Error in async webhook processing:", error);
    }
}

export async function handle(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient,
    webhookData: DiscourseWebhookData
): Promise<Memory> {
    const discourseMsgHandler = new DiscourseMsgHandler(req, res, directClient);
    const {
        roomId,
        userId,
        runtime,
        agentId,
        userMessage,
        messageId,
        memory,
        state: initialState,
    } = await discourseMsgHandler.initiateDiscourseProcessing(webhookData);
    const state = initialState;

    InteractionLogger.logMessageReceived({
        client: "direct",
        agentId: agentId as UUID,
        userId: userId as UUID,
        roomId: roomId as UUID,
        messageId: memory.id,
    });

    const shouldRespondContext = composeContext({
        state,
        template:
            runtime.character.templates?.shouldRespondTemplate ||
            discourseShouldRespondTemplate,
    });

    const shouldRespondDecision = await generateShouldRespond({
        runtime,
        context: shouldRespondContext,
        modelClass: ModelClass.SMALL,
        message: memory,
        tags: ["discourse", "discourse-should-respond"],
    });

    if (shouldRespondDecision !== "RESPOND") {
        elizaLogger.log(
            `Agent decided not to respond: ${shouldRespondDecision}`
        );
        return null;
    }

    const { response } = await genResponse(runtime, state, memory);

    const formattedResponse = formatDiscourseResponse(response);

    const topicId = extractTopicId(webhookData.payload);
    const originalPostNumber = extractPostNumber(webhookData.payload);
    const replyToPostNumber = isReplyPost(webhookData.payload)
        ? originalPostNumber
        : undefined;

    try {
        const discourseClient = new DiscourseClient();

        elizaLogger.debug("Sending response to Discourse", {
            topicId,
            replyToPostNumber,
            responseLength: formattedResponse.text?.length || 0,
        });

        const responseMemory = await discourseHandlerCallback(
            discourseClient,
            formattedResponse,
            roomId as UUID,
            runtime,
            topicId,
            replyToPostNumber
        );

        InteractionLogger.logAgentResponse({
            client: "direct",
            agentId: agentId as UUID,
            userId: userId as UUID,
            roomId: roomId as UUID,
            messageId: responseMemory.id,
            status: "sent",
        });

        return responseMemory;
    } catch (error) {
        elizaLogger.error("Failed to send response to Discourse:", error);

        InteractionLogger.logAgentResponse({
            client: "direct",
            agentId: agentId as UUID,
            userId: userId as UUID,
            roomId: roomId as UUID,
            messageId: memory.id,
            status: "error",
        });

        const responseMessage: Memory = {
            id: stringToUuid(messageId + "-" + agentId),
            ...userMessage,
            userId: agentId,
            content: formattedResponse,
            createdAt: Date.now(),
        };

        await runtime.messageManager.createMemory({
            memory: responseMessage,
            isUnique: true,
        });

        throw error;
    }
}

function validateRequestParams(req: express.Request) {
    if (!req.params?.agentId) {
        throw new Error("Agent ID is required");
    }
}

export function validateDiscourseWebhook(
    req: express.Request
): DiscourseWebhookData {
    const headers = req.headers;

    const instance = headers["x-discourse-instance"];
    const eventId = headers["x-discourse-event-id"];
    const eventType = headers["x-discourse-event"];
    const signature = headers["x-discourse-event-signature"];

    if (!instance || !eventId || !eventType || !signature) {
        throw new Error("Missing required Discourse webhook headers");
    }

    if (!validateWebhookSignature(req.body, signature as string)) {
        throw new Error("Invalid webhook signature");
    }

    return {
        eventType: eventType as DiscourseEventType,
        instance: instance as string,
        eventId: eventId as string,
        signature: signature as string,
        payload: req.body,
    };
}

export function validateWebhookSignature(
    payload: any,
    signature: string
): boolean {
    const webhookSecret = getEnvVariable("DISCOURSE_WEBHOOK_SECRET");

    if (!webhookSecret) {
        elizaLogger.warn(
            "DISCOURSE_WEBHOOK_SECRET not configured, skipping signature validation"
        );
        return true;
    }

    try {
        if (!signature.startsWith("sha256=")) {
            return false;
        }

        const providedHash = signature.substring(7);

        const payloadString = JSON.stringify(payload);
        const expectedHash = crypto
            .createHmac("sha256", webhookSecret)
            .update(payloadString, "utf8")
            .digest("hex");

        // Use timing-safe comparison to prevent timing attacks
        return crypto.timingSafeEqual(
            Buffer.from(providedHash, "hex"),
            Buffer.from(expectedHash, "hex")
        );
    } catch (error) {
        elizaLogger.error("Error validating webhook signature:", error);
        return false;
    }
}

export function shouldProcessEvent({
    eventType,
    payload,
}: DiscourseWebhookData): boolean {
    if (!isValidEventType(eventType)) {
        return false;
    }

    return shouldProcessPost(payload);
}

function shouldProcessPost({ post }: PostCreatedPayload): boolean {
    if (post.deleted_at || post.user_deleted) {
        return false;
    }

    if (post.hidden) {
        return false;
    }

    try {
        const agentUsername = getEnvVariable("DISCOURSE_API_USERNAME");
        if (agentUsername && post.username === agentUsername) {
            elizaLogger.debug("Ignoring message from myself", {
                username: post.username,
                postId: post.id,
            });
            return false;
        }
    } catch (error) {
        elizaLogger.warn(
            "Could not retrieve agent username for self-message filtering:",
            error
        );
    }

    return true;
}

function isValidEventType(eventType: string): eventType is DiscourseEventType {
    return VALID_EVENT_TYPES.includes(eventType);
}
