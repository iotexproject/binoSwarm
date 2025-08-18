import { Message } from "@telegraf/types";
import { Context, Telegraf } from "telegraf";
import {
    composeContext,
    elizaLogger,
    ServiceType,
    composeRandomUser,
    MessageProcessor,
} from "@elizaos/core";
import {
    Content,
    HandlerCallback,
    IAgentRuntime,
    IImageDescriptionService,
    InteractionLogger,
    Memory,
    ModelClass,
    State,
    UUID,
    Media,
    cosineSimilarity,
    splitMessage,
} from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";

import { generateMessageResponse, generateShouldRespond } from "@elizaos/core";

import { escapeMarkdown } from "./utils";
import { MESSAGE_CONSTANTS } from "./constants";
import {
    telegramShouldRespondTemplate,
    telegramMessageHandlerTemplate,
} from "./templates";

import fs from "fs";

const MAX_MESSAGE_LENGTH = 4096; // Telegram's max message length

interface MessageContext {
    content: string;
    timestamp: number;
}

export type InterestChats = {
    [key: string]: {
        currentHandler: string | undefined;
        lastMessageSent: number;
        messages: { userId: UUID; userName: string; content: Content }[];
        previousContext?: MessageContext;
        contextSimilarityThreshold?: number;
    };
};

export class MessageManager {
    public bot: Telegraf<Context>;
    private runtime: IAgentRuntime;
    private interestChats: InterestChats = {};

    constructor(bot: Telegraf<Context>, runtime: IAgentRuntime) {
        this.bot = bot;
        this.runtime = runtime;
        this.initializeCommands();
    }

    public async handleMessage(ctx: Context): Promise<void> {
        const shouldSkip = this.isOutOfScope(ctx);
        if (shouldSkip) {
            return;
        }
        const userId = ctx.from.id.toString();
        const userIdUUID = stringToUuid(userId);

        const { username, first_name } = ctx.from;
        const userName = username || first_name || "Unknown User";

        const chatId = ctx.chat?.id.toString();
        const roomId = stringToUuid(chatId + "-" + this.runtime.agentId);

        const message = ctx.message;
        const msgRawId = message.message_id.toString();
        const messageId = stringToUuid(msgRawId + "-" + roomId);

        const msgProcessor = new MessageProcessor(this.runtime);

        try {
            const attachments = await this.processImage(message);
            const inReplyTo =
                "reply_to_message" in message && message.reply_to_message
                    ? stringToUuid(
                          message.reply_to_message.message_id.toString() +
                              "-" +
                              roomId.toString()
                      )
                    : undefined;
            let messageText = "";
            if ("text" in message) {
                messageText = message.text;
            } else if ("caption" in message && message.caption) {
                messageText = message.caption;
            }

            const { memory, state } = await msgProcessor.preprocess({
                rawMessageId: msgRawId,
                text: messageText,
                attachments,
                rawUserId: userId,
                rawRoomId: chatId + "-" + this.runtime.agentId,
                userName,
                userScreenName: first_name,
                source: "telegram",
                inReplyTo,
                createdAt: message.date * 1000,
            });
            // Decide whether to respond
            const shouldRespond = await this._shouldRespond(
                message,
                state,
                memory
            );

            if (!shouldRespond) {
                InteractionLogger.logAgentResponse({
                    client: "telegram",
                    agentId: this.runtime.agentId,
                    userId: userIdUUID,
                    roomId,
                    messageId,
                    status: "ignored",
                });
            }

            const callback: HandlerCallback = async (content: Content) => {
                try {
                    if (!content.inReplyTo && message.message_id) {
                        content.inReplyTo = messageId;
                    }
                    const sentMessages = await this.sendMessageInChunks(
                        ctx,
                        content,
                        message.message_id
                    );
                    const memories: Memory[] = [];
                    if (sentMessages && sentMessages.length > 0) {
                        await this.populateMemories(
                            sentMessages,
                            roomId,
                            content,
                            messageId,
                            memories
                        );
                    }
                    return memories;
                } catch (error) {
                    elizaLogger.error("❌ Error in Telegram callback:", error);
                    return [];
                }
            };

            if (shouldRespond) {
                const template =
                    this.runtime.character.templates
                        ?.telegramMessageHandlerTemplate ||
                    this.runtime.character?.templates?.messageHandlerTemplate ||
                    telegramMessageHandlerTemplate;
                const tags = ["telegram", "telegram-response"];
                await msgProcessor.respond(template, tags, callback);
            }
        } catch (error) {
            elizaLogger.error("❌ Error handling message:", error);
        }
    }

