import { IAgentRuntime, elizaLogger } from "@elizaos/core";
import { Scraper } from "agent-twitter-client";

import { TwitterConfig } from "./environment.ts";

export class TwitterAuthManager {
    private runtime: IAgentRuntime;
    private config: TwitterConfig;
    private scraper: Scraper;

    constructor(
        runtime: IAgentRuntime,
        config: TwitterConfig,
        scraper: Scraper
    ) {
        this.runtime = runtime;
        this.config = config;
        this.scraper = scraper;
    }

    async authenticate(): Promise<void> {
        const username = this.config.TWITTER_USERNAME;
        const password = this.config.TWITTER_PASSWORD;
        const email = this.config.TWITTER_EMAIL;
        let retries = this.config.TWITTER_RETRY_LIMIT;
        const twitter2faSecret = this.config.TWITTER_2FA_SECRET;

        if (!username) {
            throw new Error("Twitter username not configured");
        }

        const cachedCookies = await this.getCachedCookies(username);

        if (cachedCookies) {
            elizaLogger.info("Using cached cookies");
            await this.setCookiesFromArray(cachedCookies);
        }

        elizaLogger.log("Waiting for Twitter login");
        while (retries > 0) {
            try {
                if (await this.scraper.isLoggedIn()) {
                    // cookies are valid, no login required
                    elizaLogger.info("Successfully logged in.");
                    break;
                } else {
                    await this.scraper.login(
                        username,
                        password,
                        email,
                        twitter2faSecret
                    );
                    if (await this.scraper.isLoggedIn()) {
                        // fresh login, store new cookies
                        elizaLogger.info("Successfully logged in.");
                        elizaLogger.info("Caching cookies");
                        await this.cacheCookies(
                            username,
                            await this.scraper.getCookies()
                        );
                        break;
                    }
                }
            } catch (error) {
                elizaLogger.error(`Login attempt failed: ${error.message}`);
            }

            retries--;
            elizaLogger.error(
                `Failed to login to Twitter. Retrying... (${retries} attempts left)`
            );

            if (retries === 0) {
                elizaLogger.error(
                    "Max retries reached. Exiting login process."
                );
                throw new Error("Twitter login failed after maximum retries.");
            }

            await new Promise((resolve) => setTimeout(resolve, 10000));
        }
    }

    private async setCookiesFromArray(cookiesArray: any[]): Promise<void> {
        const cookieStrings = cookiesArray.map(
            (cookie) =>
                `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; ${
                    cookie.secure ? "Secure" : ""
                }; ${cookie.httpOnly ? "HttpOnly" : ""}; SameSite=${
                    cookie.sameSite || "Lax"
                }`
        );
        await this.scraper.setCookies(cookieStrings);
    }

    private async getCachedCookies(username: string): Promise<any[]> {
        return await this.runtime.cacheManager.get<any[]>(
            `twitter/${username}/cookies`
        );
    }

    private async cacheCookies(
        username: string,
        cookies: any[]
    ): Promise<void> {
        await this.runtime.cacheManager.set(
            `twitter/${username}/cookies`,
            cookies
        );
    }
}

export default TwitterAuthManager;
