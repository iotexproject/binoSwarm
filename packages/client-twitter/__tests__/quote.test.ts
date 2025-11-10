import { describe, it, expect, vi, beforeEach } from "vitest";
import { IAgentRuntime, State } from "@elizaos/core";
import type { Tweet } from "agent-twitter-client";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import { TwitterQuoteClient } from "../src/quote";
import {
    buildRuntimeMock,
    buildConfigMock,
    mockTwitterProfile,
    mockCharacter,
    createMockTweet,
} from "./mocks";

describe("TwitterQuoteClient", () => {
    let mockRuntime: IAgentRuntime;
    let mockConfig: TwitterConfig;
    let baseClient: ClientBase;
    let mockTwitterApiV2Client: any;
    let mockState: State;
    let mockTweet: Tweet;

    beforeEach(() => {
        vi.clearAllMocks();

        mockRuntime = buildRuntimeMock();
        mockConfig = buildConfigMock();
        baseClient = new ClientBase(mockRuntime, mockConfig);

        mockTwitterApiV2Client = {
            quoteTweet: vi.fn().mockResolvedValue(createMockTweet()),
        };
        baseClient.twitterApiV2Client = mockTwitterApiV2Client as any;
        baseClient.profile = mockTwitterProfile;

        // Mock RequestQueue
        baseClient.requestQueue = {
            add: async <T>(request: () => Promise<T>): Promise<T> => request(),
        } as any;

        // Setup mock runtime with character
        mockRuntime.character = mockCharacter;

        // Mock state and tweet
        mockState = { key: "value" } as unknown as State;
        mockTweet = createMockTweet({
            id: "123456789",
            text: "Original tweet",
        });
    });

    it("should process a quote tweet correctly", async () => {
        const quoteText = "This is a quote tweet";

        await TwitterQuoteClient.process(
            baseClient,
            mockRuntime,
            quoteText,
            mockTweet,
            mockState
        );

        expect(mockTwitterApiV2Client.quoteTweet).toHaveBeenCalledWith(
            quoteText,
            mockTweet.id
        );

        expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
            `twitter/quote_generation_${mockTweet.id}.txt`,
            `Context:\n${mockState}\n\nGenerated Quote:\n${quoteText}`
        );
    });

    it("should cache quote tweet data correctly", async () => {
        const quoteContent = "This is a quote tweet content";

        await TwitterQuoteClient.cacheQuoteTweet(
            mockRuntime,
            mockTweet,
            mockState,
            quoteContent
        );

        expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
            `twitter/quote_generation_${mockTweet.id}.txt`,
            `Context:\n${mockState}\n\nGenerated Quote:\n${quoteContent}`
        );
    });
});
