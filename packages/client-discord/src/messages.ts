import {
    composeContext,
    composeRandomUser,
    MsgPreprocessor,
} from "@elizaos/core";
import { generateMessageResponse, generateShouldRespond } from "@elizaos/core";
import {
    Content,
    HandlerCallback,
    IAgentRuntime,
    IBrowserService,
    ISpeechService,
    IVideoService,
    Media,
    Memory,
    ModelClass,
    ServiceType,
    State,
    UUID,
    InteractionLogger,
    cosineSimilarity,
} from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import {
    ChannelType,
    Client,
    Message as DiscordMessage,
    TextChannel,
} from "discord.js";
import { elizaLogger } from "@elizaos/core";
import { AttachmentManager } from "./attachments.ts";
import { VoiceManager } from "./voice.ts";
import {
    discordShouldRespondTemplate,
    discordMessageHandlerTemplate,
} from "./templates.ts";
import {
    IGNORE_RESPONSE_WORDS,
    LOSE_INTEREST_WORDS,
    MESSAGE_CONSTANTS,
    MESSAGE_LENGTH_THRESHOLDS,
} from "./constants";
import { sendMessageInChunks, canSendMessage } from "./utils.ts";

interface MessageContext {
    content: string;
    timestamp: number;
}

export type InterestChannels = {
    [key: string]: {
        currentHandler: string | undefined;
        lastMessageSent: number;
        messages: { userId: UUID; userName: string; content: Content }[];
        previousContext?: MessageContext;
        contextSimilarityThreshold?: number;
    };
};

export class MessageManager {
    private client: Client;
    private runtime: IAgentRuntime;
    private attachmentManager: AttachmentManager;
    private interestChannels: InterestChannels = {};
    private voiceManager: VoiceManager;

    constructor(discordClient: any, voiceManager: VoiceManager) {
        this.client = discordClient.client;
        this.voiceManager = voiceManager;
        this.runtime = discordClient.runtime;
        this.attachmentManager = new AttachmentManager(this.runtime);
    }

    async handleMessage(message: DiscordMessage) {
        const userId = message.author.id as UUID;
        const userDiscordTag = `<@${userId}>`;
        const userName = message.author.username;
        const name = message.author.displayName;
        const channelId = message.channel.id;
        const hasInterest = this._checkInterest(message.channelId);
        const roomId = stringToUuid(channelId + "-" + this.runtime.agentId);
        const userIdUUID = stringToUuid(userId);
        const messageId = this.buildMemoryId(message);

        this._logMessageReceived(userIdUUID, roomId, messageId);

        const shouldSkip = this.shouldSkip(message);
        if (shouldSkip) {
            return;
        }
        const msgPreprocessor = new MsgPreprocessor(this.runtime);

        try {
            const { processedContent, attachments } =
                await this.processMessageMedia(message);
            await this.processAudioAttachments(message, attachments);

            const inReplyTo = message.reference?.messageId
                ? stringToUuid(
                      message.reference.messageId + "-" + this.runtime.agentId
                  )
                : undefined;

            const { memory, state } = await msgPreprocessor.preprocess({
                rawMessageId: message.id,
                text: processedContent,
                attachments: [],
                rawUserId: userId,
                rawRoomId: channelId + "-" + this.runtime.agentId,
                userName,
                userScreenName: name,
                source: "discord",
                inReplyTo,
                messageUrl: message.url,
                createdAt: message.createdTimestamp,
            });

            if (memory.content.text) {
                this.updateInterest(
                    message,
                    userIdUUID,
                    userName,
                    memory.content
                );
            }

            const hasPerms = this.hasPermissionsToSendMsg(message);
            if (!hasPerms) {
                return;
            }

            const shouldIgnore = this.shouldIgnore(message);
            if (shouldIgnore) {
                return;
            }

            const agentUserState =
                await this.runtime.databaseAdapter.getParticipantUserState(
                    roomId,
                    this.runtime.agentId
                );

            if (
                this.shouldIgnoreIfMuted(agentUserState, message, hasInterest)
            ) {
                elizaLogger.log("Ignoring muted room");
                return;
            }

            const shouldRespond = await this.shouldRespond(
                message,
                state,
                agentUserState,
                memory
            );

            elizaLogger.debug("shouldRespond", {
                shouldRespond,
            });

            if (shouldRespond) {
                const context = composeContext({
                    state,
                    template:
                        this.runtime.character.templates
                            ?.discordMessageHandlerTemplate ||
                        discordMessageHandlerTemplate,
                });

                // simulate discord typing while generating a response
                const stopTyping = this.simulateTyping(message);

                const responseContent = await this._generateResponse(
                    memory,
                    state,
                    context
                ).finally(() => {
                    stopTyping();
                });

                responseContent.text = responseContent.text?.trim();
                responseContent.inReplyTo = this.buildMemoryId(message);

                if (!responseContent.text) {
                    return;
                }
                const callback: HandlerCallback = async (
                    content: Content,
                    files: any[]
                ) => {
                    try {
                        if (message.id && !content.inReplyTo) {
                            content.inReplyTo = this.buildMemoryId(message);
                        }
                        const messages = await sendMessageInChunks(
                            message.channel as TextChannel,
                            userDiscordTag + " " + content.text,
                            message.id,
                            files
                        );

                        const memories: Memory[] = [];
                        this.populateMemories(
                            messages,
                            content,
                            messageId,
                            roomId,
                            memories
                        );
                        for (const m of memories) {
                            await this.runtime.messageManager.createMemory({
                                memory: m,
                                isUnique: true,
                            });
                        }
                        return memories;
                    } catch (error) {
                        elizaLogger.error("Error sending message:", error);
                        return [];
                    }
                };

                const responseMessages = await callback(responseContent);
                state = await this.runtime.updateRecentMessageState(state);
                await this.runtime.processActions(
                    memory,
                    responseMessages,
                    state,
                    callback,
                    {
                        tags: ["discord", "discord-message"],
                    }
                );
            }
            await this.runtime.evaluate(memory, state, shouldRespond);
        } catch (error) {
            this._logAgentResponse("error", userIdUUID, roomId, messageId);
            elizaLogger.error("Error handling message:", error);
            if (message.channel.type === ChannelType.GuildVoice) {
                await this.handleErrorInVoiceChannel(userId);
            }
        }
    }

