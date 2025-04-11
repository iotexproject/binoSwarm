import { describe, test, expect, vi, beforeEach } from "vitest";
import { embed } from "../src/embedding.ts";
import { IAgentRuntime, ModelProviderName } from "../src/types.ts";
import settings from "../src/settings.ts";
import { embed as aiEmbed } from "ai";
// Mock environment-related settings
vi.mock("../settings", () => ({
    default: {
        USE_OPENAI_EMBEDDING: "false",
        USE_OLLAMA_EMBEDDING: "false",
        USE_GAIANET_EMBEDDING: "false",
        OPENAI_API_KEY: "mock-openai-key",
        OPENAI_API_URL: "https://api.openai.com/v1",
        GAIANET_API_KEY: "mock-gaianet-key",
        OLLAMA_EMBEDDING_MODEL: "mxbai-embed-large",
        GAIANET_EMBEDDING_MODEL: "nomic-embed",
    },
}));

// Mock fastembed module for local embeddings
vi.mock("fastembed", () => ({
    FlagEmbedding: {
        init: vi.fn().mockResolvedValue({
            queryEmbed: vi
                .fn()
                .mockResolvedValue(new Float32Array(384).fill(0.1)),
        }),
    },
    EmbeddingModel: {
        BGESmallENV15: "BGE-small-en-v1.5",
    },
}));

vi.mock(import("ai"), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        embed: vi.fn().mockResolvedValue({
            embedding: new Float32Array(384).fill(0.1),
        }),
    };
});

// Mock global fetch for remote embedding requests
const mockFetch = vi.fn();
(global as any).fetch = mockFetch;

describe("Embedding Module", () => {
    let mockRuntime: IAgentRuntime;

    beforeEach(() => {
        // Prepare a mock runtime
        mockRuntime = {
            character: {
                modelProvider: ModelProviderName.OLLAMA,
                modelEndpointOverride: null,
            },
            token: "mock-token",
            messageManager: {
                getCachedEmbeddings: vi.fn().mockResolvedValue([]),
            },
        } as unknown as IAgentRuntime;

        vi.clearAllMocks();
        mockFetch.mockReset();
    });

    describe("embed function", () => {
        beforeEach(() => {
            // Mock a successful remote response with an example 384-dim embedding
            mockFetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        data: [{ embedding: new Array(384).fill(0.1) }],
                    }),
            });
        });

        test("should return an empty array for empty input text", async () => {
            const result = await embed(mockRuntime, "", false);
            expect(result).toEqual([]);
        });

        test("should return cached embedding if it already exists", async () => {
            const cachedEmbedding = new Array(384).fill(0.5);
            mockRuntime.messageManager.getCachedEmbeddings = vi
                .fn()
                .mockResolvedValue(cachedEmbedding);

            const result = await embed(mockRuntime, "test input", false);
            expect(result).toBe(cachedEmbedding);
        });

        test("should handle local embedding successfully (fastembed fallback)", async () => {
            // By default, it tries local first if in Node.
            // Then uses the mock fastembed response above.
            const originalEnv = process.env;
            delete process.env.USE_OPENAI_EMBEDDING;
            const result = await embed(mockRuntime, "test input", true);
            expect(result).toHaveLength(384);
            expect(result.every((v) => typeof v === "number")).toBe(true);
        });

        test("should throw on remote embedding if fetch fails", async () => {
            vi.mocked(aiEmbed).mockRejectedValueOnce(new Error("API Error"));
            vi.mocked(settings).USE_OPENAI_EMBEDDING = "true"; // Force remote

            await expect(
                embed(mockRuntime, "test input", true)
            ).rejects.toThrow("API Error");
        });

        test("should handle concurrent embedding requests", async () => {
            const promises = Array(5)
                .fill(null)
                .map(() => embed(mockRuntime, "concurrent test", false));
            await expect(Promise.all(promises)).resolves.toBeDefined();
        });
    });
});
