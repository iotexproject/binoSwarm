import { stringToUuid } from "./uuid";

import {
    Content,
    IAgentRuntime,
    Memory,
    Media,
    UUID,
    State,
    ModelClass,
} from "./types";
import { composeContext } from "./context";
import { generateMessageResponse } from "./generation";

export interface ReceivedMessage {
    rawMessageId: string;
    rawUserId: string;
    userName: string;
    userScreenName: string;
    rawRoomId: string;
    source: string;
    text: string;
    attachments: Media[];
    inReplyTo?: UUID;
    createdAt?: number;
    messageUrl?: string;
}

export class MessageProcessor {
    private roomId: UUID;
    private userId: UUID;
    private state: State;
    private messageToProcess: Memory;

    constructor(private readonly runtime: IAgentRuntime) {}

    async preprocess(message: ReceivedMessage) {
        this.roomId = this.genRoomId(message.rawRoomId);
        this.userId = this.genUserId(message.rawUserId);

        await this.runtime.ensureConnection(
            this.userId,
            this.roomId,
            message.userName,
            message.userScreenName,
            message.source
        );

        const memory = await this.buildMemory(message);
        this.messageToProcess = memory;

        await this.runtime.messageManager.createMemory({
            memory,
            isUnique: true,
        });
        this.state = await this.runtime.composeState(memory);

        return { memory, state: this.state };
    }

    async generate(template: string, tags: string[]) {
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

        return response;
    }

    private async buildMemory(message: ReceivedMessage): Promise<Memory> {
        const content: Content = {
            text: message.text,
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
            id: this.genMemoryId(message.rawMessageId),
            ...userMessage,
            createdAt: message.createdAt ?? Date.now(), // TODO: check if this is consistent across clients
        };

        return memory;
    }

    private genMemoryId(messageId: string) {
        return stringToUuid(messageId + "-" + this.runtime.agentId);
    }

    private genRoomId(roomId: string) {
        if (!roomId) {
            throw new Error("Room id is required");
        }
        return stringToUuid(roomId);
    }

    private genUserId(userId: string) {
        if (!userId) {
            throw new Error("User id is required");
        }
        return stringToUuid(userId);
    }
}
