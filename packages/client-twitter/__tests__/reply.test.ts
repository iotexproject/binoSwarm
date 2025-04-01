import { describe, it, expect, vi, beforeEach } from "vitest";
import { IAgentRuntime, State } from "@elizaos/core";

import { ClientBase } from "../src/base";
import { TwitterConfig, DEFAULT_MAX_TWEET_LENGTH } from "../src/environment";
import { TwitterHelpers } from "../src/helpers";
import { TwitterReplyClient } from "../src/reply";
import {
    buildRuntimeMock,
    buildConfigMock,
    buildTwitterClientMock,
    mockTwitterProfile,
    mockCharacter,
} from "./mocks";

describe("TwitterReplyClient", () => {
    let mockRuntime: IAgentRuntime;
    let mockConfig: TwitterConfig;
    let baseClient: ClientBase;
    let mockTwitterClient: any;
    let mockState: State;
    let tweetId: string;

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

        // Mock state and tweetId
        mockState = { key: "value" } as unknown as State;
        tweetId = "123456789";

        // Spy on TwitterHelpers methods
        vi.spyOn(TwitterHelpers, "handleStandardTweet").mockResolvedValue(
            undefined
        );
        vi.spyOn(TwitterHelpers, "handleNoteTweet").mockResolvedValue(
            undefined
        );
    });

    it("should process a standard reply tweet correctly", async () => {
        const replyText = "This is a standard reply";

        await TwitterReplyClient.process(
            baseClient,
            mockRuntime,
            mockState,
            tweetId,
            replyText
        );

        // Verify standard tweet method was called with correct arguments
        expect(TwitterHelpers.handleStandardTweet).toHaveBeenCalledWith(
            baseClient,
            replyText,
            tweetId
        );

        // Verify note tweet method was not called
        expect(TwitterHelpers.handleNoteTweet).not.toHaveBeenCalled();

        // Verify cache was set with correct data
        expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
            `twitter/reply_generation_${tweetId}.txt`,
            `Context:\n${mockState}\n\nGenerated Reply:\n${replyText}`
        );
    });

    it("should process a note reply tweet for long content", async () => {
        const longReplyText = "A".repeat(DEFAULT_MAX_TWEET_LENGTH + 1);

        await TwitterReplyClient.process(
            baseClient,
            mockRuntime,
            mockState,
            tweetId,
            longReplyText
        );

        // Verify note tweet method was called with correct arguments
        expect(TwitterHelpers.handleNoteTweet).toHaveBeenCalledWith(
            baseClient,
            longReplyText,
            tweetId
        );

        // Verify standard tweet method was not called
        expect(TwitterHelpers.handleStandardTweet).not.toHaveBeenCalled();

        // Verify cache was set with correct data
        expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
            `twitter/reply_generation_${tweetId}.txt`,
            `Context:\n${mockState}\n\nGenerated Reply:\n${longReplyText}`
        );
    });

    it("should cache reply tweet data correctly", async () => {
        const replyContent = "This is a reply tweet content";

        await TwitterReplyClient.cacheReplyTweet(
            mockRuntime,
            tweetId,
            mockState,
            replyContent
        );

        // Verify cache was set with correct key and data
        expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
            `twitter/reply_generation_${tweetId}.txt`,
            `Context:\n${mockState}\n\nGenerated Reply:\n${replyContent}`
        );
    });
});