    private populateMemories(
        messages: DiscordMessage<boolean>[],
        content: Content,
        messageId: UUID,
        roomId: UUID,
        memories: Memory[]
    ) {
        for (const m of messages) {
            let action = content.action;
            // If there's only one message or it's the last message, keep the original action
            // For multiple messages, set all but the last to 'CONTINUE'
            if (messages.length > 1 && m !== messages[messages.length - 1]) {
                action = "CONTINUE";
            }

            const memory: Memory = {
                id: this.buildMemoryId(m),
                userId: this.runtime.agentId,
                agentId: this.runtime.agentId,
                content: {
                    ...content,
                    action,
                    inReplyTo: messageId,
                    url: m.url,
                },
                roomId,
                createdAt: m.createdTimestamp,
            };
            memories.push(memory);
        }
    }

    private buildMemoryId(message: DiscordMessage<boolean>) {
        return stringToUuid(message.id + "-" + this.runtime.agentId);
    }

    private async handleErrorInVoiceChannel(userId: UUID) {
        // For voice channels, use text-to-speech for the error message
        const errorMessage = "Sorry, I had a glitch. What was that?";

        const speechService = this.runtime.getService<ISpeechService>(
            ServiceType.SPEECH_GENERATION
        );
        if (!speechService) {
            throw new Error("Speech generation service not found");
        }

        const audioStream = await speechService.generate(
            this.runtime,
            errorMessage
        );
        await this.voiceManager.playAudioStream(userId, audioStream);
    }

    private shouldIgnoreIfMuted(
        agentUserState: string,
        message: DiscordMessage<boolean>,
        hasInterest: boolean
    ) {
        // Ignore muted rooms unless explicitly mentioned
        return (
            agentUserState === "MUTED" &&
            !message.mentions.has(this.client.user.id) &&
            !hasInterest
        );
    }

