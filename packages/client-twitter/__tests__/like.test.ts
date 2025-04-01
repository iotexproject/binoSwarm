import { describe, it, expect, vi, beforeEach } from "vitest";
import { elizaLogger } from "@elizaos/core";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import { TwitterLikeClient } from "../src/like";
import {
    buildRuntimeMock,
    buildConfigMock,
    buildTwitterClientMock,
    mockTwitterProfile,
    mockCharacter,
} from "./mocks";

describe("TwitterLikeClient", () => {
    let mockConfig: TwitterConfig;
    let baseClient: ClientBase;
    let mockTwitterClient: any;
    let tweetId: string;

    beforeEach(() => {
        vi.clearAllMocks();

        mockTwitterClient = buildTwitterClientMock();
        const mockRuntime = buildRuntimeMock();
        mockConfig = buildConfigMock();
        baseClient = new ClientBase(mockRuntime, mockConfig);

        baseClient.twitterClient = mockTwitterClient;
        baseClient.profile = mockTwitterProfile;

        // Setup mock runtime with character
        mockRuntime.character = mockCharacter;

        // Mock tweetId
        tweetId = "123456789";

        // Mock Twitter client likeTweet method
        mockTwitterClient.likeTweet = vi.fn().mockResolvedValue(undefined);

        // Spy on logger
        vi.spyOn(elizaLogger, "log").mockImplementation(() => {});
        vi.spyOn(elizaLogger, "error").mockImplementation(() => {});
    });

    it("should like a tweet successfully", async () => {
        await TwitterLikeClient.process(baseClient, tweetId);

        // Verify likeTweet was called with correct tweetId
        expect(mockTwitterClient.likeTweet).toHaveBeenCalledWith(tweetId);

        // Verify success was logged
        expect(elizaLogger.log).toHaveBeenCalledWith(`Liked tweet ${tweetId}`);
        expect(elizaLogger.error).not.toHaveBeenCalled();
    });

    it("should handle errors when liking a tweet fails", async () => {
        const testError = new Error("API Error");
        mockTwitterClient.likeTweet.mockRejectedValueOnce(testError);

        await TwitterLikeClient.process(baseClient, tweetId);

        // Verify likeTweet was called with correct tweetId
        expect(mockTwitterClient.likeTweet).toHaveBeenCalledWith(tweetId);

        // Verify error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            `Error liking tweet ${tweetId}:`,
            testError
        );
        expect(elizaLogger.log).not.toHaveBeenCalled();
    });
});
