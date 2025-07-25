import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as elizaosCore from "@elizaos/core";
import { type IAgentRuntime } from "@elizaos/core";
import { TwitterClientInterface } from "../src/index";
import { TwitterActionProcessor } from "../src/actions";
import { ClientBase } from "../src/base";
import {
    type TwitterConfig,
    validateTwitterConfig,
    DEFAULT_MAX_TWEET_LENGTH,
    DEFAULT_TWITTER_RETRY_LIMIT,
    DEFAULT_TWITTER_POLL_INTERVAL,
    DEFAULT_POST_INTERVAL_MIN,
    DEFAULT_POST_INTERVAL_MAX,
    DEFAULT_ACTION_INTERVAL,
    DEFAULT_MAX_ACTIONS_PROCESSING,
} from "../src/environment";
import { TwitterInteractionClient } from "../src/interactions";
import { TwitterPostClient } from "../src/post";
import { TwitterSearchClient } from "../src/search";

// Mock dependencies
vi.mock("../src/environment", async (importOriginal) => ({
    ...(await importOriginal<any>()),
    validateTwitterConfig: vi.fn(),
}));
vi.mock("../src/base");
vi.mock("../src/post");
vi.mock("../src/search");
vi.mock("../src/interactions");
vi.mock("../src/actions");

describe("TwitterClientInterface", () => {
    let mockRuntime: IAgentRuntime;
    let mockTwitterConfig: TwitterConfig;

    const mockClientBase = {
        init: vi.fn(),
    };
    const mockPostClient = {
        start: vi.fn(),
    };
    const mockSearchClient = {
        start: vi.fn(),
    };
    const mockInteractionClient = {
        start: vi.fn(),
    };
    const mockActionProcessor = {};

    beforeEach(() => {
        vi.spyOn(elizaosCore.elizaLogger, "log").mockImplementation(() => {});
        vi.spyOn(elizaosCore.elizaLogger, "warn").mockImplementation(() => {});
        vi.spyOn(elizaosCore.elizaLogger, "error").mockImplementation(() => {});

        mockRuntime = {} as IAgentRuntime;
        mockTwitterConfig = {
            TWITTER_USERNAME: "testuser",
            TWITTER_PASSWORD: "password",
            TWITTER_EMAIL: "test@test.com",
            TWITTER_SEARCH_ENABLE: false,
            MAX_TWEET_LENGTH: DEFAULT_MAX_TWEET_LENGTH,
            TWITTER_2FA_SECRET: "secret",
            TWITTER_RETRY_LIMIT: DEFAULT_TWITTER_RETRY_LIMIT,
            TWITTER_POLL_INTERVAL: DEFAULT_TWITTER_POLL_INTERVAL,
            TWITTER_TARGET_USERS: [],
            TWITTER_KNOWLEDGE_USERS: [],
            TWITTER_SEARCH_TERMS: [],
            POST_INTERVAL_MIN: DEFAULT_POST_INTERVAL_MIN,
            POST_INTERVAL_MAX: DEFAULT_POST_INTERVAL_MAX,
            ENABLE_ACTION_PROCESSING: false,
            ACTION_INTERVAL: DEFAULT_ACTION_INTERVAL,
            POST_IMMEDIATELY: false,
            MAX_ACTIONS_PROCESSING: DEFAULT_MAX_ACTIONS_PROCESSING,
            ACTION_TIMELINE_TYPE: elizaosCore.ActionTimelineType.ForYou,
        };

        vi.mocked(validateTwitterConfig).mockResolvedValue(mockTwitterConfig);
        vi.mocked(ClientBase).mockReturnValue(mockClientBase as any);
        vi.mocked(TwitterPostClient).mockReturnValue(mockPostClient as any);
        vi.mocked(TwitterSearchClient).mockReturnValue(mockSearchClient as any);
        vi.mocked(TwitterInteractionClient).mockReturnValue(
            mockInteractionClient as any
        );
        vi.mocked(TwitterActionProcessor).mockReturnValue(
            mockActionProcessor as any
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("start", () => {
        it("should initialize and start components correctly when search is disabled", async () => {
            const manager = (await TwitterClientInterface.start(
                mockRuntime
            )) as any;

            expect(validateTwitterConfig).toHaveBeenCalledWith(mockRuntime);
            expect(elizaosCore.elizaLogger.log).toHaveBeenCalledWith(
                "Twitter client started"
            );

            expect(ClientBase).toHaveBeenCalledWith(
                mockRuntime,
                mockTwitterConfig
            );
            expect(TwitterPostClient).toHaveBeenCalledWith(
                mockClientBase,
                mockRuntime
            );
            expect(TwitterActionProcessor).toHaveBeenCalledWith(
                mockClientBase,
                mockRuntime
            );
            expect(TwitterInteractionClient).toHaveBeenCalledWith(
                mockClientBase,
                mockRuntime
            );
            expect(TwitterSearchClient).not.toHaveBeenCalled();

            expect(mockClientBase.init).toHaveBeenCalledTimes(1);
            expect(mockPostClient.start).toHaveBeenCalledTimes(1);
            expect(mockInteractionClient.start).toHaveBeenCalledTimes(1);
            expect(mockSearchClient.start).not.toHaveBeenCalled();

            expect(manager).toBeDefined();
            expect(manager.client).toBe(mockClientBase);
            expect(manager.post).toBe(mockPostClient);
            expect(manager.interaction).toBe(mockInteractionClient);
            expect(manager.actions).toBe(mockActionProcessor);
            expect(manager.search).toBeUndefined();
        });

        it("should initialize and start all components including search when enabled", async () => {
            mockTwitterConfig.TWITTER_SEARCH_ENABLE = true;
            vi.mocked(validateTwitterConfig).mockResolvedValue(
                mockTwitterConfig
            );

            const manager = (await TwitterClientInterface.start(
                mockRuntime
            )) as any;

            expect(validateTwitterConfig).toHaveBeenCalledWith(mockRuntime);
            expect(TwitterSearchClient).toHaveBeenCalledWith(
                mockClientBase,
                mockRuntime
            );
            expect(mockSearchClient.start).toHaveBeenCalledTimes(1);
            expect(manager.search).toBe(mockSearchClient);
        });
    });

    describe("stop", () => {
        it("should log a warning that stop is not implemented", async () => {
            await TwitterClientInterface.stop(mockRuntime);
            expect(elizaosCore.elizaLogger.log).toHaveBeenCalledWith(
                "Twitter client stop requested - cleanup handled by returned manager instance"
            );
        });
    });
});
