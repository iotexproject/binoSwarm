import {
    elizaLogger,
    Memory,
    Content,
    UUID,
    stringToUuid,
    IAgentRuntime,
} from "@elizaos/core";
import { DiscourseClient } from "../clients/discourseClient";
import {
    DiscoursePostRequest,
    DiscoursePostResponse,
} from "../types/discourse";

export async function discourseHandlerCallback(
    discourseClient: DiscourseClient,
    response: Content,
    roomId: UUID,
    runtime: IAgentRuntime,
    topicId: number,
    replyToPostNumber: number
): Promise<Memory> {
    const memory = await sendDiscoursePost(
        discourseClient,
        response,
        roomId,
        runtime,
        topicId,
        replyToPostNumber
    );

    await runtime.messageManager.createMemory({
        memory: memory,
        isUnique: true,
    });

    return memory;
}

export async function sendDiscoursePost(
    discourseClient: DiscourseClient,
    content: Content,
    roomId: UUID,
    runtime: IAgentRuntime,
    topicId: number,
    replyToPostNumber: number
): Promise<Memory> {
    if (!content.text || content.text.trim().length === 0) {
        elizaLogger.error("Cannot send empty post to Discourse");
        return null;
    }

    try {
        const postData: DiscoursePostRequest = {
            raw: content.text.trim(),
            topic_id: topicId,
            created_at: new Date().toISOString(),
            reply_to_post_number: replyToPostNumber,
        };

        elizaLogger.debug("Sending post to Discourse", {
            topicId,
            replyToPostNumber,
            contentLength: content.text.length,
        });

        const discourseResponse: DiscoursePostResponse =
            await discourseClient.createPost(postData);

        const memory: Memory = {
            id: stringToUuid(
                discourseResponse.id.toString() + "-" + runtime.agentId
            ),
            agentId: runtime.agentId,
            userId: runtime.agentId,
            content: {
                text: discourseResponse.raw,
                source: "discourse",
                url: buildPostUrl(discourseClient, discourseResponse),
                inReplyTo: replyToPostNumber
                    ? stringToUuid(
                          replyToPostNumber.toString() + "-" + runtime.agentId
                      )
                    : undefined,
                postId: discourseResponse.id,
                topicId: discourseResponse.topic_id,
                postNumber: discourseResponse.post_number,
            },
            roomId,
            createdAt: new Date(discourseResponse.created_at).getTime(),
        };

        return memory;
    } catch (error) {
        elizaLogger.error("Failed to send Discourse post:", error);
        throw error;
    }
}

function buildPostUrl(
    client: DiscourseClient,
    post: DiscoursePostResponse
): string {
    const baseUrl = client.getBaseUrl();

    if (post.topic_slug) {
        return `${baseUrl}/t/${post.topic_slug}/${post.topic_id}/${post.post_number}`;
    } else {
        return `${baseUrl}/t/${post.topic_id}/${post.post_number}`;
    }
}

export function extractTopicId(webhookPayload: any): number {
    const topicId = webhookPayload?.post?.topic_id;
    if (typeof topicId !== "number" || topicId <= 0) {
        throw new Error("Invalid or missing topic_id in webhook payload");
    }
    return topicId;
}

export function extractPostNumber(webhookPayload: any): number {
    const postNumber = webhookPayload?.post?.post_number;
    if (typeof postNumber !== "number" || postNumber <= 0) {
        throw new Error("Invalid or missing post_number in webhook payload");
    }
    return postNumber;
}

export function isReplyPost(webhookPayload: any): boolean {
    const postNumber = extractPostNumber(webhookPayload);
    return postNumber > 1;
}

export function formatDiscourseResponse(content: Content): Content {
    if (!content.text) {
        return content;
    }

    let formattedText = content.text.trim();

    // Ensure we don't exceed Discourse's character limit
    const MAX_LENGTH = 32000;
    if (formattedText.length > MAX_LENGTH) {
        formattedText = formattedText.substring(0, MAX_LENGTH - 3) + "...";
        elizaLogger.warn("Discourse response truncated due to length limit");
    }

    return {
        ...content,
        text: formattedText,
    };
}
