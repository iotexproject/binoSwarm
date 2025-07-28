import { stringToUuid } from "@elizaos/core";

import { IAgentRuntime } from "../types";

export interface ReceivedMessage {
    rawUserId: string;
    userName: string;
    userScreenName: string;
    rawRoomId: string;
    source: string;
}

export class MsgPreprocessor {
    constructor(private readonly runtime: IAgentRuntime) {}

    async preprocess(message: ReceivedMessage) {
        const roomId = this.genRoomId(message.rawRoomId);
        const userId = this.genUserId(message.rawUserId);

        await this.runtime.ensureConnection(
            userId,
            roomId,
            message.userName,
            message.userScreenName,
            message.source
        );
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

export default MsgPreprocessor;
