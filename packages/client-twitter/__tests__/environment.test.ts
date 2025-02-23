import { describe, it, expect } from "vitest";
import { IAgentRuntime } from "@elizaos/core";

import {
    DEFAULT_MAX_TWEET_LENGTH,
    DEFAULT_POST_INTERVAL_MIN,
    DEFAULT_POST_INTERVAL_MAX,
    validateTwitterConfig,
} from "../src/environment";

describe("Twitter Environment Configuration", () => {
    const mockRuntime: IAgentRuntime = {
        env: {
            TWITTER_USERNAME: "testuser123",
            TWITTER_SEARCH_ENABLE: "false",
            TWITTER_SPACES_ENABLE: "false",
            TWITTER_TARGET_USERS: "user1,user2,user3",
            TWITTER_MAX_TWEETS_PER_DAY: "10",
            TWITTER_MAX_TWEET_LENGTH: "280",
            TWITTER_POST_INTERVAL_MIN: "90",
            TWITTER_POST_INTERVAL_MAX: "180",
            TWITTER_ACTION_INTERVAL: "5",
            TWITTER_ENABLE_ACTION_PROCESSING: "false",
            TWITTER_POST_IMMEDIATELY: "false",
            TWITTER_EMAIL: "test@example.com",
            TWITTER_PASSWORD: "hashedpassword",
            TWITTER_2FA_SECRET: "",
            TWITTER_POLL_INTERVAL: "120",
            TWITTER_RETRY_LIMIT: "5",
            ACTION_TIMELINE_TYPE: "foryou",
            MAX_ACTIONS_PROCESSING: "1",
            MAX_TWEET_LENGTH: "280",
        },
        getEnv: function (key: string) {
            return this.env[key] || null;
        },
        getSetting: function (key: string) {
            return this.env[key] || null;
        },
    } as unknown as IAgentRuntime;

    describe("Username Validation", () => {
        const createRuntimeWithUsername = (username: string): IAgentRuntime =>
            ({
                ...mockRuntime,
                env: {
                    ...mockRuntime.env,
                    TWITTER_USERNAME: username,
                },
                getEnv: function (key: string) {
                    return this.env[key] || null;
                },
                getSetting: function (key: string) {
                    return this.env[key] || null;
                },
            }) as IAgentRuntime;

        it("should allow valid traditional usernames", async () => {
            const usernames = ["normal_user", "user123", "a_1_b_2"];
            for (const username of usernames) {
                const runtime = createRuntimeWithUsername(username);
                const config = await validateTwitterConfig(runtime);
                expect(config.TWITTER_USERNAME).toBe(username);
            }
        });

        it("should allow usernames starting with digits", async () => {
            const usernames = ["123user", "42_test", "007james"];
            for (const username of usernames) {
                const runtime = createRuntimeWithUsername(username);
                const config = await validateTwitterConfig(runtime);
                expect(config.TWITTER_USERNAME).toBe(username);
            }
        });

        it("should validate wildcard username", async () => {
            const wildcardRuntime = {
                ...mockRuntime,
                env: {
                    ...mockRuntime.env,
                    TWITTER_USERNAME: "*",
                },
                getEnv: function (key: string) {
                    return this.env[key] || null;
                },
                getSetting: function (key: string) {
                    return this.env[key] || null;
                },
            } as IAgentRuntime;

            const config = await validateTwitterConfig(wildcardRuntime);
            expect(config.TWITTER_USERNAME).toBe("*");
        });

        it("should validate username with numbers and underscores", async () => {
            const validRuntime = {
                ...mockRuntime,
                env: {
                    ...mockRuntime.env,
                    TWITTER_USERNAME: "test_user_123",
                },
                getEnv: function (key: string) {
                    return this.env[key] || null;
                },
                getSetting: function (key: string) {
                    return this.env[key] || null;
                },
            } as IAgentRuntime;

            const config = await validateTwitterConfig(validRuntime);
            expect(config.TWITTER_USERNAME).toBe("test_user_123");
        });

        it("should handle empty target users", async () => {
            const runtimeWithoutTargets = {
                ...mockRuntime,
                env: {
                    ...mockRuntime.env,
                    TWITTER_TARGET_USERS: "",
                },
                getEnv: function (key: string) {
                    return this.env[key] || null;
                },
                getSetting: function (key: string) {
                    return this.env[key] || null;
                },
            } as IAgentRuntime;

            const config = await validateTwitterConfig(runtimeWithoutTargets);
            expect(config.TWITTER_TARGET_USERS).toHaveLength(0);
        });

        it("should reject invalid usernames", async () => {
            const invalidUsernames = [
                "",
                "user@123",
                "user-123",
                "user.123",
                "a".repeat(16),
            ];
            for (const username of invalidUsernames) {
                const runtime = createRuntimeWithUsername(username);
                await expect(validateTwitterConfig(runtime)).rejects.toThrow();
            }
        });
    });

    it("should validate correct configuration", async () => {
        const config = await validateTwitterConfig(mockRuntime);
        expect(config).toBeDefined();
        expect(config.TWITTER_USERNAME).toBe("testuser123");
        expect(config.TWITTER_SEARCH_ENABLE).toBe(false);
        expect(config.TWITTER_SPACES_ENABLE).toBe(false);
        expect(config.TWITTER_TARGET_USERS).toEqual([
            "user1",
            "user2",
            "user3",
        ]);
        expect(config.MAX_TWEET_LENGTH).toBe(280);
        expect(config.POST_INTERVAL_MIN).toBe(90);
        expect(config.POST_INTERVAL_MAX).toBe(180);
        expect(config.ACTION_INTERVAL).toBe(5);
        expect(config.ENABLE_ACTION_PROCESSING).toBe(false);
        expect(config.POST_IMMEDIATELY).toBe(false);
    });

    it("should use default values when optional configs are missing", async () => {
        const minimalRuntime = {
            env: {
                TWITTER_USERNAME: "testuser",
                TWITTER_EMAIL: "test@example.com",
                TWITTER_PASSWORD: "hashedpassword",
                TWITTER_2FA_SECRET: "",
                MAX_TWEET_LENGTH: "280",
            },
            getEnv: function (key: string) {
                return this.env[key] || null;
            },
            getSetting: function (key: string) {
                return this.env[key] || null;
            },
        } as unknown as IAgentRuntime;

        process.env.ACTION_TIMELINE_TYPE = "foryou";

        const config = await validateTwitterConfig(minimalRuntime);
        expect(config).toBeDefined();
        expect(config.MAX_TWEET_LENGTH).toBe(DEFAULT_MAX_TWEET_LENGTH);
        expect(config.POST_INTERVAL_MIN).toBe(DEFAULT_POST_INTERVAL_MIN);
        expect(config.POST_INTERVAL_MAX).toBe(DEFAULT_POST_INTERVAL_MAX);
    });

    it("should pass through non-ZodErrors unchanged", async () => {
        const runtimeWithError = {
            ...mockRuntime,
            getSetting: function () {
                throw new TypeError("Unexpected error");
            },
        } as IAgentRuntime;

        await expect(validateTwitterConfig(runtimeWithError)).rejects.toThrow(
            TypeError
        );
        await expect(validateTwitterConfig(runtimeWithError)).rejects.toThrow(
            "Unexpected error"
        );
    });

    it("should handle non-numeric values by returning default value", async () => {
        const runtimeWithNaN = {
            ...mockRuntime,
            env: {
                ...mockRuntime.env,
                MAX_TWEET_LENGTH: "not-a-number",
            },
            getEnv: function (key: string) {
                return this.env[key] || null;
            },
            getSetting: function (key: string) {
                return this.env[key] || null;
            },
        } as IAgentRuntime;

        const config = await validateTwitterConfig(runtimeWithNaN);
        expect(config.MAX_TWEET_LENGTH).toBe(DEFAULT_MAX_TWEET_LENGTH); // Default value
    });

    it("should handle negative values by returning default value", async () => {
        const runtimeWithNaN = {
            ...mockRuntime,
            env: {
                ...mockRuntime.env,
                MAX_TWEET_LENGTH: "-1",
            },
            getEnv: function (key: string) {
                return this.env[key] || null;
            },
            getSetting: function (key: string) {
                return this.env[key] || null;
            },
        } as IAgentRuntime;

        const config = await validateTwitterConfig(runtimeWithNaN);
        expect(config.MAX_TWEET_LENGTH).toBe(DEFAULT_MAX_TWEET_LENGTH); // Default value
    });
});
