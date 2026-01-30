import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";

// Import the action handler
import { readTweet } from "../actions/readTweet";

// Mock Twitter client types
interface MockTwitterClient {
    getTweet: ReturnType<typeof vi.fn>;
}

// Mock runtime setup
const createMockRuntime = (): IAgentRuntime => {
    return {
        agentId: "test-agent-id" as any,
        getCharacter: vi.fn(),
        getService: vi.fn(),
        clients: {} as Record<string, unknown>,
    } as unknown as IAgentRuntime;
};

// Mock message setup
const createMockMessage = (text: string): Memory => {
    return {
        id: "test-message-id" as any,
        userId: "test-user-id" as any,
        agentId: "test-agent-id" as any,
        roomId: "test-room-id" as any,
        content: {
            text,
        },
        createdAt: Date.now(),
    } as unknown as Memory;
};

describe("READ_TWEET action - Error Handling", () => {
    let mockRuntime: IAgentRuntime;
    let mockCallback: HandlerCallback;

    beforeEach(() => {
        mockRuntime = createMockRuntime();
        mockCallback = vi.fn();
        vi.clearAllMocks();
    });

    describe("AC4: Invalid URL format", () => {
        it("should return user-friendly error when URL format is invalid - non-twitter URL", async () => {
            const message = createMockMessage("Check out this post: https://facebook.com/post/123");

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "I couldn't read that URL. Please make sure it's a valid Twitter/X link.",
            });
        });

        it("should return user-friendly error for malformed URL", async () => {
            const message = createMockMessage("not-a-valid-url");

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "I couldn't read that URL. Please make sure it's a valid Twitter/X link.",
            });
        });

        it("should return user-friendly error for URL without username", async () => {
            const message = createMockMessage("https://x.com/status/123");

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "I couldn't read that URL. Please make sure it's a valid Twitter/X link.",
            });
        });

        it("should return user-friendly error for URL without status path", async () => {
            const message = createMockMessage("https://x.com/user/tweets/123");

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "I couldn't read that URL. Please make sure it's a valid Twitter/X link.",
            });
        });

        it("should return user-friendly error for empty URL", async () => {
            const message = createMockMessage("");

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "I couldn't read that URL. Please make sure it's a valid Twitter/X link.",
            });
        });

        it("should return user-friendly error for URL with just domain", async () => {
            const message = createMockMessage("https://x.com");

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "I couldn't read that URL. Please make sure it's a valid Twitter/X link.",
            });
        });

        it("should return user-friendly error for URL with non-numeric tweet ID", async () => {
            const message = createMockMessage("https://x.com/user/status/abc");

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "I couldn't read that URL. Please make sure it's a valid Twitter/X link.",
            });
        });
    });

    describe("AC5: Tweet not available errors", () => {
        let mockTwitterClient: MockTwitterClient;

        beforeEach(() => {
            mockTwitterClient = {
                v2: {
                    getTweet: vi.fn(),
                },
            };
            mockRuntime.clients = {
                twitter: mockTwitterClient,
            };
        });

        it("should return user-friendly error when tweet is deleted (404)", async () => {
            const message = createMockMessage(
                "https://x.com/user/status/1234567890"
            );

            // Mock Twitter API to return 404 error
            const apiError = new Error("Tweet not found") as any;
            apiError.code = 404;
            apiError.errors = [{ message: "No status found with that ID." }];
            mockTwitterClient.v2.getTweet.mockRejectedValue(apiError);

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "This tweet is not available",
            });
        });

        it("should return user-friendly error when tweet is from protected account (403)", async () => {
            const message = createMockMessage(
                "https://x.com/protected_user/status/1234567890"
            );

            // Mock Twitter API to return 403 Forbidden
            const apiError = new Error("Forbidden") as any;
            apiError.code = 403;
            apiError.errors = [{ message: "You are not permitted to view this tweet." }];
            mockTwitterClient.v2.getTweet.mockRejectedValue(apiError);

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "I couldn't read this tweet",
            });
        });

        it("should return user-friendly error when account is suspended", async () => {
            const message = createMockMessage(
                "https://x.com/suspended_user/status/1234567890"
            );

            // Mock Twitter API to return suspended account error
            const apiError = new Error("User has been suspended") as any;
            apiError.code = 403;
            apiError.errors = [{ message: "User has been suspended." }];
            mockTwitterClient.v2.getTweet.mockRejectedValue(apiError);

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "I couldn't read this tweet",
            });
        });

        it("should return user-friendly error when tweet does not exist", async () => {
            const message = createMockMessage(
                "https://x.com/user/status/9999999999999999999"
            );

            // Mock Twitter API to return non-existent tweet error
            const apiError = new Error("No status found") as any;
            apiError.code = 404;
            apiError.errors = [{ message: "No status found with that ID." }];
            mockTwitterClient.v2.getTweet.mockRejectedValue(apiError);

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "This tweet is not available",
            });
        });

        it("should handle generic Twitter API errors gracefully", async () => {
            const message = createMockMessage(
                "https://x.com/user/status/1234567890"
            );

            // Mock Twitter API to return generic error
            const apiError = new Error("Twitter API error") as any;
            apiError.code = 500;
            mockTwitterClient.v2.getTweet.mockRejectedValue(apiError);

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "I couldn't read this tweet",
            });
        });
    });

    describe("AC6: Rate limit errors", () => {
        let mockTwitterClient: MockTwitterClient;

        beforeEach(() => {
            mockTwitterClient = {
                v2: {
                    getTweet: vi.fn(),
                },
            };
            mockRuntime.clients = {
                twitter: mockTwitterClient,
            };
        });

        it("should return informative message about rate limits (429)", async () => {
            const message = createMockMessage(
                "https://x.com/user/status/1234567890"
            );

            // Mock Twitter API to return rate limit error
            const apiError = new Error("Rate limit exceeded") as any;
            apiError.code = 429;
            apiError.rateLimit = {
                reset: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes from now
            };
            mockTwitterClient.v2.getTweet.mockRejectedValue(apiError);

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "Rate limit reached. Please try again later.",
            });
        });

        it("should suggest user try again later when rate limited", async () => {
            const message = createMockMessage(
                "https://x.com/user/status/1234567890"
            );

            // Mock Twitter API to return rate limit error
            const apiError = new Error("Rate limit exceeded") as any;
            apiError.code = 429;
            apiError.rateLimit = {
                reset: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            };
            mockTwitterClient.v2.getTweet.mockRejectedValue(apiError);

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "Rate limit reached. Please try again later.",
            });
        });

        it("should handle rate limit errors without reset time information", async () => {
            const message = createMockMessage(
                "https://x.com/user/status/1234567890"
            );

            // Mock Twitter API to return rate limit error without reset time
            const apiError = new Error("Rate limit exceeded") as any;
            apiError.code = 429;
            mockTwitterClient.v2.getTweet.mockRejectedValue(apiError);

            await readTweet(mockRuntime, message, {} as State, {}, mockCallback);

            expect(mockCallback).toHaveBeenCalledWith({
                text: "Rate limit reached. Please try again later.",
            });
        });
    });
});
