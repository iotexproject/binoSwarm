import { UUID } from "@elizaos/core";

export type PendingTweet = {
    cleanedContent: string;
    roomId: UUID;
    newTweetContent: string;
    discordMessageId: string;
    channelId: string;
    timestamp: number;
};

export type PendingTweetApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
