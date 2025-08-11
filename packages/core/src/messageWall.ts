import { Content, IAgentRuntime, UUID } from "@elizaos/core";

type Message = {
    content: string;
    channelId: string;
};

type MessageContext = {
    content: string;
    timestamp: number;
};

export type InterestChannels = {
    [key: string]: {
        currentHandler: string | undefined;
        lastMessageSent: number;
        messages: { userId: UUID; userName: string; content: Content }[];
        previousContext?: MessageContext;
        contextSimilarityThreshold?: number;
    };
};

const LOSE_INTEREST_WORDS = [
    "shut up",
    "stop",
    "please shut up",
    "shut up please",
    "dont talk",
    "silence",
    "stop talking",
    "be quiet",
    "hush",
    "wtf",
    "chill",
    "stfu",
    "stupid bot",
    "dumb bot",
    "stop responding",
    "god damn it",
    "god damn",
    "goddamnit",
    "can you not",
    "can you stop",
    "be quiet",
    "hate you",
    "hate this",
    "fuck up",
] as const;

const IGNORE_RESPONSE_WORDS = [
    "lol",
    "nm",
    "uh",
    "wtf",
    "stfu",
    "dumb",
    "jfc",
    "omg",
] as const;

const MESSAGE_LENGTH_THRESHOLDS = {
    LOSE_INTEREST: 100,
    SHORT_MESSAGE: 10,
    VERY_SHORT_MESSAGE: 2,
    IGNORE_RESPONSE: 4,
} as const;

export class MessageWall {
    private runtime: IAgentRuntime;
    private interestChannels: InterestChannels;
    private botUsername: string;
    private botMention: string;

    constructor(
        runtime: IAgentRuntime,
        interestChannels: InterestChannels,
        botUsername: string,
        botMention: string
    ) {
        this.runtime = runtime;
        this.interestChannels = interestChannels;
        this.botUsername = botUsername;
        this.botMention = botMention;
    }

    isDismissive(message: Message): boolean {
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

    private isWithIgnoreWords(message: Message) {
        return (
            message.content.length <
                MESSAGE_LENGTH_THRESHOLDS.IGNORE_RESPONSE &&
            IGNORE_RESPONSE_WORDS.some((word) =>
                message.content.toLowerCase().includes(word)
            )
        );
    }

    private isInterestedButShort(message: Message, messageContent: string) {
        return (
            this.interestChannels[message.channelId] &&
            messageContent.length < MESSAGE_LENGTH_THRESHOLDS.VERY_SHORT_MESSAGE
        );
    }

    private isAskedToStop(messageContent: string) {
        const characterName = this.runtime.character.name;
        const targetedPhrases = [
            characterName + " stop responding",
            characterName + " stop talking",
            characterName + " shut up",
            characterName + " stfu",
            "stop talking" + characterName,
            characterName + " stop talking",
            "shut up " + characterName,
            characterName + " shut up",
            "stfu " + characterName,
            characterName + " stfu",
            "chill" + characterName,
            characterName + " chill",
        ];

        return targetedPhrases.some((phrase) =>
            messageContent.includes(phrase)
        );
    }

    private isNoInterestAndShort(messageContent: string, message: Message) {
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

    private normalizeMessageContent(message: Message): string {
        let messageContent = message.content.toLowerCase();

        messageContent = this.replaceBotIdWithCharacterName(messageContent);
        messageContent = this.replaceBotUserNameWithName(messageContent);
        messageContent = messageContent.replace(/[^a-zA-Z0-9\s]/g, "");
        return messageContent;
    }

    private replaceBotUserNameWithName(messageContent: string) {
        messageContent = messageContent.replace(
            new RegExp(`\\b${this.botUsername}\\b`, "g"),
            this.runtime.character.name.toLowerCase()
        );
        return messageContent;
    }

    private replaceBotIdWithCharacterName(messageContent: string) {
        messageContent = messageContent.replace(
            new RegExp(this.botMention, "gi"),
            this.runtime.character.name.toLowerCase()
        );
        return messageContent;
    }
}
