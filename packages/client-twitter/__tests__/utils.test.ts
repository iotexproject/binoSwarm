import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    afterEach,
    type Mock,
} from "vitest";
import {
    wait,
    deduplicateMentions,
    extractUrls,
    restoreUrls,
    splitSentencesAndWords,
    splitParagraph,
    splitTweetContent,
    buildConversationThread,
    twitterHandlerCallback,
} from "../src/utils";
import { Tweet } from "../src/types";
import { ClientBase } from "../src/base";
import { stringToUuid, elizaLogger, Content, Media, UUID } from "@elizaos/core";
import fs from "fs";

vi.mock("@elizaos/core", async (importOriginal) => {
    const mod = await importOriginal();
    return {
        ...(mod as any),
        elizaLogger: {
            debug: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
        },
    };
});

vi.mock("fs", () => ({
    default: {
        existsSync: vi.fn(),
        promises: {
            readFile: vi.fn(),
        },
    },
}));

global.fetch = vi.fn();

describe("wait", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("should resolve after a time between minTime and maxTime", async () => {
        const minTime = 500;
        const maxTime = 1000;
        const setTimeoutSpy = vi.spyOn(global, "setTimeout");

        const waitPromise = wait(minTime, maxTime);
        vi.runAllTimers();
        await waitPromise;

        expect(setTimeoutSpy).toHaveBeenCalledOnce();
        const time = setTimeoutSpy.mock.calls[0][1];
        expect(time).toBeGreaterThanOrEqual(minTime);
        expect(time).toBeLessThanOrEqual(maxTime);
    });

    it("should use default times when none are provided", async () => {
        const setTimeoutSpy = vi.spyOn(global, "setTimeout");

        const waitPromise = wait();
        vi.runAllTimers();
        await waitPromise;

        expect(setTimeoutSpy).toHaveBeenCalledOnce();
        const time = setTimeoutSpy.mock.calls[0][1];
        expect(time).toBeGreaterThanOrEqual(1000);
        expect(time).toBeLessThanOrEqual(3000);
    });
});

describe("deduplicateMentions", () => {
    it("should return the original string if no mentions are present at the beginning", () => {
        const text = "This is a test tweet.";
        expect(deduplicateMentions(text)).toBe(text);
    });

    it("should not alter mentions in the middle of a tweet", () => {
        const text = "Hello @world, how are you?";
        expect(deduplicateMentions(text)).toBe(text);
    });

    it("should deduplicate repeated mentions at the beginning", () => {
        const text = "@user1 @user2 @user1 hello there";
        const expected = "@user1 @user2 hello there";
        expect(deduplicateMentions(text)).toBe(expected);
    });

    it("should handle a single mention at the beginning", () => {
        const text = "@user1 what's up?";
        expect(deduplicateMentions(text)).toBe("@user1 what's up?");
    });

    it("should handle multiple unique mentions at the beginning", () => {
        const text = "@user1 @user2 @user3 how are you all?";
        const expected = "@user1 @user2 @user3 how are you all?";
        expect(deduplicateMentions(text)).toBe(expected);
    });

    it("should handle a tweet that consists only of mentions", () => {
        const text = "@user1 @user2 @user1";
        const expected = "@user1 @user2";
        expect(deduplicateMentions(text)).toBe(expected);
    });

    it("should handle text with leading spaces and mentions", () => {
        const text = "  @user1 @user1 test";
        expect(deduplicateMentions(text)).toBe("  @user1 @user1 test");
    });
});

describe("extractUrls", () => {
    it("should extract a single URL and replace it with a placeholder", () => {
        const text = "Check out this site: https://example.com";
        const { textWithPlaceholders, placeholderMap } = extractUrls(text);
        expect(textWithPlaceholders).toBe(
            "Check out this site: <<URL_CONSIDERER_23_0>>"
        );
        expect(placeholderMap.get("<<URL_CONSIDERER_23_0>>")).toBe(
            "https://example.com"
        );
    });

    it("should extract multiple URLs", () => {
        const text = "Two urls: https://one.com and http://two.com.";
        const { textWithPlaceholders, placeholderMap } = extractUrls(text);
        expect(textWithPlaceholders).toBe(
            "Two urls: <<URL_CONSIDERER_23_0>> and <<URL_CONSIDERER_23_1>>."
        );
        expect(placeholderMap.get("<<URL_CONSIDERER_23_0>>")).toBe(
            "https://one.com"
        );
        expect(placeholderMap.get("<<URL_CONSIDERER_23_1>>")).toBe(
            "http://two.com"
        );
    });

    it("should return original text if no URLs are present", () => {
        const text = "No URLs here.";
        const { textWithPlaceholders, placeholderMap } = extractUrls(text);
        expect(textWithPlaceholders).toBe(text);
        expect(placeholderMap.size).toBe(0);
    });

    it("should handle URLs with query parameters", () => {
        const text = "URL with params: https://example.com/search?q=test";
        const { textWithPlaceholders, placeholderMap } = extractUrls(text);
        expect(textWithPlaceholders).toBe(
            "URL with params: <<URL_CONSIDERER_23_0>>"
        );
        expect(placeholderMap.get("<<URL_CONSIDERER_23_0>>")).toBe(
            "https://example.com/search?q=test"
        );
    });
});