    private hasPermissionsToSendMsg(message: DiscordMessage<boolean>) {
        const canSendResult = canSendMessage(message.channel);
        elizaLogger.debug("canSendResult", {
            canSendResult,
        });
        if (!canSendResult.canSend) {
            elizaLogger.warn(
                `Cannot send message to channel ${message.channel}`,
                {
                    ...canSendResult,
                    missingPermissions: canSendResult.missingPermissions?.map(
                        (p) => String(p)
                    ),
                }
            );
        }
        return canSendResult.canSend;
    }

    private updateInterest(
        message: DiscordMessage<boolean>,
        userIdUUID: UUID,
        userName: string,
        content: Content
    ) {
        // Initialize the channel interest if it doesn't exist
        if (!this.interestChannels[message.channelId]) {
            this.interestChannels[message.channelId] = {
                currentHandler: this.client.user?.id,
                lastMessageSent: Date.now(),
                messages: [],
            };
        }

        // Add new message
        this.interestChannels[message.channelId].messages.push({
            userId: userIdUUID,
            userName,
            content,
        });

        // Update the last message sent timestamp
        this.interestChannels[message.channelId].lastMessageSent = Date.now();

        // Trim to keep only recent messages
        if (
            this.interestChannels[message.channelId].messages.length >
            MESSAGE_CONSTANTS.MAX_MESSAGES
        ) {
            this.interestChannels[message.channelId].messages =
                this.interestChannels[message.channelId].messages.slice(
                    -MESSAGE_CONSTANTS.MAX_MESSAGES
                );
        }
    }

    private async processAudioAttachments(
        message: DiscordMessage<boolean>,
        attachments: Media[]
    ) {
        const audioAttachments = message.attachments.filter((attachment) =>
            attachment.contentType?.startsWith("audio/")
        );
        if (audioAttachments.size > 0) {
            elizaLogger.debug("audioAttachments", {
                audioAttachments,
            });
            const processedAudioAttachments =
                await this.attachmentManager.processAttachments(
                    audioAttachments
                );
            attachments.push(...processedAudioAttachments);
        }
    }

    private shouldSkip(message: DiscordMessage<boolean>) {
        const config = this.runtime.character.clientConfig?.discord;
        const isInteraction = message.interaction;
        const isMyself = message.author.id === this.client.user?.id;
        const shouldIgnoreBots = config?.shouldIgnoreBotMessages;
        const isBot = message.author?.bot;
        const isIgnoringBot = shouldIgnoreBots && isBot;
        const onlyMentions = config?.shouldRespondOnlyToMentions;
        const notForMe = onlyMentions && !this._isMessageForMe(message);
        const shouldIgnoreDirectMessages = config?.shouldIgnoreDirectMessages;
        const isDM = message.channel.type === ChannelType.DM;
        const isIgnoringDM = shouldIgnoreDirectMessages && isDM;

        return (
            isInteraction ||
            isMyself ||
            isIgnoringBot ||
            notForMe ||
            isIgnoringDM
        );
    }

    private isMessageDirectedAtBot(message: DiscordMessage): boolean {
        const isMentioned = message.mentions.users?.has(
            this.client.user?.id as string
        );

        const guild = message.guild;
        const member = guild?.members.cache.get(this.client.user?.id as string);
        const nickname = member?.nickname;

        if (isMentioned) {
            return true;
        }

        const hasUsername = message.content
            .toLowerCase()
            .includes(this.client.user?.username.toLowerCase() as string);
        const hasTag = message.content
            .toLowerCase()
            .includes(this.client.user?.tag.toLowerCase() as string);
        const hasNickname =
            nickname &&
            message.content.toLowerCase().includes(nickname.toLowerCase());

        return hasUsername || hasTag || hasNickname;
    }

    private _isMessageForMe(message: DiscordMessage): boolean {
        if (message.channel.type === ChannelType.DM) {
            return true;
        }

        const hasRoleMentionOnly =
            message.mentions.roles.size > 0 &&
            !this.isMessageDirectedAtBot(message);

        if (hasRoleMentionOnly) {
            return false;
        }

        if (
            this.runtime.character.clientConfig?.discord
                ?.shouldRespondOnlyToMentions &&
            !this.isMessageDirectedAtBot(message)
        ) {
            return false;
        }

        return this.isMessageDirectedAtBot(message);
    }