    private async populateMemories(
        sentMessages: Message.TextMessage[],
        roomId: UUID,
        content: Content,
        messageId: UUID,
        memories: Memory[]
    ) {
        // Create memories for each sent message
        for (let i = 0; i < sentMessages.length; i++) {
            const sentMessage = sentMessages[i];
            const isLastMessage = i === sentMessages.length - 1;

            const memory: Memory = {
                id: stringToUuid(
                    sentMessage.message_id.toString() + "-" + roomId.toString()
                ),
                agentId: this.runtime.agentId,
                userId: this.runtime.agentId,
                roomId,
                content: {
                    ...content,
                    text: sentMessage.text,
                    inReplyTo: messageId,
                },
                createdAt: sentMessage.date * 1000,
            };

            memory.content.action = !isLastMessage
                ? "CONTINUE"
                : content.action;

            await this.runtime.messageManager.createMemory({
                memory,
                isUnique: true,
            });
            memories.push(memory);
        }
        return memories;
    }

    private async _analyzeContextSimilarity(
        currentMessage: string,
        previousContext?: MessageContext,
        agentLastMessage?: string
    ): Promise<number> {
        if (!previousContext) return 1;

        const timeDiff = Date.now() - previousContext.timestamp;
        const timeWeight = Math.max(0, 1 - timeDiff / (5 * 60 * 1000));

        const similarity = cosineSimilarity(
            currentMessage.toLowerCase(),
            previousContext.content.toLowerCase(),
            agentLastMessage?.toLowerCase()
        );

        return similarity * timeWeight;
    }

    private async _shouldRespondBasedOnContext(
        message: Message,
        chatState: InterestChats[string]
    ): Promise<boolean> {
        const messageText =
            "text" in message
                ? message.text
                : "caption" in message
                  ? (message as any).caption
                  : "";

        if (!messageText) return false;

        // Always respond if mentioned
        if (this._isMessageForMe(message)) return true;

        // If we're not the current handler, don't respond
        if (chatState?.currentHandler !== this.bot.botInfo?.id.toString())
            return false;

        // Check if we have messages to compare
        if (!chatState.messages?.length) return false;

        // Get last user message (not from the bot)
        const lastUserMessage = [...chatState.messages].reverse().find(
            (m, index) =>
                index > 0 && // Skip first message (current)
                m.userId !== this.runtime.agentId
        );

        if (!lastUserMessage) return false;

        const lastSelfMemories = await this.runtime.messageManager.getMemories({
            roomId: stringToUuid(
                message.chat.id.toString() + "-" + this.runtime.agentId
            ),
            unique: false,
            count: 5,
        });

        const lastSelfSortedMemories = lastSelfMemories
            ?.filter((m) => m.userId === this.runtime.agentId)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Calculate context similarity
        const contextSimilarity = await this._analyzeContextSimilarity(
            messageText,
            {
                content: lastUserMessage.content.text || "",
                timestamp: Date.now(),
            },
            lastSelfSortedMemories?.[0]?.content?.text
        );

        const similarityThreshold =
            this.runtime.character.clientConfig?.telegram
                ?.messageSimilarityThreshold ||
            chatState.contextSimilarityThreshold ||
            MESSAGE_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD;

        return contextSimilarity >= similarityThreshold;
    }

