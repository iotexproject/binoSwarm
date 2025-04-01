import { describe, it, expect, vi, beforeEach } from "vitest";
import { IAgentRuntime, State } from "@elizaos/core";
import type { Tweet } from "agent-twitter-client";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import { TwitterHelpers } from "../src/helpers";
import { TwitterQuoteClient } from "../src/quote";
import {
    buildRuntimeMock,
    buildConfigMock,
    buildTwitterClientMock,
    mockTwitterProfile,
    mockCharacter,
} from "./mocks";

describe("TwitterQuoteClient", () => {
    let mockRuntime: IAgentRuntime;
    let mockConfig: TwitterConfig;
    let baseClient: ClientBase;
    let mockTwitterClient: any;
    let mockState: State;
    let mockTweet: Tweet;

    beforeEach(() => {
        vi.clearAllMocks();

        mockTwitterClient = buildTwitterClientMock();
        mockRuntime = buildRuntimeMock();
        mockConfig = buildConfigMock();
        baseClient = new ClientBase(mockRuntime, mockConfig);

        baseClient.twitterClient = mockTwitterClient;
        baseClient.profile = mockTwitterProfile;

        // Mock RequestQueue
        baseClient.requestQueue = {
            add: async <T>(request: () => Promise<T>): Promise<T> => request(),
        } as any;

        // Setup mock runtime with character
        mockRuntime.character = mockCharacter;

        // Mock state and tweet
        mockState = { key: "value" } as unknown as State;
        mockTweet = { id: "123456789", text: "Original tweet" } as Tweet;

        // Spy on TwitterHelpers.handleQuoteTweet
        vi.spyOn(TwitterHelpers, "handleQuoteTweet").mockResolvedValue(
            undefined
        );
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

        // Verify TwitterHelpers.handleQuoteTweet was called with correct arguments
        expect(TwitterHelpers.handleQuoteTweet).toHaveBeenCalledWith(
            baseClient,
            quoteText,
            mockTweet.id
        );

        // Verify cache was set with correct data
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

        // Verify cache was set with correct key and data
        expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
            `twitter/quote_generation_${mockTweet.id}.txt`,
            `Context:\n${mockState}\n\nGenerated Quote:\n${quoteContent}`
        );
    });
});
