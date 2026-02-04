import { describe, it, expect, vi, beforeEach } from "vitest";
import { TwitterReadClient, createTwitterReadClient } from "../client";
import { TwitterApi } from "twitter-api-v2";
import { elizaLogger } from "@elizaos/core";

// Mock twitter-api-v2
vi.mock("twitter-api-v2", () => ({
    TwitterApi: vi.fn(),
}));

// Mock @elizaos/core logger
vi.mock("@elizaos/core", () => ({
    elizaLogger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe("TwitterReadClient - Constructor", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should create instance with valid bearer token", () => {
        const mockClientInstance = {
            v2: {
                singleTweet: vi.fn(),
            },
        };
        vi.mocked(TwitterApi).mockReturnValue(mockClientInstance as any);

        const client = new TwitterReadClient("valid-bearer-token");

        expect(client).toBeInstanceOf(TwitterReadClient);
        expect(TwitterApi).toHaveBeenCalledWith("valid-bearer-token");
        expect(elizaLogger.log).toHaveBeenCalledWith(
            "Twitter read client initialized"
        );
    });

    it("should throw error when bearer token is empty string", () => {
        expect(() => new TwitterReadClient("")).toThrow(
            "TWITTER_BEARER_TOKEN is required for Twitter read client"
        );
        expect(TwitterApi).not.toHaveBeenCalled();
    });

    it("should throw error when bearer token is undefined", () => {
        expect(
            () => new TwitterReadClient(undefined as any)
        ).toThrow(
            "TWITTER_BEARER_TOKEN is required for Twitter read client"
        );
        expect(TwitterApi).not.toHaveBeenCalled();
    });

    it("should throw error when bearer token is null", () => {
        expect(() => new TwitterReadClient(null as any)).toThrow(
            "TWITTER_BEARER_TOKEN is required for Twitter read client"
        );
        expect(TwitterApi).not.toHaveBeenCalled();
    });
});

describe("TwitterReadClient - getTweet() success path", () => {
    let client: TwitterReadClient;
    let mockSingleTweet: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSingleTweet = vi.fn();

        const mockClientInstance = {
            v2: {
                singleTweet: mockSingleTweet,
            },
        };
        vi.mocked(TwitterApi).mockReturnValue(mockClientInstance as any);

        client = new TwitterReadClient("test-bearer-token");
    });

    it("should return full response with data and includes", async () => {
        const mockTweetData = {
            id: "1234567890",
            text: "Test tweet",
            created_at: "2025-01-01T00:00:00.000Z",
            author_id: "user123",
        };

        const mockIncludes = {
            users: [{ id: "user123", username: "testuser", name: "Test User" }],
            media: [],
        };

        const mockApiResponse = {
            data: mockTweetData,
            includes: mockIncludes,
        };

        mockSingleTweet.mockResolvedValue(mockApiResponse);

        const result = await client.getTweet("1234567890");

        expect(result).toEqual({
            data: mockTweetData,
            includes: mockIncludes,
        });

        expect(mockSingleTweet).toHaveBeenCalledWith("1234567890", {
            expansions: [
                "author_id",
                "referenced_tweets.id",
                "referenced_tweets.id.author_id",
                "attachments.media_keys",
                "in_reply_to_user_id",
            ],
            "tweet.fields": [
                "created_at",
                "conversation_id",
                "in_reply_to_user_id",
                "referenced_tweets",
                "author_id",
                "public_metrics",
                "context_annotations",
                "entities",
                "attachments",
            ],
            "user.fields": ["username", "name", "id"],
            "media.fields": [
                "type",
                "url",
                "preview_image_url",
                "alt_text",
            ],
        });
    });

    it("should return null when response.data is missing", async () => {
        const mockApiResponse = {
            data: null,
            includes: undefined,
        };

        mockSingleTweet.mockResolvedValue(mockApiResponse);

        const result = await client.getTweet("1234567890");

        expect(result).toBeNull();
    });

    it("should return null when response.data is undefined", async () => {
        const mockApiResponse = {};

        mockSingleTweet.mockResolvedValue(mockApiResponse);

        const result = await client.getTweet("1234567890");

        expect(result).toBeNull();
    });
});