    private _isMessageForMe(message: Message): boolean {
        const botUsername = this.bot.botInfo?.username;
        if (!botUsername) return false;

        const messageText =
            "text" in message
                ? message.text
                : "caption" in message
                  ? (message as any).caption
                  : "";
        if (!messageText) return false;

        const isReplyToBot =
            (message as any).reply_to_message?.from?.is_bot === true &&
            (message as any).reply_to_message?.from?.username === botUsername;
        const isMentioned = messageText.includes(`@${botUsername}`);
        const hasUsername = messageText
            .toLowerCase()
            .includes(botUsername.toLowerCase());

        return (
            isReplyToBot ||
            isMentioned ||
            !message.chat.type ||
            message.chat.type === "private" ||
            (!this.runtime.character.clientConfig?.telegram
                ?.shouldRespondOnlyToMentions &&
                hasUsername)
        );
    }

    private async processImage(message: Message): Promise<Media[]> {
        const attachments: Media[] = [];

        try {
            const imageUrl = await this.extractImgUrl(message);

            if (imageUrl) {
                const imageDescriptionService =
                    this.runtime.getService<IImageDescriptionService>(
                        ServiceType.IMAGE_DESCRIPTION
                    );
                const { title, description } =
                    await imageDescriptionService.describeImage(imageUrl);
                attachments.push({
                    id: `image-${Date.now()}`,
                    url: imageUrl,
                    title: title || "Image",
                    source: "Telegram",
                    description: description || "Image description",
                    text: description || "Image content not available",
                });
            }
        } catch (error) {
            elizaLogger.error("❌ Error processing image:", error);
        }

        return attachments;
    }

    private async extractImgUrl(message: Message): Promise<string | null> {
        let imageUrl: string | null = null;

        if ("photo" in message && message.photo?.length > 0) {
            const photo = message.photo[message.photo.length - 1];
            const fileLink = await this.bot.telegram.getFileLink(photo.file_id);
            imageUrl = fileLink.toString();
        } else if (
            "document" in message &&
            message.document?.mime_type?.startsWith("image/")
        ) {
            const fileLink = await this.bot.telegram.getFileLink(
                message.document.file_id
            );
            imageUrl = fileLink.toString();
        }
        return imageUrl;
    }

    private async _shouldRespond(
        message: Message,
        state: State,
        memory: Memory
    ): Promise<boolean> {
        const isMentioned = this.checkIfMentioned(message);
        const isDM = this.checkIfDM(message);

        if (isMentioned || isDM) {
            return true;
        }

        const chatId = message.chat.id.toString();
        const chatState = this.interestChats[chatId];

        if (chatState?.currentHandler) {
            const shouldRespondContext =
                await this._shouldRespondBasedOnContext(message, chatState);

            if (!shouldRespondContext) {
                return false;
            }
        }

        // Use AI to decide for text or captions
        if ("text" in message || ("caption" in message && message.caption)) {
            const shouldRespondContext = composeContext({
                state,
                template:
                    this.runtime.character.templates
                        ?.telegramShouldRespondTemplate ||
                    this.runtime.character?.templates?.shouldRespondTemplate ||
                    composeRandomUser(telegramShouldRespondTemplate, 2),
            });

            const response = await generateShouldRespond({
                runtime: this.runtime,
                context: shouldRespondContext,
                modelClass: ModelClass.SMALL,
                message: memory,
                tags: ["telegram", "telegram-should-respond"],
            });

            return response === "RESPOND";
        }

        return false;
    }

    private checkIfDM(message: Message) {
        return message.chat.type === "private";
    }

    private checkIfMentioned(message: Message) {
        return message["text"]?.includes(`@${this.bot.botInfo?.username}`);
    }

