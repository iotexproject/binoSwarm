import { describe, it, expect, vi, beforeEach } from "vitest";
import { IAgentRuntime } from "@elizaos/core";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import { TwitterHelpers } from "../src/helpers";
import {
    buildRuntimeMock,
    buildConfigMock,
    buildTwitterClientMock,
    mockTwitterProfile,
    mockCharacter,
    setupMockTwitterClient,
} from "./mocks";

describe("Tweet Generation and Posting", () => {
    let mockRuntime: IAgentRuntime;
    let mockConfig: TwitterConfig;
    let baseClient: ClientBase;
    let mockTwitterClient: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockTwitterClient = buildTwitterClientMock();
        mockRuntime = buildRuntimeMock();
        mockConfig = buildConfigMock();
        baseClient = new ClientBase(mockRuntime, mockConfig);

        baseClient.twitterClient = mockTwitterClient;
        baseClient.profile = mockTwitterProfile;

        // Mock RequestQueue with just the add method since that's all we use
        baseClient.requestQueue = {
            add: async <T>(request: () => Promise<T>): Promise<T> => request(),
        } as any;

        // Setup mock runtime with character
        mockRuntime.character = mockCharacter;

        // Ensure baseClient.profile is not null before each test
        baseClient.profile = mockTwitterProfile;
    });

    it("should handle standard tweet posting", async () => {
        const tweetContent = "Test tweet";
        setupMockTwitterClient(mockTwitterClient, tweetContent);

        await TwitterHelpers.sendStandardTweet(baseClient, tweetContent);
        expect(mockTwitterClient.sendTweet).toHaveBeenCalledWith(
            tweetContent,
            undefined
        );
    });

    it("should handle note tweet posting", async () => {
        const tweetContent =
            "A very long tweet that exceeds standard length...".repeat(10);
        setupMockTwitterClient(mockTwitterClient, tweetContent);

        await TwitterHelpers.handleNoteTweet(baseClient, tweetContent);

        expect(mockTwitterClient.sendNoteTweet).toHaveBeenCalledWith(
            tweetContent,
            undefined
        );
    });
});
