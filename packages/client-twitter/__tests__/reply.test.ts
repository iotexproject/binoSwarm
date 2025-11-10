import { describe, it, expect, vi, beforeEach } from "vitest";
import { IAgentRuntime, State } from "@elizaos/core";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
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

        // Spy on TwitterHelpers method
        vi.spyOn(TwitterHelpers, "handleTweet").mockResolvedValue(
            undefined as any
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
            `Context:\n${JSON.stringify(mockState, null, 2)}\n\nGenerated Reply:\n${replyContent}`
        );
    });
});
