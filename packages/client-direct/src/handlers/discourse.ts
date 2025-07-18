import express from "express";
import crypto from "crypto";
import { elizaLogger, getEnvVariable } from "@elizaos/core";
import { DirectClient } from "../client";
import {
    DiscourseWebhookData,
    DiscourseEventType,
    PostCreatedPayload,
} from "../types/discourse";

const VALID_EVENT_TYPES = ["post_created"];

export async function handleDiscourseWebhook(
    req: express.Request,
    res: express.Response,
    _directClient: DirectClient
): Promise<void> {
    try {
        const webhookData = validateDiscourseWebhook(req);

        elizaLogger.log("Validated webhook:", webhookData);

        if (!shouldProcessEvent(webhookData)) {
            res.status(200).json({
                status: "ignored",
                reason: "Event filtered out",
            });
            return;
        }

        // TODO: Process the webhook data and generate response
        // This will be implemented in next phase
        elizaLogger.log(
            "Processing webhook:",
            webhookData.eventType,
            webhookData.eventId
        );

        res.status(200).json({ status: "processed" });
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        elizaLogger.error("Error processing discourse webhook:", error);

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
        return true; // Allow through if no secret configured
    }

    try {
        // Extract the hash from the signature (format: "sha256=<hash>")
        if (!signature.startsWith("sha256=")) {
            return false;
        }

        const providedHash = signature.substring(7); // Remove "sha256=" prefix

        // Compute the expected hash
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

    return true;
}

function isValidEventType(eventType: string): eventType is DiscourseEventType {
    return VALID_EVENT_TYPES.includes(eventType);
}

// Future implementations will go here:
// - processDiscourseQuestion()
// - postDiscourseReply()
// - shouldIgnoreLLMCall()