describe("restoreUrls", () => {
    it("should restore a single URL", () => {
        const chunks = ["Check out this site: <<URL_CONSIDERER_23_0>>"];
        const placeholderMap = new Map([
            ["<<URL_CONSIDERER_23_0>>", "https://example.com"],
        ]);
        const result = restoreUrls(chunks, placeholderMap);
        expect(result).toEqual(["Check out this site: https://example.com"]);
    });

    it("should restore multiple URLs in multiple chunks", () => {
        const chunks = [
            "First part: <<URL_CONSIDERER_23_0>>",
            "Second part: <<URL_CONSIDERER_23_1>>.",
        ];
        const placeholderMap = new Map([
            ["<<URL_CONSIDERER_23_0>>", "https://one.com"],
            ["<<URL_CONSIDERER_23_1>>", "http://two.com"],
        ]);
        const result = restoreUrls(chunks, placeholderMap);
        expect(result).toEqual([
            "First part: https://one.com",
            "Second part: http://two.com.",
        ]);
    });

    it("should return original chunks if no placeholders are present", () => {
        const chunks = ["No placeholders here."];
        const placeholderMap = new Map();
        const result = restoreUrls(chunks, placeholderMap);
        expect(result).toEqual(chunks);
    });

    it("should handle chunks with no placeholders mixed with chunks that have them", () => {
        const chunks = [
            "With placeholder: <<URL_CONSIDERER_23_0>>",
            "Without placeholder.",
        ];
        const placeholderMap = new Map([
            ["<<URL_CONSIDERER_23_0>>", "https://example.com"],
        ]);
        const result = restoreUrls(chunks, placeholderMap);
        expect(result).toEqual([
            "With placeholder: https://example.com",
            "Without placeholder.",
        ]);
    });
});

describe("splitSentencesAndWords", () => {
    const maxLength = 80;

    it("should not split text shorter than maxLength", () => {
        const text = "This is a short sentence.";
        expect(splitSentencesAndWords(text, maxLength)).toEqual([text]);
    });

    it("should combine sentences if they fit within maxLength", () => {
        const text = "First sentence. Second sentence, which is also short.";
        expect(splitSentencesAndWords(text, maxLength)).toEqual([
            "First sentence. Second sentence, which is also short.",
        ]);
    });

    it("should split a long sentence by words", () => {
        const text =
            "This is a very long sentence that will definitely need to be split into multiple chunks based on the max length.";
        const result = splitSentencesAndWords(text, 30);
        expect(result).toEqual([
            "This is a very long sentence",
            "that will definitely need to",
            "be split into multiple chunks",
            "based on the max length.",
        ]);
    });

    it("should handle text with multiple sentences, some long, some short", () => {
        const text =
            "Short one. This is a much longer sentence that must be split. And another short one.";
        const result = splitSentencesAndWords(text, 30);
        expect(result).toEqual([
            "Short one.",
            "This is a much longer sentence",
            "that must be split.",
            "And another short one.",
        ]);
    });

    it("should return an empty array for empty input", () => {
        expect(splitSentencesAndWords("", maxLength)).toEqual([]);
    });
});