    private async sendMessageInChunks(
        ctx: Context,
        content: Content,
        replyToMessageId?: number
    ): Promise<Message.TextMessage[]> {
        if (content.attachments && content.attachments.length > 0) {
            content.attachments.map(async (attachment: Media) => {
                if (attachment.contentType === "image/gif") {
                    // Handle GIFs specifically
                    await this.sendAnimation(
                        ctx,
                        attachment.url,
                        attachment.description
                    );
                } else if (attachment.contentType.startsWith("image")) {
                    await this.sendImage(
                        ctx,
                        attachment.url,
                        attachment.description
                    );
                }
            });
            return [];
        } else {
            const chunks = splitMessage(content.text, MAX_MESSAGE_LENGTH);
            const sentMessages: Message.TextMessage[] = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = escapeMarkdown(chunks[i]);
                const sentMessage = (await ctx.telegram.sendMessage(
                    ctx.chat.id,
                    chunk,
                    {
                        reply_parameters:
                            i === 0 && replyToMessageId
                                ? { message_id: replyToMessageId }
                                : undefined,
                        parse_mode: "Markdown",
                    }
                )) as Message.TextMessage;

                sentMessages.push(sentMessage);
            }

            return sentMessages;
        }
    }

    private async sendImage(
        ctx: Context,
        imagePath: string,
        caption?: string
    ): Promise<void> {
        try {
            if (/^(http|https):\/\//.test(imagePath)) {
                // Handle HTTP URLs
                await ctx.telegram.sendPhoto(ctx.chat.id, imagePath, {
                    caption,
                });
            } else {
                // Handle local file paths
                if (!fs.existsSync(imagePath)) {
                    throw new Error(`File not found: ${imagePath}`);
                }

                const fileStream = fs.createReadStream(imagePath);

                await ctx.telegram.sendPhoto(
                    ctx.chat.id,
                    {
                        source: fileStream,
                    },
                    {
                        caption,
                    }
                );
            }

            elizaLogger.info(`Image sent successfully: ${imagePath}`);
        } catch (error) {
            elizaLogger.error("Error sending image:", error);
        }
    }

    private async sendAnimation(
        ctx: Context,
        animationPath: string,
        caption?: string
    ): Promise<void> {
        try {
            if (/^(http|https):\/\//.test(animationPath)) {
                // Handle HTTP URLs
                await ctx.telegram.sendAnimation(ctx.chat.id, animationPath, {
                    caption,
                });
            } else {
                // Handle local file paths
                if (!fs.existsSync(animationPath)) {
                    throw new Error(`File not found: ${animationPath}`);
                }

                const fileStream = fs.createReadStream(animationPath);

                await ctx.telegram.sendAnimation(
                    ctx.chat.id,
                    {
                        source: fileStream,
                    },
                    {
                        caption,
                    }
                );
            }

            elizaLogger.info(`Animation sent successfully: ${animationPath}`);
        } catch (error) {
            elizaLogger.error("Error sending animation:", error);
        }
    }

    private async _generateResponse(
        message: Memory,
        _state: State,
        context: string
    ): Promise<Content> {
        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
            message,
            tags: ["telegram", "telegram-response"],
        });

        return response;
    }

    private isOutOfScope(ctx: Context): boolean {
        const config = this.runtime.character.clientConfig?.telegram;
        const emptyMessageOrFrom = !ctx.message || !ctx.from;
        const shouldIgnoreBots = config?.shouldIgnoreBotMessages;
        const isIgnoringBot = shouldIgnoreBots && ctx.from.is_bot;
        const shouldIgnoreDM = config?.shouldIgnoreDirectMessages;
        const isIgnoringDM = shouldIgnoreDM && ctx.chat?.type === "private";
        const onlyMentions = config?.shouldRespondOnlyToMentions;
        const notForMe = onlyMentions && !this._isMessageForMe(ctx.message);

        return notForMe || emptyMessageOrFrom || isIgnoringBot || isIgnoringDM;
    }

    private initializeCommands(): void {
        try {
            this.bot.command("start", async (ctx: Context) => {
                await this.handleStartCommand(ctx);
            });
        } catch (error) {
            elizaLogger.error("Error handling start command:", error);
        }
    }

    private async handleStartCommand(ctx: Context): Promise<void> {
        if (ctx.chat?.type !== "private") {
            return;
        }

        try {
            await ctx.sendMessage(
                "Welcome to " +
                    ctx.botInfo?.username +
                    "! Let's the DePIN revolution begin!"
            );
        } catch (error) {
            elizaLogger.error("Error handling start command:", error);
        }
    }
}