describe("TwitterReadClient - getTweet() error handling with 'code' property", () => {
    let client: TwitterReadClient;
    let mockSingleTweet: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSingleTweet = vi.fn();

        const mockClientInstance = {
            v2: {
                singleTweet: mockSingleTweet,
            },
        };
        vi.mocked(TwitterApi).mockReturnValue(mockClientInstance as any);

        client = new TwitterReadClient("test-bearer-token");
    });

    it("should re-throw error with error code from 'code' property", async () => {
        const apiError = {
            code: 404,
            message: "Tweet not found",
        };

        mockSingleTweet.mockRejectedValue(apiError);

        const error = await client
            .getTweet("1234567890")
            .catch((e) => e);

        expect(error.message).toBe("[object Object]");
        expect(error.code).toBe(404);
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error fetching tweet:",
            {
                tweetId: "1234567890",
                errorCode: 404,
                errorMessage: "[object Object]",
            }
        );
    });

    it("should re-throw error with error code from number 'code' property", async () => {
        const apiError = {
            code: 403,
            message: "Forbidden",
        };

        mockSingleTweet.mockRejectedValue(apiError);

        const error = await client
            .getTweet("1234567890")
            .catch((e) => e);

        expect(error.code).toBe(403);
    });

    it("should handle Error instance with code property", async () => {
        const apiError = new Error("Rate limit exceeded") as any;
        apiError.code = 429;

        mockSingleTweet.mockRejectedValue(apiError);

        await expect(client.getTweet("1234567890")).rejects.toThrow(
            "Rate limit exceeded"
        );

        const error = await client
            .getTweet("1234567890")
            .catch((e) => e);

        expect(error.code).toBe(429);
    });
});

describe("TwitterReadClient - getTweet() error handling with 'status' property", () => {
    let client: TwitterReadClient;
    let mockSingleTweet: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSingleTweet = vi.fn();

        const mockClientInstance = {
            v2: {
                singleTweet: mockSingleTweet,
            },
        };
        vi.mocked(TwitterApi).mockReturnValue(mockClientInstance as any);

        client = new TwitterReadClient("test-bearer-token");
    });

    it("should re-throw error with error code from 'status' property", async () => {
        const apiError = {
            status: 500,
            message: "Internal server error",
        };

        mockSingleTweet.mockRejectedValue(apiError);

        const error = await client
            .getTweet("1234567890")
            .catch((e) => e);

        expect(error.message).toBe("[object Object]");
        expect(error.code).toBe(500);
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error fetching tweet:",
            {
                tweetId: "1234567890",
                errorCode: 500,
                errorMessage: "[object Object]",
            }
        );
    });

    it("should re-throw error with error code from number 'status' property", async () => {
        const apiError = {
            status: 503,
            message: "Service unavailable",
        };

        mockSingleTweet.mockRejectedValue(apiError);

        const error = await client
            .getTweet("1234567890")
            .catch((e) => e);

        expect(error.code).toBe(503);
    });
});

describe("TwitterReadClient - getTweet() error handling generic errors", () => {
    let client: TwitterReadClient;
    let mockSingleTweet: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSingleTweet = vi.fn();

        const mockClientInstance = {
            v2: {
                singleTweet: mockSingleTweet,
            },
        };
        vi.mocked(TwitterApi).mockReturnValue(mockClientInstance as any);

        client = new TwitterReadClient("test-bearer-token");
    });

    it("should re-throw error without code property (generic error)", async () => {
        const apiError = new Error("Network error");

        mockSingleTweet.mockRejectedValue(apiError);

        await expect(client.getTweet("1234567890")).rejects.toThrow(
            "Network error"
        );

        const error = await client
            .getTweet("1234567890")
            .catch((e) => e);

        expect(error.code).toBeUndefined();
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error fetching tweet:",
            {
                tweetId: "1234567890",
                errorCode: undefined,
                errorMessage: "Network error",
            }
        );
    });

    it("should handle string errors", async () => {
        mockSingleTweet.mockRejectedValue("String error message");

        await expect(client.getTweet("1234567890")).rejects.toThrow(
            "String error message"
        );

        const error = await client
            .getTweet("1234567890")
            .catch((e) => e);

        expect(error.code).toBeUndefined();
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Error fetching tweet:",
            {
                tweetId: "1234567890",
                errorCode: undefined,
                errorMessage: "String error message",
            }
        );
    });

    it("should handle non-Error objects without code or status", async () => {
        const apiError = { message: "Custom error" };

        mockSingleTweet.mockRejectedValue(apiError);

        const error = await client
            .getTweet("1234567890")
            .catch((e) => e);

        expect(error.message).toBe("[object Object]");
        expect(error.code).toBeUndefined();
    });
});

