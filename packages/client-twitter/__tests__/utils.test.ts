import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    wait,
    deduplicateMentions,
    extractUrls,
    restoreUrls,
    splitSentencesAndWords,
    splitParagraph,
    splitTweetContent,
} from "../src/utils";

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