describe("splitParagraph", () => {
    it("should split a paragraph with a long sentence and a URL", () => {
        const paragraph =
            "This is a very long sentence that contains a URL https://example.com and it will be split.";
        const maxLength = 60;
        const result = splitParagraph(paragraph, maxLength);
        expect(result).toEqual([
            "This is a very long sentence that contains a URL",
            "https://example.com and it will be split.",
        ]);
    });

    it("should not split a short paragraph", () => {
        const paragraph = "This is a short paragraph.";
        const maxLength = 100;
        expect(splitParagraph(paragraph, maxLength)).toEqual([paragraph]);
    });

    it("should handle multiple URLs correctly during splitting", () => {
        const paragraph =
            "A long sentence with https://one.com here and another one https://two.com there, making it necessary to split the text into chunks.";
        const maxLength = 80;
        const result = splitParagraph(paragraph, maxLength);
        expect(result).toEqual([
            "A long sentence with https://one.com here and another one",
            "https://two.com there, making it necessary to split the text into",
            "chunks.",
        ]);
    });

    it("should return an empty array for an empty paragraph", () => {
        expect(splitParagraph("", 100)).toEqual([]);
    });
});

describe("splitTweetContent", () => {
    const maxLength = 100;

    it("should not split content that is shorter than maxLength", () => {
        const content = "This is a single tweet.";
        expect(splitTweetContent(content, maxLength)).toEqual([content]);
    });

    it("should combine paragraphs if they fit", () => {
        const content =
            "First paragraph.\n\nSecond paragraph that is also short.";
        expect(splitTweetContent(content, maxLength)).toEqual([
            "First paragraph.\n\nSecond paragraph that is also short.",
        ]);
    });

    it("should split a long paragraph into multiple tweets", () => {
        const content =
            "This is a very long paragraph that will be split into multiple tweets because it exceeds the maximum length allowed for a single tweet.";
        const result = splitTweetContent(content, 60);
        expect(result).toEqual([
            "This is a very long paragraph that will be split into",
            "multiple tweets because it exceeds the maximum length",
            "allowed for a single tweet.",
        ]);
    });

    it("should handle multiple paragraphs, some of which require splitting", () => {
        const content =
            "First paragraph is short.\n\nThis second paragraph is very long and it will definitely have to be split into several smaller chunks to fit within the constraints.\n\nThird paragraph is also short.";
        const result = splitTweetContent(content, 80);
        expect(result).toEqual([
            "First paragraph is short.",
            "This second paragraph is very long and it will definitely have to be split into",
            "several smaller chunks to fit within the constraints.",
            "Third paragraph is also short.",
        ]);
    });

    it("should return an empty array if the content is empty", () => {
        expect(splitTweetContent("", maxLength)).toEqual([]);
    });
});