    private async processMessageMedia(
        message: DiscordMessage
    ): Promise<{ processedContent: string; attachments: Media[] }> {
        let processedContent = message.content;

        let attachments: Media[] = [];

        // Process code blocks in the message content
        const codeBlockRegex = /```([\s\S]*?)```/g;
        let match;
        while ((match = codeBlockRegex.exec(processedContent))) {
            const codeBlock = match[1];
            const lines = codeBlock.split("\n");
            const title = lines[0];
            const description = lines.slice(0, 3).join("\n");
            const attachmentId =
                `code-${Date.now()}-${Math.floor(Math.random() * 1000)}`.slice(
                    -5
                );
            attachments.push({
                id: attachmentId,
                url: "",
                title: title || "Code Block",
                source: "Code",
                description: description,
                text: codeBlock,
            });
            processedContent = processedContent.replace(
                match[0],
                `Code Block (${attachmentId})`
            );
        }

        // Process message attachments
        if (message.attachments.size > 0) {
            attachments = await this.attachmentManager.processAttachments(
                message.attachments
            );
        }

        // TODO: Move to attachments manager
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = processedContent?.match(urlRegex) || [];

        for (const url of urls) {
            if (
                this.runtime
                    .getService<IVideoService>(ServiceType.VIDEO)
                    ?.isVideoUrl(url)
            ) {
                const videoService = this.runtime.getService<IVideoService>(
                    ServiceType.VIDEO
                );
                if (!videoService) {
                    throw new Error("Video service not found");
                }
                const videoInfo = await videoService.processVideo(
                    url,
                    this.runtime
                );

                attachments.push({
                    id: `youtube-${Date.now()}`,
                    url: url,
                    title: videoInfo.title,
                    source: "YouTube",
                    description: videoInfo.description,
                    text: videoInfo.text,
                });
            } else {
                const browserService = this.runtime.getService<IBrowserService>(
                    ServiceType.BROWSER
                );
                if (!browserService) {
                    throw new Error("Browser service not found");
                }

                const { title, description: summary } =
                    await browserService.getPageContent(url, this.runtime);

                attachments.push({
                    id: `webpage-${Date.now()}`,
                    url: url,
                    title: title || "Web Page",
                    source: "Web",
                    description: summary,
                    text: summary,
                });
            }
        }

        elizaLogger.debug("processMessageMedia", {
            processedContent,
            attachments,
        });

        return { processedContent, attachments };
    }

    private async _analyzeContextSimilarity(
        currentMessage: string,
        previousContext?: MessageContext,
        agentLastMessage?: string
    ): Promise<number> {
        if (!previousContext) return 1; // No previous context to compare against

        // If more than 5 minutes have passed, reduce similarity weight
        const timeDiff = Date.now() - previousContext.timestamp;
        const timeWeight = Math.max(0, 1 - timeDiff / (5 * 60 * 1000)); // 5 minutes threshold

        // Calculate content similarity
        const similarity = cosineSimilarity(
            currentMessage.toLowerCase(),
            previousContext.content.toLowerCase(),
            agentLastMessage?.toLowerCase()
        );

        // Weight the similarity by time factor
        const weightedSimilarity = similarity * timeWeight;

        return weightedSimilarity;
    }

    private async _shouldRespondBasedOnContext(
        message: DiscordMessage,
        channelState: InterestChannels[string]
    ): Promise<boolean> {
        // Check if we have messages to compare
        if (!channelState.messages?.length) return false;

        // Get last user message (not from the bot)
        const lastUserMessage = [...channelState.messages].reverse().find(
            (m, index) =>
                index > 0 && // Skip first message (current)
                m.userId !== this.runtime.agentId
        );

        if (!lastUserMessage) return false;

        const lastSelfMemories = await this.runtime.messageManager.getMemories({
            roomId: stringToUuid(
                message.channel.id + "-" + this.runtime.agentId
            ),
            unique: false,
            count: 5,
        });

        const lastSelfSortedMemories = lastSelfMemories
            ?.filter((m) => m.userId === this.runtime.agentId)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Calculate context similarity
        const contextSimilarity = await this._analyzeContextSimilarity(
            message.content,
            {
                content: lastUserMessage.content.text || "",
                timestamp: Date.now(),
            },
            lastSelfSortedMemories?.[0]?.content?.text
        );

        const similarityThreshold =
            this.runtime.character.clientConfig?.discord
                ?.messageSimilarityThreshold ||
            channelState.contextSimilarityThreshold ||
            MESSAGE_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD;

        return contextSimilarity >= similarityThreshold;
    }

