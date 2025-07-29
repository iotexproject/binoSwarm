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

        this.messageToProcess = await this.buildMemory(message);
        await this.saveMemory(this.messageToProcess);
        this.state = await this.runtime.composeState(this.messageToProcess);

        return { memory: this.messageToProcess, state: this.state };
    }

    async respond(
        template: TemplateType,
        tags: string[],
        callback: HandlerCallback
    ) {
        const response = await this.genResponse(template, tags);
        await callback(response);

        const responseMessage = this.buildResponseMemory(response);
        await this.saveMemory(responseMessage);
        await this.refreshStateAfterResponse();

        await this.runtime.processActions(
            this.messageToProcess,
            [responseMessage],
            this.state,
            callback,
            { tags }
        );

        return response;
    }

    private async refreshStateAfterResponse() {
        this.state = await this.runtime.updateRecentMessageState(this.state);
    }

    private async genResponse(template: TemplateType, tags: string[]) {
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

    private async saveMemory(memory: Memory) {
        await this.runtime.messageManager.createMemory({
            memory,
            isUnique: true,
        });
    }

    private buildResponseMemory(content: Content): Memory {
        return {
            ...this.messageToProcess,
            id: stringToUuid(
                this.messageToProcess.id + "-" + this.runtime.agentId
            ),
            userId: this.runtime.agentId,
            content,
            createdAt: Date.now(),
        };
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
            ...userMessage,
            id: stringToUuid(message.rawMessageId + "-" + this.runtime.agentId),
            createdAt: message.createdAt ?? Date.now(), // TODO: check if this is consistent across clients
        };

        return memory;
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
