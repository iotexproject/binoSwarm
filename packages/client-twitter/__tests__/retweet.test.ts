import { describe, it, expect, vi, beforeEach } from "vitest";
import { elizaLogger } from "@elizaos/core";

import { ClientBase } from "../src/base";
import { TwitterConfig } from "../src/environment";
import { TwitterRetweetClient } from "../src/retweet";
import {
    buildRuntimeMock,
    buildConfigMock,
    buildTwitterClientMock,
    mockTwitterProfile,
    mockCharacter,
} from "./mocks";

describe("TwitterRetweetClient", () => {
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

        // Mock Twitter client retweet method
        mockTwitterClient.retweet = vi.fn().mockResolvedValue(undefined);

        // Spy on logger
        vi.spyOn(elizaLogger, "log").mockImplementation(() => {});
        vi.spyOn(elizaLogger, "error").mockImplementation(() => {});
    });

    it("should retweet a tweet successfully", async () => {
        await TwitterRetweetClient.process(baseClient, tweetId);

        // Verify retweet was called with correct tweetId
        expect(mockTwitterClient.retweet).toHaveBeenCalledWith(tweetId);

        // Verify success was logged
        expect(elizaLogger.log).toHaveBeenCalledWith(
            `Retweeted tweet ${tweetId}`
        );
        expect(elizaLogger.error).not.toHaveBeenCalled();
    });

    it("should handle errors when retweeting a tweet fails", async () => {
        const testError = new Error("API Error");
        mockTwitterClient.retweet.mockRejectedValueOnce(testError);

        await TwitterRetweetClient.process(baseClient, tweetId);

        // Verify retweet was called with correct tweetId
        expect(mockTwitterClient.retweet).toHaveBeenCalledWith(tweetId);

        // Verify error was logged
        expect(elizaLogger.error).toHaveBeenCalledWith(
            `Error retweeting tweet ${tweetId}:`,
            testError
        );
        expect(elizaLogger.log).not.toHaveBeenCalled();
    });
});