describe("buildConversationThread", () => {
    const mockClient: any = {
        runtime: {
            agentId: "agent-123",
            messageManager: {
                getMemoryById: vi.fn(),
                createMemory: vi.fn(),
            },
            ensureConnection: vi.fn(),
        },
        twitterClient: {
            getTweet: vi.fn(),
        },
        getTweet: vi.fn(), // Add mock for the new ClientBase.getTweet method
        profile: {
            id: "agent-user-id",
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const tweet1: Tweet = {
        id: "1",
        text: "Tweet 1",
        conversationId: "conv1",
        timestamp: Date.now() / 1000,
        userId: "user1",
        inReplyToStatusId: undefined,
        permanentUrl: "url1",
        username: "username1",
        name: "User One",
        hashtags: [],
        mentions: [],
        photos: [],
        thread: [],
        urls: [],
        videos: [],
    };

    const tweet2: Tweet = {
        ...tweet1,
        id: "2",
        text: "Tweet 2, reply to 1",
        inReplyToStatusId: "1",
        userId: "user2",
        username: "username2",
        name: "User Two",
    };

    const tweet3: Tweet = {
        ...tweet1,
        id: "3",
        text: "Tweet 3, reply to 2",
        inReplyToStatusId: "2",
        userId: "user1",
        username: "username1",
        name: "User One",
    };

    it("should build a thread with a single tweet", async () => {
        mockClient.runtime.messageManager.getMemoryById.mockResolvedValue(null);
        const result = await buildConversationThread(
            tweet1,
            mockClient as ClientBase
        );

        expect(result).toEqual([tweet1]);
        expect(mockClient.getTweet).not.toHaveBeenCalled();
        expect(
            mockClient.runtime.messageManager.createMemory
        ).toHaveBeenCalledTimes(1);
    });

    it("should build a thread of two tweets", async () => {
        mockClient.runtime.messageManager.getMemoryById.mockResolvedValue(null);
        mockClient.getTweet.mockResolvedValueOnce(tweet1);
        const result = await buildConversationThread(
            tweet2,
            mockClient as ClientBase
        );

        expect(result).toEqual([tweet1, tweet2]);
        expect(mockClient.getTweet).toHaveBeenCalledWith("1");
        expect(mockClient.getTweet).toHaveBeenCalledTimes(1);
        expect(
            mockClient.runtime.messageManager.createMemory
        ).toHaveBeenCalledTimes(2);
    });

    it("should build a longer thread", async () => {
        mockClient.runtime.messageManager.getMemoryById.mockResolvedValue(null);
        mockClient.getTweet
            .mockResolvedValueOnce(tweet2)
            .mockResolvedValueOnce(tweet1);

        const result = await buildConversationThread(
            tweet3,
            mockClient as ClientBase
        );

        expect(result).toEqual([tweet1, tweet2, tweet3]);
        expect(mockClient.getTweet).toHaveBeenCalledWith("2");
        expect(mockClient.getTweet).toHaveBeenCalledWith("1");
        expect(mockClient.getTweet).toHaveBeenCalledTimes(2);
        expect(
            mockClient.runtime.messageManager.createMemory
        ).toHaveBeenCalledTimes(3);
    });

    it("should stop when maxReplies is reached", async () => {
        mockClient.runtime.messageManager.getMemoryById.mockResolvedValue(null);
        mockClient.getTweet.mockResolvedValueOnce(tweet2);

        const result = await buildConversationThread(
            tweet3,
            mockClient as ClientBase,
            1
        );

        expect(result).toEqual([tweet2, tweet3]);
        expect(mockClient.getTweet).toHaveBeenCalledWith("2");
        expect(mockClient.getTweet).toHaveBeenCalledTimes(1);
        expect(
            mockClient.runtime.messageManager.createMemory
        ).toHaveBeenCalledTimes(2);
    });

    it("should handle parent tweet not found", async () => {
        mockClient.runtime.messageManager.getMemoryById.mockResolvedValue(null);
        mockClient.getTweet.mockResolvedValueOnce(null);

        const result = await buildConversationThread(
            tweet2,
            mockClient as ClientBase
        );

        expect(result).toEqual([tweet2]);
        expect(mockClient.getTweet).toHaveBeenCalledWith("1");
        expect(
            mockClient.runtime.messageManager.createMemory
        ).toHaveBeenCalledTimes(1);
    });

    it("should not create memory if it already exists", async () => {
        mockClient.runtime.messageManager.getMemoryById.mockResolvedValue({
            id: "some-memory",
        });

        const result = await buildConversationThread(
            tweet1,
            mockClient as ClientBase
        );

        expect(result).toEqual([tweet1]);
        expect(
            mockClient.runtime.messageManager.getMemoryById
        ).toHaveBeenCalled();
        expect(
            mockClient.runtime.messageManager.createMemory
        ).not.toHaveBeenCalled();
    });

    it("should gracefully handle a null initial tweet", async () => {
        const result = await buildConversationThread(
            null as any,
            mockClient as ClientBase
        );
        expect(result).toEqual([]);
        expect(
            mockClient.runtime.messageManager.createMemory
        ).not.toHaveBeenCalled();
    });

    it("should set memory userId to agentId when tweet is from the agent", async () => {
        const agentTweet: Tweet = {
            ...tweet1,
            userId: "agent-user-id", // Same as client.profile.id
        };
        mockClient.runtime.messageManager.getMemoryById.mockResolvedValue(null);

        await buildConversationThread(agentTweet, mockClient as ClientBase);

        const createMemoryCall =
            mockClient.runtime.messageManager.createMemory.mock.calls[0][0];

        expect(createMemoryCall.memory.userId).toBe(mockClient.runtime.agentId);
    });

    it("should set memory userId to tweet userId when tweet is from another user", async () => {
        const externalTweet: Tweet = {
            ...tweet1,
            userId: "some-other-user",
        };
        mockClient.runtime.messageManager.getMemoryById.mockResolvedValue(null);

        await buildConversationThread(externalTweet, mockClient as ClientBase);

        const createMemoryCall =
            mockClient.runtime.messageManager.createMemory.mock.calls[0][0];

        if (externalTweet.userId) {
            expect(createMemoryCall.memory.userId).toBe(
                stringToUuid(externalTweet.userId)
            );
        }
    });

    it("should handle circular reply chains to prevent infinite loops", async () => {
        const tweetA: Tweet = { ...tweet1, id: "A", inReplyToStatusId: "B" };
        const tweetB: Tweet = { ...tweet1, id: "B", inReplyToStatusId: "A" };

        mockClient.runtime.messageManager.getMemoryById.mockResolvedValue(null);
        mockClient.getTweet.mockResolvedValueOnce(tweetB);

        const result = await buildConversationThread(
            tweetA,
            mockClient as ClientBase
        );

        // Thread should be B -> A
        expect(result.map((t) => t.id)).toEqual(["B", "A"]);

        // getTweet is called for B (A's parent), but not for A (B's parent) because it's already visited.
        expect(mockClient.getTweet).toHaveBeenCalledTimes(1);

        // createMemory is called for A, then for B. The second call to process A is stopped.
        expect(
            mockClient.runtime.messageManager.createMemory
        ).toHaveBeenCalledTimes(2);
    });

    it("should handle errors when fetching a parent tweet", async () => {
        const error = new Error("Fetch failed");
        mockClient.getTweet.mockRejectedValue(error);
        mockClient.runtime.messageManager.getMemoryById.mockResolvedValue(null);

        const result = await buildConversationThread(
            tweet2,
            mockClient as ClientBase
        );

        expect(result).toEqual([tweet2]);
        expect(mockClient.getTweet).toHaveBeenCalledWith("1");
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error fetching parent tweet:",
            {
                tweetId: "1",
                error,
            }
        );
    });
});

describe("twitterHandlerCallback (sendTweet)", () => {
    const mockRuntime: any = {
        agentId: "agent-123",
        messageManager: {
            createMemory: vi.fn(),
        },
    };
    const mockClient: any = {
        runtime: mockRuntime,
        twitterConfig: {
            MAX_TWEET_LENGTH: 280,
        },
        requestQueue: {
            add: vi.fn((fn) => fn()),
        },
        twitterApiV2Client: {
            createTweet: vi.fn().mockResolvedValue({
                id: "tweet-123",
                text: "Test tweet",
                permanentUrl: "https://twitter.com/test/status/tweet-123",
                timestamp: Date.now() / 1000,
                inReplyToStatusId: undefined,
            }),
            uploadMedia: vi.fn().mockResolvedValue("media-id-123"),
        },
    };

    const mockContent: Content = { text: "This is a test tweet." };
    const mockRoomId: UUID = stringToUuid("room-1");
    const mockTwitterUsername = "testuser";
    const mockInReplyTo = "prev-tweet-id";

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockClient.twitterConfig.MAX_TWEET_LENGTH = 280;
        mockClient.requestQueue.add.mockImplementation((fn: any) => fn());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should return an empty array if content or content.text is null", async () => {
        let memories = await twitterHandlerCallback(
            mockClient,
            { text: null } as any,
            mockRoomId,
            mockRuntime,
            mockTwitterUsername,
            mockInReplyTo
        );
        expect(memories).toEqual([]);
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Cannot send tweet: content or content.text is null"
        );

        (elizaLogger.error as Mock).mockClear();

        memories = await twitterHandlerCallback(
            mockClient,
            null as any,
            mockRoomId,
            mockRuntime,
            mockTwitterUsername,
            mockInReplyTo
        );
        expect(memories).toEqual([]);
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Cannot send tweet: content or content.text is null"
        );
    });

    it("should throw an error for a failed http attachment fetch", async () => {
        const attachment: Media = {
            id: stringToUuid("http-attachment-fail"),
            title: "http attachment",
            url: "http://example.com/bad.png",
            contentType: "image/png",
            source: "",
            description: "",
            text: "",
        };
        const contentWithAttachment = {
            ...mockContent,
            attachments: [attachment],
        };

        (global.fetch as Mock).mockResolvedValue({ ok: false });

        await expect(
            twitterHandlerCallback(
                mockClient,
                contentWithAttachment,
                mockRoomId,
                mockRuntime,
                mockTwitterUsername,
                mockInReplyTo
            )
        ).rejects.toThrow("Failed to fetch file: http://example.com/bad.png");
    });

    it("should throw an error for a non-existent local file", async () => {
        const attachment: Media = {
            id: stringToUuid("non-existent-attachment"),
            title: "non-existent attachment",
            url: "/path/to/nonexistent.png",
            contentType: "image/png",
            source: "",
            description: "",
            text: "",
        };
        const contentWithAttachment = {
            ...mockContent,
            attachments: [attachment],
        };

        (fs.existsSync as Mock).mockReturnValue(false);

        await expect(
            twitterHandlerCallback(
                mockClient,
                contentWithAttachment,
                mockRoomId,
                mockRuntime,
                mockTwitterUsername,
                mockInReplyTo
            )
        ).rejects.toThrow(
            "File not found: /path/to/nonexistent.png. Make sure the path is correct."
        );
    });
});
