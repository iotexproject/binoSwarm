import { stringToUuid } from "./uuid";

import { Content, IAgentRuntime, Memory, Media, UUID } from "./types";

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
}

export class MsgPreprocessor {
    private roomId: UUID;
    private userId: UUID;

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
        await this.runtime.messageManager.createMemory({
            memory,
            isUnique: true,
        });

        return memory;
    }

    private async buildMemory(message: ReceivedMessage): Promise<Memory> {
        const content: Content = {
            text: message.text,
            attachments: message.attachments,
            source: message.source,
            inReplyTo: message.inReplyTo,
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
        return stringToUuid(messageId + "-" + this.userId);
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
