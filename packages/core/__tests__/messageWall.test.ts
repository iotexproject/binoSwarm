import { describe, it, expect, beforeEach } from "vitest";
import { MessageWall, InterestChannels } from "../src/messageWall";
import { IAgentRuntime, UUID, Character } from "@elizaos/core";

describe("MessageWall", () => {
    let mockRuntime: IAgentRuntime;
    let mockInterestChannels: InterestChannels;
    let messageWall: MessageWall;

    const BOT_USERNAME = "eliza";
    const BOT_MENTION = "<@!?botId>";
    const CHARACTER_NAME = "Eliza";

    beforeEach(() => {
        mockRuntime = {
            character: {
                name: CHARACTER_NAME,
                id: "123" as UUID,
            } as Character,
        } as unknown as IAgentRuntime;
        mockInterestChannels = {};
        messageWall = new MessageWall(mockRuntime, mockInterestChannels);
    });

    it("should return true and delete channel for short message with lose interest words", () => {
        const message = {
            content: "shut up",
            channelId: "channel1",
        };
        mockInterestChannels.channel1 = {
            currentHandler: undefined,
            lastMessageSent: Date.now(),
            messages: [],
        };
        expect(
            messageWall.isDismissive(message, BOT_USERNAME, BOT_MENTION)
        ).toBe(true);
        expect(mockInterestChannels).not.toHaveProperty("channel1");
    });

    it("should return true and delete channel for targeted phrases", () => {
        const message = {
            content: "Eliza shut up please",
            channelId: "channel2",
        };
        mockInterestChannels.channel2 = {
            currentHandler: undefined,
            lastMessageSent: Date.now(),
            messages: [],
        };
        expect(
            messageWall.isDismissive(message, BOT_USERNAME, BOT_MENTION)
        ).toBe(true);
        expect(mockInterestChannels).not.toHaveProperty("channel2");
    });

    it("should return true for short message with no interest", () => {
        const message = {
            content: "hi",
            channelId: "channel3",
        };
        expect(mockInterestChannels).not.toHaveProperty("channel3");
        expect(
            messageWall.isDismissive(message, BOT_USERNAME, BOT_MENTION)
        ).toBe(true);
        expect(mockInterestChannels).not.toHaveProperty("channel3"); // No side effect
    });

    it("should return true for very short message with interest", () => {
        const message = {
            content: "ok",
            channelId: "channel4",
        };
        mockInterestChannels.channel4 = {
            currentHandler: undefined,
            lastMessageSent: Date.now(),
            messages: [],
        };
        messageWall["botUsername"] = BOT_USERNAME;
        messageWall["botMention"] = BOT_MENTION;
        const normalizedContent = (messageWall as any).normalizeMessageContent(
            message
        );
        delete (messageWall as any)["botUsername"];
        delete (messageWall as any)["botMention"];

        expect(
            (messageWall as any).isInterestedButShort(
                message,
                normalizedContent
            )
        ).toBe(true);
        expect(mockInterestChannels).toHaveProperty("channel4"); // No side effect
    });

    it("should return true for message with ignore words", () => {
        const message = {
            content: "lol",
            channelId: "channel5",
        };
        expect(
            messageWall.isDismissive(message, BOT_USERNAME, BOT_MENTION)
        ).toBe(true);
    });

    it("should return false for a long, relevant message", () => {
        const message = {
            content: "This is a long and very relevant message for Eliza.",
            channelId: "channel6",
        };
        expect(
            messageWall.isDismissive(message, BOT_USERNAME, BOT_MENTION)
        ).toBe(false);
    });

    it("should return false for a message with interest and not short or ignore words", () => {
        const message = {
            content: "How are you doing today Eliza?",
            channelId: "channel7",
        };
        mockInterestChannels.channel7 = {
            currentHandler: undefined,
            lastMessageSent: Date.now(),
            messages: [],
        };
        expect(
            messageWall.isDismissive(message, BOT_USERNAME, BOT_MENTION)
        ).toBe(false);
        expect(mockInterestChannels).toHaveProperty("channel7");
    });
});
