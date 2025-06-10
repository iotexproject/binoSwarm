import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { IAgentRuntime } from "@elizaos/core";
import { Scraper } from "agent-twitter-client";
import TwitterAuthManager from "../src/TwitterAuthManager";
import { TwitterConfig } from "../src/environment";

describe("TwitterAuthManager", () => {
    let authManager: TwitterAuthManager;
    let mockRuntime: IAgentRuntime;
    let mockConfig: TwitterConfig;
    let mockScraper: Scraper;

    beforeEach(() => {
        vi.useFakeTimers();

        mockRuntime = {
            cacheManager: {
                get: vi.fn(),
                set: vi.fn(),
            },
        } as unknown as IAgentRuntime;

        mockConfig = {
            TWITTER_USERNAME: "testuser",
            TWITTER_PASSWORD: "testpass",
            TWITTER_EMAIL: "test@example.com",
            TWITTER_RETRY_LIMIT: 3,
            TWITTER_2FA_SECRET: "",
        } as TwitterConfig;

        mockScraper = {
            isLoggedIn: vi.fn(),
            login: vi.fn(),
            getCookies: vi.fn(),
            setCookies: vi.fn(),
        } as unknown as Scraper;

        authManager = new TwitterAuthManager(
            mockRuntime,
            mockConfig,
            mockScraper
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    describe("authenticate", () => {
        it("should throw error when username is not configured", async () => {
            mockConfig.TWITTER_USERNAME = "";

            await expect(authManager.authenticate()).rejects.toThrow(
                "Twitter username not configured"
            );
        });

        it("should use cached cookies when available and user is logged in", async () => {
            const mockCachedCookies = [
                {
                    key: "session",
                    value: "abc123",
                    domain: ".twitter.com",
                    path: "/",
                    secure: true,
                    httpOnly: true,
                    sameSite: "Lax",
                },
            ];

            mockRuntime.cacheManager.get = vi
                .fn()
                .mockResolvedValue(mockCachedCookies);
            mockScraper.isLoggedIn = vi.fn().mockResolvedValue(true);
            mockScraper.setCookies = vi.fn().mockResolvedValue(undefined);

            await authManager.authenticate();

            expect(mockRuntime.cacheManager.get).toHaveBeenCalledWith(
                "twitter/testuser/cookies"
            );
            expect(mockScraper.setCookies).toHaveBeenCalledWith([
                "session=abc123; Domain=.twitter.com; Path=/; Secure; HttpOnly; SameSite=Lax",
            ]);
            expect(mockScraper.isLoggedIn).toHaveBeenCalled();
            expect(mockScraper.login).not.toHaveBeenCalled();
        });

        it("should perform fresh login when no cached cookies available", async () => {
            const mockFreshCookies = [
                {
                    key: "auth_token",
                    value: "xyz789",
                    domain: ".twitter.com",
                    path: "/",
                    secure: true,
                    httpOnly: false,
                },
            ];

            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(null);
            mockScraper.isLoggedIn = vi
                .fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);
            mockScraper.login = vi.fn().mockResolvedValue(undefined);
            mockScraper.getCookies = vi
                .fn()
                .mockResolvedValue(mockFreshCookies);
            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await authManager.authenticate();

            expect(mockScraper.login).toHaveBeenCalledWith(
                "testuser",
                "testpass",
                "test@example.com",
                ""
            );
            expect(mockScraper.getCookies).toHaveBeenCalled();
            expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
                "twitter/testuser/cookies",
                mockFreshCookies
            );
        });

        it("should perform fresh login when cached cookies are invalid", async () => {
            const mockCachedCookies = [{ key: "expired", value: "token" }];
            const mockFreshCookies = [{ key: "fresh", value: "token" }];

            mockRuntime.cacheManager.get = vi
                .fn()
                .mockResolvedValue(mockCachedCookies);
            mockScraper.setCookies = vi.fn().mockResolvedValue(undefined);
            mockScraper.isLoggedIn = vi
                .fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);
            mockScraper.login = vi.fn().mockResolvedValue(undefined);
            mockScraper.getCookies = vi
                .fn()
                .mockResolvedValue(mockFreshCookies);
            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await authManager.authenticate();

            expect(mockScraper.login).toHaveBeenCalled();
            expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
                "twitter/testuser/cookies",
                mockFreshCookies
            );
        });

        it("should handle cookies without optional properties correctly", async () => {
            const mockCookies = [
                {
                    key: "basic",
                    value: "xyz789",
                    domain: ".twitter.com",
                    path: "/",
                    secure: false,
                    httpOnly: false,
                },
            ];

            mockRuntime.cacheManager.get = vi
                .fn()
                .mockResolvedValue(mockCookies);
            mockScraper.isLoggedIn = vi.fn().mockResolvedValue(true);
            mockScraper.setCookies = vi.fn().mockResolvedValue(undefined);

            await authManager.authenticate();

            expect(mockScraper.setCookies).toHaveBeenCalledWith([
                "basic=xyz789; Domain=.twitter.com; Path=/; ; ; SameSite=Lax",
            ]);
        });

        it("should retry on login failure and eventually succeed", async () => {
            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(null);
            mockScraper.isLoggedIn = vi
                .fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);
            mockScraper.login = vi
                .fn()
                .mockRejectedValueOnce(new Error("Network error"))
                .mockResolvedValueOnce(undefined);
            mockScraper.getCookies = vi.fn().mockResolvedValue([]);
            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            // Start the authentication process
            const authPromise = authManager.authenticate();

            // Fast-forward the timer to simulate the 10-second delay
            await vi.advanceTimersByTimeAsync(10000);

            await authPromise;

            expect(mockScraper.login).toHaveBeenCalledTimes(2);
        });

        it("should throw error after maximum retry attempts", async () => {
            mockConfig.TWITTER_RETRY_LIMIT = 1;

            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(null);
            mockScraper.isLoggedIn = vi.fn().mockResolvedValue(false);
            mockScraper.login = vi
                .fn()
                .mockRejectedValue(new Error("Login failed"));

            await expect(authManager.authenticate()).rejects.toThrow(
                "Twitter login failed after maximum retries."
            );

            expect(mockScraper.login).toHaveBeenCalledTimes(1);
        });

        it("should handle login with 2FA secret", async () => {
            mockConfig.TWITTER_2FA_SECRET = "ABCD1234";

            mockRuntime.cacheManager.get = vi.fn().mockResolvedValue(null);
            mockScraper.isLoggedIn = vi
                .fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);
            mockScraper.login = vi.fn().mockResolvedValue(undefined);
            mockScraper.getCookies = vi.fn().mockResolvedValue([]);
            mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

            await authManager.authenticate();

            expect(mockScraper.login).toHaveBeenCalledWith(
                "testuser",
                "testpass",
                "test@example.com",
                "ABCD1234"
            );
        });
    });
});

