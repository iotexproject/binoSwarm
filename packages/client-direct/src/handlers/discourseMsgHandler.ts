import express from "express";
import {
    stringToUuid,
    Memory,
    IAgentRuntime,
    Content,
    UUID,
    State,
    Media,
    IImageDescriptionService,
    IBrowserService,
    ServiceType,
    elizaLogger,
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

        // Create content from post data with attachment processing
        const content = await this.composeDiscourseContent(post, runtime);

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

    private async composeDiscourseContent(
        post: any,
        runtime: IAgentRuntime
    ): Promise<Content> {
        const attachments = await this.processDiscourseAttachments(
            post.cooked,
            runtime
        );

        return {
            text: post.raw, // Keep raw for the main text content
            attachments,
            source: "discourse",
            inReplyTo: undefined,
        };
    }

    private async processDiscourseAttachments(
        postHtml: string,
        runtime: IAgentRuntime
    ): Promise<Media[]> {
        const attachments: Media[] = [];

        try {
            // Extract image URLs from HTML img tags
            const imageUrls = this.extractImageUrls(postHtml);
            await this.processImages(imageUrls, attachments, runtime);

            // Extract regular URLs from HTML anchor tags
            const regularUrls = this.extractRegularUrls(postHtml);
            await this.processUrls(regularUrls, attachments, runtime);
        } catch (error) {
            elizaLogger.error("Error processing discourse attachments:", error);
        }

        return attachments;
    }

    private async processImages(
        imageUrls: string[],
        attachments: Media[],
        runtime: IAgentRuntime
    ) {
        if (imageUrls.length > 0) {
            elizaLogger.log("Processing images in discourse post for context");

            for (const imageUrl of imageUrls) {
                try {
                    const description = await this.describeDiscourseImage(
                        imageUrl,
                        runtime
                    );

                    attachments.push({
                        id: stringToUuid(imageUrl),
                        url: imageUrl,
                        title: description.title || "Discourse Image",
                        source: "discourse",
                        description: description.description || "",
                        text: "",
                        contentType: "image",
                    });
                } catch (error) {
                    elizaLogger.error(
                        `Error describing discourse image ${imageUrl}:`,
                        error
                    );
                }
            }
        }
    }

    private async processUrls(
        urls: string[],
        attachments: Media[],
        runtime: IAgentRuntime
    ) {
        if (urls.length > 0) {
            elizaLogger.log("Processing URLs in discourse post for context");

            for (const url of urls) {
                try {
                    const browserService = runtime.getService<IBrowserService>(
                        ServiceType.BROWSER
                    );
                    if (!browserService) {
                        elizaLogger.warn(
                            "Browser service not found, skipping URL processing"
                        );
                        continue;
                    }

                    const { title, description: summary } =
                        await browserService.getPageContent(url, runtime);

                    attachments.push({
                        id: stringToUuid(url),
                        url: url,
                        title: title || "Web Page",
                        source: "discourse-web",
                        description: summary || "",
                        text: summary || "",
                        contentType: "text/html",
                    });
                } catch (error) {
                    elizaLogger.error(
                        `Error processing discourse URL ${url}:`,
                        error
                    );
                }
            }
        }
    }

    private extractImageUrls(postHtml: string): string[] {
        const imageUrls: string[] = [];

        // Extract URLs from HTML img tags: <img src="//domain.com/path" ...>
        const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
        let match;

        while ((match = imgRegex.exec(postHtml)) !== null) {
            let imageUrl = match[1];

            // Skip emoji and other UI images
            if (this.shouldSkipImage(imageUrl, match[0])) {
                continue;
            }

            // Handle different URL formats
            imageUrl = this.normalizeImageUrl(imageUrl);

            if (imageUrl) {
                imageUrls.push(imageUrl);
            }
        }

        return imageUrls;
    }

    private shouldSkipImage(imageUrl: string, fullImgTag: string): boolean {
        // Skip emoji images
        if (imageUrl.includes("/images/emoji/")) {
            return true;
        }

        // Skip if the img tag has emoji class
        if (fullImgTag.includes('class="emoji"')) {
            return true;
        }

        // Skip very small images (likely UI elements)
        const widthMatch = fullImgTag.match(/width=["']?(\d+)["']?/);
        const heightMatch = fullImgTag.match(/height=["']?(\d+)["']?/);
        if (widthMatch && heightMatch) {
            const width = parseInt(widthMatch[1]);
            const height = parseInt(heightMatch[1]);
            // Skip images smaller than 50x50 (likely emojis/icons)
            if (width < 50 && height < 50) {
                return true;
            }
        }

        return false;
    }

    private normalizeImageUrl(imageUrl: string): string | null {
        // Handle protocol-relative URLs (//domain.com/path)
        if (imageUrl.startsWith("//")) {
            return "https:" + imageUrl;
        }

        // Handle absolute URLs
        if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
            return imageUrl;
        }

        // Skip relative URLs that we can't process without context
        // In the future, we could add the discourse instance domain here
        if (imageUrl.startsWith("/")) {
            elizaLogger.debug(`Skipping relative image URL: ${imageUrl}`);
            return null;
        }

        return imageUrl;
    }

    private extractRegularUrls(postHtml: string): string[] {
        const urls: string[] = [];

        // Extract URLs from HTML anchor tags: <a href="https://..." ...>
        const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/g;
        let match;

        while ((match = anchorRegex.exec(postHtml)) !== null) {
            const url = match[1];
            // Only include http/https URLs, skip internal links
            if (url.startsWith("http://") || url.startsWith("https://")) {
                urls.push(url);
            }
        }

        return urls;
    }

    private async describeDiscourseImage(
        imageUrl: string,
        runtime: IAgentRuntime
    ) {
        return runtime
            .getService<IImageDescriptionService>(ServiceType.IMAGE_DESCRIPTION)
            .describeImage(imageUrl);
    }
}
