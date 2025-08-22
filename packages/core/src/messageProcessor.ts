import { stringToUuid } from "./uuid";

import {
    Content,
    IAgentRuntime,
    Memory,
    Media,
    UUID,
    State,
    ModelClass,
    TemplateType,
    HandlerCallback,
} from "./types";
import { composeContext } from "./context";
import { generateMessageResponse } from "./generation";
import { InteractionLogger, AgentClient } from "./interactionLogger";
import { redactTextUsingPII } from "./PII";

export interface ReceivedMessage {
    rawMessageId: string;
    rawUserId: string;
    userName: string;
    userScreenName: string;
    rawRoomId: string;
    source: AgentClient;
    text: string;
    attachments: Media[];
    inReplyTo?: UUID;
    createdAt?: number;
    messageUrl?: string;
}

export class MessageProcessor {
    private receivedMessage: ReceivedMessage;
    private roomId: UUID;
    private userId: UUID;
    private state: State;
    private messageToProcess: Memory;

    constructor(private readonly runtime: IAgentRuntime) {}

    async preprocess(message: ReceivedMessage): Promise<{
        memory: Memory;
        state: State;
    }> {
        this.receivedMessage = message;
        this.roomId = this.genRoomId(message.rawRoomId);
        this.userId = this.genUserId(message.rawUserId);

        await this.runtime.ensureConnection(
            this.userId,
            this.roomId,
            message.userName,
            message.userScreenName,
            message.source
        );

        this.messageToProcess = await this.buildMemory(message);
        await this.saveMemory(this.messageToProcess);
        this.state = await this.runtime.composeState(this.messageToProcess);

        this.logMessageReceived();

        return { memory: this.messageToProcess, state: this.state };
    }

    async respond(
        template: TemplateType,
        tags: string[],
        callback: HandlerCallback
    ): Promise<void> {
        try {
            const response = await this.genResponse(template, tags);

            const callbackWithMemorySaving = async (
                content: Content,
                files: Array<{ attachment: string; name: string }>
            ) => {
                const memories = await callback(content, files);
                await this.saveMemories(memories);
                return memories;
            };

            const memories = await callbackWithMemorySaving(response, []);
            await this.refreshStateAfterResponse();

            await this.runtime.processActions(
                this.messageToProcess,
                memories,
                this.state,
                callbackWithMemorySaving,
                { tags }
            );
            this.runtime.evaluate(this.messageToProcess, this.state);
            this.logAgentResponse("sent");
        } catch (error) {
            this.logAgentResponse("error");
            throw error;
        }
    }

    private logMessageReceived() {
        InteractionLogger.logMessageReceived({
            client: this.receivedMessage.source,
            agentId: this.runtime.agentId,
            userId: this.userId,
            roomId: this.roomId,
            messageId: this.messageToProcess.id,
        });
    }

    private logAgentResponse(status: "sent" | "error" | "ignored") {
        InteractionLogger.logAgentResponse({
            client: this.receivedMessage.source,
            agentId: this.runtime.agentId,
            userId: this.userId,
            roomId: this.roomId,
            messageId: this.messageToProcess.id,
            status,
        });
    }

    private async refreshStateAfterResponse(): Promise<void> {
        this.state = await this.runtime.updateRecentMessageState(this.state);
    }

    private async genResponse(
        template: TemplateType,
        tags: string[]
    ): Promise<Content> {
        const context = composeContext({
            state: this.state,
            template,
        });

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
            message: this.messageToProcess,
            tags,
        });

        response.inReplyTo = this.messageToProcess.id;
        return response;
    }

    private async saveMemories(memories: Memory[]): Promise<void> {
        for (const memory of memories) {
            await this.saveMemory(memory);
        }
    }

    private async saveMemory(memory: Memory): Promise<void> {
        await this.runtime.messageManager.createMemory({
            memory,
            isUnique: true,
        });
    }

    private async buildMemory(message: ReceivedMessage): Promise<Memory> {
        const redactedText = await redactTextUsingPII(message.text);

        const content: Content = {
            text: redactedText,
            attachments: message.attachments,
            source: message.source,
            inReplyTo: message.inReplyTo,
            url: message.messageUrl,
        };

        const userMessage = {
            content,
            userId: this.userId,
            roomId: this.roomId,
            agentId: this.runtime.agentId,
        };

        const memory: Memory = {
            ...userMessage,
            id: stringToUuid(message.rawMessageId + "-" + this.runtime.agentId),
            createdAt: message.createdAt ?? Date.now(), // TODO: check if this is consistent across clients
        };

        return memory;
    }

    private genRoomId(roomId: string): UUID {
        if (!roomId) {
            throw new Error("Room id is required");
        }
        return stringToUuid(roomId);
    }

    private genUserId(userId: string): UUID {
        if (!userId) {
            throw new Error("User id is required");
        }
        return stringToUuid(userId);
    }
}
