import { describe, expect, it, vi, beforeEach } from "vitest";
import { newsProvider } from "../providers/newsProvider";
import { elizaLogger } from "@elizaos/core";

vi.mock("@elizaos/core", async () => {
    const actual = await vi.importActual("@elizaos/core");
    return {
        ...actual,
        elizaLogger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
});

vi.mock("../services/quicksilver", () => ({
    getRawDataFromQuicksilver: vi
        .fn()
        .mockImplementation((endpoint, params) => {
            if (endpoint === "news" && params.category === "technology") {
                return Promise.resolve({
                    status: "ok",
                    totalResults: 2,
                    articles: [
                        {
                            source: { id: "techcrunch", name: "TechCrunch" },
                            author: "John Doe",
                            title: "New AI breakthrough announced",
                            description:
                                "Researchers have made a significant breakthrough in AI technology.",
                            url: "https://example.com/ai-breakthrough",
                            urlToImage: "https://example.com/images/ai.jpg",
                            publishedAt: "2023-06-01T12:00:00Z",
                            content: "Full article content here...",
                        },
                        {
                            source: { id: "wired", name: "Wired" },
                            author: "Jane Smith",
                            title: "The future of quantum computing",
                            description:
                                "How quantum computing will change the technology landscape.",
                            url: "https://example.com/quantum-computing",
                            urlToImage:
                                "https://example.com/images/quantum.jpg",
                            publishedAt: "2023-06-02T10:30:00Z",
                            content: "Full article content here...",
                        },
                    ],
                });
            }
            return Promise.reject(new Error("Unknown endpoint or parameters"));
        }),
}));

import { getRawDataFromQuicksilver } from "../services/quicksilver";

describe("NewsProvider", () => {
    let mockRuntime: any;
    let mockMessage: any;
    let mockState: any;
    let mockCacheManager: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCacheManager = {
            get: vi.fn().mockResolvedValue(undefined),
            set: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
        };

        mockRuntime = {
            getSetting: vi.fn(),
            cacheManager: mockCacheManager,
        };
        mockMessage = { content: { text: "test message" } };
        mockState = {};
    });

    describe("get", () => {
        it("should fetch and format news data when not cached", async () => {
            mockCacheManager.get.mockResolvedValue(undefined);

            const result = await newsProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalledWith(
                "news/technology"
            );

            expect(getRawDataFromQuicksilver).toHaveBeenCalledWith("news", {
                category: "technology",
                q: "",
            });

            expect(mockCacheManager.set).toHaveBeenCalledTimes(1);
            expect(mockCacheManager.set).toHaveBeenCalledWith(
                "news/technology",
                expect.any(Object),
                expect.any(Object)
            );

            expect(result).toContain("Technology News Headlines");
            expect(result).toContain("New AI breakthrough announced");
            expect(result).toContain("The future of quantum computing");
            expect(result).toContain("TechCrunch");
            expect(result).toContain("Wired");
        });

        it("should use cached news data when available", async () => {
            const cachedNewsData = {
                status: "ok",
                totalResults: 2,
                articles: [
                    {
                        source: { id: "techcrunch", name: "TechCrunch" },
                        author: "John Doe",
                        title: "New AI breakthrough announced",
                        description:
                            "Researchers have made a significant breakthrough in AI technology.",
                        url: "https://example.com/ai-breakthrough",
                        urlToImage: "https://example.com/images/ai.jpg",
                        publishedAt: "2023-06-01T12:00:00Z",
                        content: "Full article content here...",
                    },
                    {
                        source: { id: "wired", name: "Wired" },
                        author: "Jane Smith",
                        title: "The future of quantum computing",
                        description:
                            "How quantum computing will change the technology landscape.",
                        url: "https://example.com/quantum-computing",
                        urlToImage: "https://example.com/images/quantum.jpg",
                        publishedAt: "2023-06-02T10:30:00Z",
                        content: "Full article content here...",
                    },
                ],
            };

            mockCacheManager.get.mockResolvedValue(cachedNewsData);

            const result = await newsProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalledWith(
                "news/technology"
            );

            expect(getRawDataFromQuicksilver).not.toHaveBeenCalled();

            expect(mockCacheManager.set).not.toHaveBeenCalled();

            expect(result).toContain("Technology News Headlines");
            expect(result).toContain("New AI breakthrough announced");
            expect(result).toContain("The future of quantum computing");
        });

        it("should handle empty news data", async () => {
            (getRawDataFromQuicksilver as any).mockResolvedValueOnce({
                status: "ok",
                totalResults: 0,
                articles: [],
            });

            const result = await newsProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(result).toBe("No technology news available at this time.");
        });

        it("should handle cache errors gracefully", async () => {
            mockCacheManager.get.mockRejectedValue(new Error("Cache error"));

            const result = await newsProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(getRawDataFromQuicksilver).toHaveBeenCalled();
            expect(result).toContain("Technology News Headlines");
            expect(elizaLogger.error).toHaveBeenCalled();
        });

        it("should handle API errors", async () => {
            (getRawDataFromQuicksilver as any).mockRejectedValueOnce(
                new Error("API error")
            );

            const result = await newsProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(result).toBe("");
            expect(elizaLogger.error).toHaveBeenCalled();
        });

        it("should limit the number of headlines to MAX_HEADLINES", async () => {
            const manyArticles = Array(30)
                .fill(0)
                .map((_, i) => ({
                    source: { id: `source-${i}`, name: `Source ${i}` },
                    author: `Author ${i}`,
                    title: `Article Title ${i}`,
                    description: `Description ${i}`,
                    url: `https://example.com/article-${i}`,
                    urlToImage: `https://example.com/images/article-${i}.jpg`,
                    publishedAt: `2023-06-0${(i % 9) + 1}T12:00:00Z`,
                    content: `Content ${i}`,
                }));

            (getRawDataFromQuicksilver as any).mockResolvedValueOnce({
                status: "ok",
                totalResults: manyArticles.length,
                articles: manyArticles,
            });

            const result = await newsProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            const headlineCount = (result?.match(/\d+\. \*\*/g) || []).length;

            expect(headlineCount).toBeLessThanOrEqual(20);
        });
    });
});
