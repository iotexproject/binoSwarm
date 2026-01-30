import { describe, it, expect } from "vitest";
import { extractTweetId } from "../actions/readTweet";

describe("READ_TWEET Action - URL Parsing", () => {
    describe("extractTweetId", () => {
        describe("Happy path - Standard URL formats", () => {
            it("should extract tweet ID from standard x.com URL", () => {
                const url = "https://x.com/elonmusk/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from standard twitter.com URL", () => {
                const url = "https://twitter.com/elonmusk/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from mobile x.com URL", () => {
                const url = "https://mobile.x.com/elonmusk/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from mobile twitter.com URL", () => {
                const url = "https://mobile.twitter.com/elonmusk/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract numeric tweet ID from x.com URL", () => {
                const url = "https://x.com/user/status/1847364859304837242";
                expect(extractTweetId(url)).toBe("1847364859304837242");
            });
        });

        describe("Edge cases - URL variations", () => {
            it("should extract tweet ID from URL with query parameters", () => {
                const url = "https://x.com/elonmusk/status/1234567890?s=20";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with ref_src query parameter", () => {
                const url = "https://twitter.com/user/status/1234567890?ref_src=twsrc^tfw";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with multiple query parameters", () => {
                const url = "https://x.com/user/status/1234567890?s=20&ref_src=twsrc^tfw";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with www prefix", () => {
                const url = "https://www.x.com/user/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with www prefix on twitter.com", () => {
                const url = "https://www.twitter.com/user/status/1234567890";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with trailing slash", () => {
                const url = "https://x.com/user/status/1234567890/";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with trailing slash and query params", () => {
                const url = "https://x.com/user/status/1234567890/?s=20";
                expect(extractTweetId(url)).toBe("1234567890");
            });

            it("should extract tweet ID from URL with hash fragment", () => {
                const url = "https://x.com/user/status/1234567890#m";
                expect(extractTweetId(url)).toBe("1234567890");
            });
        });

        describe("Error cases - Invalid URL formats", () => {
            it("should throw error for non-Twitter URL", () => {
                const url = "https://facebook.com/post/1234567890";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL without username", () => {
                const url = "https://x.com/status/1234567890";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL without /status/ path", () => {
                const url = "https://x.com/elonmusk/1234567890";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL without tweet ID", () => {
                const url = "https://x.com/elonmusk/status";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL with empty tweet ID", () => {
                const url = "https://x.com/elonmusk/status/";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for empty string", () => {
                expect(() => extractTweetId("")).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for malformed URL", () => {
                const url = "not-a-url";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL with just domain", () => {
                const url = "https://x.com";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL with just username", () => {
                const url = "https://x.com/elonmusk";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });

            it("should throw error for URL with tweet ID but no status path", () => {
                const url = "https://x.com/elonmusk/1234567890";
                expect(() => extractTweetId(url)).toThrow(
                    "Invalid Twitter URL format"
                );
            });
        });
    });
});