    private _checkInterest(channelId: string): boolean {
        const channelState = this.interestChannels[channelId];
        if (!channelState) return false;

        // If it's been more than 5 minutes since last message, reduce interest
        const timeSinceLastMessage = Date.now() - channelState.lastMessageSent;
        if (timeSinceLastMessage > MESSAGE_CONSTANTS.INTEREST_DECAY_TIME) {
            delete this.interestChannels[channelId];
            return false;
        }

        // Check if conversation has shifted to a new topic
        if (channelState.messages.length > 0) {
            const recentMessages = channelState.messages.slice(
                -MESSAGE_CONSTANTS.RECENT_MESSAGE_COUNT
            );
            const differentUsers = new Set(recentMessages.map((m) => m.userId))
                .size;

            // If multiple users are talking and we're not involved, reduce interest
            if (
                differentUsers > 1 &&
                !recentMessages.some((m) => m.userId === this.client.user?.id)
            ) {
                delete this.interestChannels[channelId];
                return false;
            }
        }

        return true;
    }

    private shouldIgnore(message: DiscordMessage): boolean {
        const messageContent = this.normalizeMessageContent(message);

        const isShort = this.isShortWithLoseInterestWords(messageContent);
        const isTargeted = this.isAskedToStop(messageContent);
        if (isShort || isTargeted) {
            delete this.interestChannels[message.channelId];
            return true;
        }

        const isShortNoInterest = this.isNoInterestAndShort(
            messageContent,
            message
        );
        const isShortWithInterest = this.isInterestedButShort(
            message,
            messageContent
        );
        const isIgnoreResponse = this.isWithIgnoreWords(message);
        if (isShortNoInterest || isShortWithInterest || isIgnoreResponse) {
            return true;
        }

        return false;
    }

    private isWithIgnoreWords(message: DiscordMessage<boolean>) {
        return (
            message.content.length <
                MESSAGE_LENGTH_THRESHOLDS.IGNORE_RESPONSE &&
            IGNORE_RESPONSE_WORDS.some((word) =>
                message.content.toLowerCase().includes(word)
            )
        );
    }

    private isInterestedButShort(
        message: DiscordMessage<boolean>,
        messageContent: string
    ) {
        return (
            this.interestChannels[message.channelId] &&
            messageContent.length < MESSAGE_LENGTH_THRESHOLDS.VERY_SHORT_MESSAGE
        );
    }

    private isAskedToStop(messageContent: string) {
        const targetedPhrases = [
            this.runtime.character.name + " stop responding",
            this.runtime.character.name + " stop talking",
            this.runtime.character.name + " shut up",
            this.runtime.character.name + " stfu",
            "stop talking" + this.runtime.character.name,
            this.runtime.character.name + " stop talking",
            "shut up " + this.runtime.character.name,
            this.runtime.character.name + " shut up",
            "stfu " + this.runtime.character.name,
            this.runtime.character.name + " stfu",
            "chill" + this.runtime.character.name,
            this.runtime.character.name + " chill",
        ];

        return targetedPhrases.some((phrase) =>
            messageContent.includes(phrase)
        );
    }

    private isNoInterestAndShort(
        messageContent: string,
        message: DiscordMessage<boolean>
    ) {
        const isShort =
            messageContent.length < MESSAGE_LENGTH_THRESHOLDS.SHORT_MESSAGE &&
            !this.interestChannels[message.channelId];
        return isShort;
    }

    private isShortWithLoseInterestWords(messageContent: string) {
        return (
            messageContent.length < MESSAGE_LENGTH_THRESHOLDS.LOSE_INTEREST &&
            LOSE_INTEREST_WORDS.some((word) => messageContent.includes(word))
        );
    }

    private normalizeMessageContent(message: DiscordMessage<boolean>): string {
        let messageContent = message.content.toLowerCase();

        messageContent = this.replaceBotIdWithCharacterName(messageContent);
        messageContent = this.replaceBotUserNameWithName(messageContent);
        messageContent = messageContent.replace(/[^a-zA-Z0-9\s]/g, "");
        return messageContent;
    }

