import {
    describe,
    it,
    expect,
    beforeEach,
    vi,
    afterEach,
    MockedFunction,
} from "vitest";
import { DiscourseClient } from "../clients/discourseClient";
import {
    DiscoursePostRequest,
    DiscoursePostResponse,
} from "../types/discourse";
import { getEnvVariable } from "@elizaos/core";

// Mock the @elizaos/core module
vi.mock("@elizaos/core", () => ({
    elizaLogger: {
        log: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
    },
    getEnvVariable: vi.fn(),
}));

// Mock global fetch
global.fetch = vi.fn();

describe("DiscourseClient", () => {
    let discourseClient: DiscourseClient;
    let mockGetEnvVariable: MockedFunction<typeof getEnvVariable>;

    const mockBaseUrl = "https://test-discourse.example.com";
    const mockApiKey = "test-api-key-1234567890abcdef1234567890abcdef";
    const mockApiUsername = "test-username";

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock environment variables
        mockGetEnvVariable = vi.mocked(getEnvVariable);
        mockGetEnvVariable.mockImplementation((varName: string) => {
            switch (varName) {
                case "DISCOURSE_BASE_URL":
                    return mockBaseUrl;
                case "DISCOURSE_API_KEY":
                    return mockApiKey;
                case "DISCOURSE_API_USERNAME":
                    return mockApiUsername;
                default:
                    return null;
            }
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe("constructor", () => {
        it("should create instance with environment variables", () => {
            discourseClient = new DiscourseClient();
            expect(mockGetEnvVariable).toHaveBeenCalledWith(
                "DISCOURSE_BASE_URL"
            );
            expect(mockGetEnvVariable).toHaveBeenCalledWith(
                "DISCOURSE_API_KEY"
            );
            expect(mockGetEnvVariable).toHaveBeenCalledWith(
                "DISCOURSE_API_USERNAME"
            );
        });

        it("should create instance with provided parameters", () => {
            discourseClient = new DiscourseClient(
                "https://custom.discourse.com",
                "custom-api-key-1234567890abcdef1234567890abcdef",
                "custom-username"
            );
            expect(discourseClient.getBaseUrl()).toBe(
                "https://custom.discourse.com"
            );
        });

        it("should throw error for invalid base URL", () => {
            mockGetEnvVariable.mockImplementation((varName: string) => {
                switch (varName) {
                    case "DISCOURSE_BASE_URL":
                        return "invalid-url";
                    case "DISCOURSE_API_KEY":
                        return mockApiKey;
                    case "DISCOURSE_API_USERNAME":
                        return mockApiUsername;
                    default:
                        return null;
                }
            });

            expect(() => new DiscourseClient()).toThrow(
                "DISCOURSE_BASE_URL must be a valid HTTP/HTTPS URL"
            );
        });

        it("should throw error for short API key", () => {
            mockGetEnvVariable.mockImplementation((varName: string) => {
                switch (varName) {
                    case "DISCOURSE_BASE_URL":
                        return mockBaseUrl;
                    case "DISCOURSE_API_KEY":
                        return "short-key";
                    case "DISCOURSE_API_USERNAME":
                        return mockApiUsername;
                    default:
                        return null;
                }
            });

            expect(() => new DiscourseClient()).toThrow(
                "DISCOURSE_API_KEY appears to be invalid (too short)"
            );
        });

        it("should throw error for missing username", () => {
            mockGetEnvVariable.mockImplementation((varName: string) => {
                switch (varName) {
                    case "DISCOURSE_BASE_URL":
                        return mockBaseUrl;
                    case "DISCOURSE_API_KEY":
                        return mockApiKey;
                    case "DISCOURSE_API_USERNAME":
                        return "";
                    default:
                        return null;
                }
            });

            expect(() => new DiscourseClient()).toThrow(
                "Required environment variable DISCOURSE_API_USERNAME is not set"
            );
        });

        it("should throw error for missing environment variables", () => {
            mockGetEnvVariable.mockReturnValue(null);

            expect(() => new DiscourseClient()).toThrow(
                "Required environment variable DISCOURSE_BASE_URL is not set"
            );
        });
    });

    describe("createPost", () => {
        beforeEach(() => {
            discourseClient = new DiscourseClient();
        });

        it("should successfully create a post", async () => {
            const mockPostRequest: DiscoursePostRequest = {
                raw: "This is a test post",
                topic_id: 123,
                created_at: "2025-01-01T00:00:00Z",
                reply_to_post_number: 1,
            };

            const mockPostResponse: DiscoursePostResponse = {
                id: 456,
                name: "Test User",
                username: "testuser",
                avatar_template: "/test/avatar.png",
                created_at: "2025-01-01T00:00:00Z",
                raw: "This is a test post",
                post_number: 2,
                topic_id: 123,
                user_id: 789,
            };

            const mockFetchResponse = {
                ok: true,
                json: vi.fn().mockResolvedValue(mockPostResponse),
            };

            vi.mocked(fetch).mockResolvedValue(mockFetchResponse as any);

            const result = await discourseClient.createPost(mockPostRequest);

            expect(fetch).toHaveBeenCalledWith(`${mockBaseUrl}/posts.json`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Api-Key": mockApiKey,
                    "Api-Username": mockApiUsername,
                },
                body: JSON.stringify(mockPostRequest),
            });

            expect(result).toEqual(mockPostResponse);
        });

        it("should throw error for empty post content", async () => {
            const mockPostRequest: DiscoursePostRequest = {
                raw: "",
                topic_id: 123,
                created_at: "2025-01-01T00:00:00Z",
                reply_to_post_number: 1,
            };

            await expect(
                discourseClient.createPost(mockPostRequest)
            ).rejects.toThrow(
                "Post content (raw) is required and cannot be empty"
            );
        });

        it("should throw error for invalid topic_id", async () => {
            const mockPostRequest: DiscoursePostRequest = {
                raw: "Test content",
                topic_id: 0,
                created_at: "2025-01-01T00:00:00Z",
                reply_to_post_number: 1,
            };

            await expect(
                discourseClient.createPost(mockPostRequest)
            ).rejects.toThrow("Valid topic_id is required");
        });

        it("should throw error for content exceeding maximum length", async () => {
            const longContent = "a".repeat(32001);
            const mockPostRequest: DiscoursePostRequest = {
                raw: longContent,
                topic_id: 123,
                created_at: "2025-01-01T00:00:00Z",
                reply_to_post_number: 1,
            };

            await expect(
                discourseClient.createPost(mockPostRequest)
            ).rejects.toThrow(
                "Post content exceeds maximum length of 32,000 characters"
            );
        });

        it("should handle API error response", async () => {
            const mockPostRequest: DiscoursePostRequest = {
                raw: "Test content",
                topic_id: 123,
                created_at: "2025-01-01T00:00:00Z",
                reply_to_post_number: 1,
            };

            const mockErrorResponse = {
                action: "create_post",
                errors: ["Topic is closed", "User not allowed"],
            };

            const mockFetchResponse = {
                ok: false,
                status: 422,
                statusText: "Unprocessable Entity",
                json: vi.fn().mockResolvedValue(mockErrorResponse),
            };

            vi.mocked(fetch).mockResolvedValue(mockFetchResponse as any);

            await expect(
                discourseClient.createPost(mockPostRequest)
            ).rejects.toThrow("Failed to create post");
        });

        it("should handle API error without JSON body", async () => {
            const mockPostRequest: DiscoursePostRequest = {
                raw: "Test content",
                topic_id: 123,
                created_at: "2025-01-01T00:00:00Z",
                reply_to_post_number: 1,
            };

            const mockFetchResponse = {
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
                json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
            };

            vi.mocked(fetch).mockResolvedValue(mockFetchResponse as any);

            await expect(
                discourseClient.createPost(mockPostRequest)
            ).rejects.toThrow("Failed to create post");
        });

        it("should handle network errors", async () => {
            const mockPostRequest: DiscoursePostRequest = {
                raw: "Test content",
                topic_id: 123,
                created_at: "2025-01-01T00:00:00Z",
                reply_to_post_number: 1,
            };

            vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

            await expect(
                discourseClient.createPost(mockPostRequest)
            ).rejects.toThrow("Failed to create post");
        });
    });

    describe("testConnection", () => {
        beforeEach(() => {
            discourseClient = new DiscourseClient();
        });

        it("should return true for successful connection", async () => {
            const mockFetchResponse = {
                ok: true,
            };

            vi.mocked(fetch).mockResolvedValue(mockFetchResponse as any);

            const result = await discourseClient.testConnection();

            expect(result).toBe(true);
            expect(fetch).toHaveBeenCalledWith(`${mockBaseUrl}/site.json`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Api-Key": mockApiKey,
                    "Api-Username": mockApiUsername,
                },
            });
        });

        it("should return false for failed connection", async () => {
            const mockFetchResponse = {
                ok: false,
            };

            vi.mocked(fetch).mockResolvedValue(mockFetchResponse as any);

            const result = await discourseClient.testConnection();

            expect(result).toBe(false);
        });

        it("should return false for network errors", async () => {
            vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

            const result = await discourseClient.testConnection();

            expect(result).toBe(false);
        });
    });

    describe("getBaseUrl", () => {
        it("should return the base URL", () => {
            discourseClient = new DiscourseClient();
            expect(discourseClient.getBaseUrl()).toBe(mockBaseUrl);
        });
    });
});