// describe("cacheCookies", () => {
//     it("should cache cookies for username", async () => {
//         const client = new ClientBase(mockRuntime, mockConfig);
//         const mockCookies = [{ key: "session", value: "abc123" }];

//         mockRuntime.cacheManager.set = vi.fn().mockResolvedValue(undefined);

//         await client.cacheCookies("testuser", mockCookies);

//         expect(mockRuntime.cacheManager.set).toHaveBeenCalledWith(
//             "twitter/testuser/cookies",
//             mockCookies
//         );
//     });
// });

// describe("setCookiesFromArray", () => {
//     it("should format and set cookies on twitter client", async () => {
//         const client = new ClientBase(mockRuntime, mockConfig);
//         const mockCookies = [
//             {
//                 key: "session",
//                 value: "abc123",
//                 domain: ".twitter.com",
//                 path: "/",
//                 secure: true,
//                 httpOnly: true,
//                 sameSite: "Lax",
//             },
//         ];

//         const mockSetCookies = vi.fn().mockResolvedValue(undefined);
//         client.twitterClient.setCookies = mockSetCookies;

//         await client.setCookiesFromArray(mockCookies);

//         expect(mockSetCookies).toHaveBeenCalledWith([
//             "session=abc123; Domain=.twitter.com; Path=/; Secure; HttpOnly; SameSite=Lax",
//         ]);
//     });

//     it("should handle cookies without optional properties", async () => {
//         const client = new ClientBase(mockRuntime, mockConfig);
//         const mockCookies = [
//             {
//                 key: "basic",
//                 value: "xyz789",
//                 domain: ".twitter.com",
//                 path: "/",
//                 secure: false,
//                 httpOnly: false,
//             },
//         ];

//         const mockSetCookies = vi.fn().mockResolvedValue(undefined);
//         client.twitterClient.setCookies = mockSetCookies;

//         await client.setCookiesFromArray(mockCookies);

//         expect(mockSetCookies).toHaveBeenCalledWith([
//             "basic=xyz789; Domain=.twitter.com; Path=/; ; ; SameSite=Lax",
//         ]);
//     });
// });