describe("TwitterReadClient - getErrorCode() private method behavior", () => {
    let client: TwitterReadClient;
    let mockSingleTweet: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSingleTweet = vi.fn();

        const mockClientInstance = {
            v2: {
                singleTweet: mockSingleTweet,
            },
        };
        vi.mocked(TwitterApi).mockReturnValue(mockClientInstance as any);

        client = new TwitterReadClient("test-bearer-token");
    });

    it("should extract number from 'code' property", async () => {
        const apiError = { code: 404, message: "Not found" };

        mockSingleTweet.mockRejectedValue(apiError);

        const error = await client.getTweet("1234567890").catch((e) => e);

        expect(error.code).toBe(404);
    });

    it("should extract number from 'status' property", async () => {
        const apiError = { status: 500, message: "Server error" };

        mockSingleTweet.mockRejectedValue(apiError);

        const error = await client.getTweet("1234567890").catch((e) => e);

        expect(error.code).toBe(500);
    });

    it("should return undefined for non-object errors", async () => {
        mockSingleTweet.mockRejectedValue("string error");

        const error = await client.getTweet("1234567890").catch((e) => e);

        expect(error.code).toBeUndefined();
    });

    it("should return undefined for null errors", async () => {
        mockSingleTweet.mockRejectedValue(null);

        const error = await client.getTweet("1234567890").catch((e) => e);

        expect(error.code).toBeUndefined();
    });

    it("should return undefined when code is not a number", async () => {
        const apiError = { code: "404", message: "Not found" };

        mockSingleTweet.mockRejectedValue(apiError);

        const error = await client.getTweet("1234567890").catch((e) => e);

        expect(error.code).toBeUndefined();
    });

    it("should return undefined when status is not a number", async () => {
        const apiError = { status: "500", message: "Server error" };

        mockSingleTweet.mockRejectedValue(apiError);

        const error = await client.getTweet("1234567890").catch((e) => e);

        expect(error.code).toBeUndefined();
    });

    it("should prioritize code over status when both present", async () => {
        const apiError = { code: 404, status: 500, message: "Not found" };

        mockSingleTweet.mockRejectedValue(apiError);

        const error = await client.getTweet("1234567890").catch((e) => e);

        expect(error.code).toBe(404);
    });
});

describe("createTwitterReadClient", () => {
    let mockRuntime: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRuntime = {
            getSetting: vi.fn(),
        };
    });

    it("should return TwitterReadClient when TWITTER_BEARER_TOKEN exists", async () => {
        mockRuntime.getSetting.mockReturnValue("test-bearer-token");

        const mockClientInstance = {
            v2: {
                singleTweet: vi.fn(),
            },
        };
        vi.mocked(TwitterApi).mockReturnValue(mockClientInstance as any);

        const result = await createTwitterReadClient(mockRuntime);

        expect(result).toBeInstanceOf(TwitterReadClient);
        expect(mockRuntime.getSetting).toHaveBeenCalledWith(
            "TWITTER_BEARER_TOKEN"
        );
    });

    it("should return null when TWITTER_BEARER_TOKEN is missing", async () => {
        mockRuntime.getSetting.mockReturnValue(undefined);

        const result = await createTwitterReadClient(mockRuntime);

        expect(result).toBeNull();
        expect(elizaLogger.warn).toHaveBeenCalledWith(
            "TWITTER_BEARER_TOKEN not found in runtime settings. Twitter read functionality will not be available."
        );
    });

    it("should return null when TWITTER_BEARER_TOKEN is empty string", async () => {
        mockRuntime.getSetting.mockReturnValue("");

        const result = await createTwitterReadClient(mockRuntime);

        expect(result).toBeNull();
        expect(elizaLogger.warn).toHaveBeenCalledWith(
            "TWITTER_BEARER_TOKEN not found in runtime settings. Twitter read functionality will not be available."
        );
    });

    it("should return null on initialization error", async () => {
        mockRuntime.getSetting.mockReturnValue("invalid-token");

        // Make TwitterApi throw an error
        vi.mocked(TwitterApi).mockImplementation(() => {
            throw new Error("Invalid token format");
        });

        const result = await createTwitterReadClient(mockRuntime);

        expect(result).toBeNull();
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Failed to initialize Twitter read client:",
            expect.any(Error)
        );
    });

    it("should log error on initialization failure", async () => {
        const initError = new Error("Initialization failed");
        mockRuntime.getSetting.mockReturnValue("token");
        vi.mocked(TwitterApi).mockImplementation(() => {
            throw initError;
        });

        await createTwitterReadClient(mockRuntime);

        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Failed to initialize Twitter read client:",
            initError
        );
    });

    it("should handle runtime.getSetting throwing an error", async () => {
        mockRuntime.getSetting.mockImplementation(() => {
            throw new Error("Runtime error");
        });

        const result = await createTwitterReadClient(mockRuntime);

        expect(result).toBeNull();
        expect(elizaLogger.error).toHaveBeenCalledWith(
            "Failed to initialize Twitter read client:",
            expect.any(Error)
        );
    });
});