    private replaceBotUserNameWithName(messageContent: string) {
        const botUsername = this.client.user?.username.toLowerCase();
        messageContent = messageContent.replace(
            new RegExp(`\\b${botUsername}\\b`, "g"),
            this.runtime.character.name.toLowerCase()
        );
        return messageContent;
    }

    private replaceBotIdWithCharacterName(messageContent: string) {
        const botMention = `<@!?${this.client.user?.id}>`;
        messageContent = messageContent.replace(
            new RegExp(botMention, "gi"),
            this.runtime.character.name.toLowerCase()
        );
        return messageContent;
    }

    private async shouldRespond(
        message: DiscordMessage,
        state: State,
        agentUserState: string,
        memory: Memory
    ): Promise<boolean> {
        if (agentUserState === "FOLLOWED") {
            return true; // Always respond in followed rooms
        }
        const channelState = this.interestChannels[message.channelId];

        if (this.isMessageDirectedAtBot(message)) {
            this.interestChannels[message.channelId] = {
                currentHandler: this.client.user?.id,
                lastMessageSent: Date.now(),
                messages: [],
            };
            return true;
        }

        if (channelState?.previousContext) {
            const shouldRespondContext =
                await this._shouldRespondBasedOnContext(message, channelState);
            if (!shouldRespondContext) {
                delete this.interestChannels[message.channelId];
            } else {
                return true;
            }
        }

        if (!message.guild) {
            // Initialize interest for DMs
            this.interestChannels[message.channelId] = {
                currentHandler: this.client.user?.id,
                lastMessageSent: Date.now(),
                messages: [],
            };
            return true;
        }

        // If none of the above conditions are met, use the generateText to decide
        const shouldRespondContext = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.discordShouldRespondTemplate ||
                this.runtime.character.templates?.shouldRespondTemplate ||
                composeRandomUser(discordShouldRespondTemplate, 2),
        });

        const parsedResponse = await generateShouldRespond({
            runtime: this.runtime,
            context: shouldRespondContext,
            modelClass: ModelClass.SMALL,
            message: memory,
            tags: ["discord", "discord-should-respond"],
        });

        if (parsedResponse === "RESPOND") {
            // Initialize channel interest if it doesn't exist yet
            if (!channelState) {
                this.interestChannels[message.channelId] = {
                    currentHandler: this.client.user?.id,
                    lastMessageSent: Date.now(),
                    messages: [],
                };
            } else {
                channelState.previousContext = {
                    content: message.content,
                    timestamp: Date.now(),
                };
            }

            return true;
        } else if (parsedResponse === "IGNORE") {
            return false;
        } else if (parsedResponse === "STOP") {
            delete this.interestChannels[message.channelId];
            return false;
        } else {
            elizaLogger.error(
                "Invalid response from response generateText:",
                parsedResponse
            );
            return false;
        }
    }

    private async _generateResponse(
        message: Memory,
        _state: State,
        context: string
    ): Promise<Content> {
        const { userId, roomId } = message;

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
            message,
            tags: ["discord", "discord-response"],
        });

        this._logAgentResponse("sent", userId, roomId, message.id);

        return response;
    }

    private _logMessageReceived(userId: UUID, roomId: UUID, messageId: UUID) {
        InteractionLogger.logMessageReceived({
            client: "discord",
            agentId: this.runtime.agentId,
            userId,
            roomId,
            messageId,
        });
    }

    private _logAgentResponse(
        status: "sent" | "error" | "ignored",
        userId: UUID,
        roomId: UUID,
        messageId: UUID
    ) {
        InteractionLogger.logAgentResponse({
            client: "discord",
            agentId: this.runtime.agentId,
            userId,
            roomId,
            messageId,
            status,
        });
    }

    private simulateTyping(message: DiscordMessage) {
        let typing = true;

        const typingLoop = async () => {
            while (typing) {
                if (message.channel instanceof TextChannel) {
                    await message.channel.sendTyping();
                }
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
        };

        typingLoop();

        return function stopTyping() {
            typing = false;
        };
    }
}
