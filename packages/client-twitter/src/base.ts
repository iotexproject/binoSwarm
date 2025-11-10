import {
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    ActionTimelineType,
} from "@elizaos/core";
import { QueryTweetsResponse, Scraper, Tweet } from "agent-twitter-client";
import { EventEmitter } from "events";

import { TwitterConfig } from "./environment.ts";
import { TwitterAuthManager } from "./TwitterAuthManager.ts";
import { RequestQueue } from "./RequestQueue.ts";
import { TwitterApiV2Client } from "./TwitterApiV2Client.ts";
import {
    formatRateLimitInfo,
    getErrorCode,
    hasInvalidSinceId,
} from "./twitterApiErrors.ts";

type TwitterProfile = {
    id: string;
    username: string;
    screenName: string;
    bio: string;
    nicknames: string[];
};

export class ClientBase extends EventEmitter {
    static _twitterClients: { [accountIdentifier: string]: Scraper } = {};
    twitterClient: Scraper;
    twitterApiV2Client: TwitterApiV2Client;
    runtime: IAgentRuntime;
    twitterConfig: TwitterConfig;
    directions: string;
    lastCheckedTweetId: bigint | null = null;
    requestQueue: RequestQueue = new RequestQueue();
    profile: TwitterProfile | null;

    private authManager: TwitterAuthManager;

    constructor(runtime: IAgentRuntime, twitterConfig: TwitterConfig) {
        super();
        this.runtime = runtime;
        this.twitterConfig = twitterConfig;
        const username = twitterConfig.TWITTER_USERNAME;
        if (ClientBase._twitterClients[username]) {
            this.twitterClient = ClientBase._twitterClients[username];
        } else {
            this.twitterClient = new Scraper();
            ClientBase._twitterClients[username] = this.twitterClient;
        }

        this.authManager = new TwitterAuthManager(
            runtime,
            twitterConfig,
            this.twitterClient
        );

        // Initialize Twitter API v2 client
        this.twitterApiV2Client = new TwitterApiV2Client(twitterConfig);

        this.directions =
            "- " +
            this.runtime.character.style.all.join("\n- ") +
            "- " +
            this.runtime.character.style.post.join();
    }

    async cacheTweet(tweet: Tweet): Promise<void> {
        if (!tweet) {
            elizaLogger.warn("Tweet is undefined, skipping cache");
            return;
        }

        this.runtime.cacheManager.set(`twitter/tweets/${tweet.id}`, tweet);
    }

    async getTweet(tweetId: string): Promise<Tweet> {
        const cachedTweet = await this.getCachedTweet(tweetId);

        if (cachedTweet) {
            return cachedTweet;
        }

        elizaLogger.debug(`Fetching tweet ${tweetId} using Twitter API v2`);

        // Use request queue with rate limit awareness for API v2
        const tweet = await this.requestQueue.add(async () => {
            try {
                return await this.twitterApiV2Client.getTweet(tweetId);
            } catch (error: unknown) {
                const code = getErrorCode(error);
                if (code === 429) {
                    const rateLimitInfo = formatRateLimitInfo(error);
                    elizaLogger.warn(
                        `Rate limit hit for tweet fetch${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                    );
                    throw new Error(`Rate limit exceeded for tweet ${tweetId}`);
                }
                throw error;
            }
        });

        if (!tweet) {
            throw new Error(`Tweet ${tweetId} not found`);
        }

        await this.cacheTweet(tweet);
        return tweet;
    }

    private async getCachedTweet(tweetId: string): Promise<Tweet | undefined> {
        const cached = await this.runtime.cacheManager.get<Tweet>(
            `twitter/tweets/${tweetId}`
        );

        return cached;
    }

    async init() {
        const username = this.twitterConfig.TWITTER_USERNAME;

        if (!username) {
            throw new Error("Twitter username not configured");
        }

        await this.authManager.authenticate();

        // Initialize Twitter profile
        this.profile = await this.fetchProfile(username);

        if (this.profile) {
            elizaLogger.log("Twitter user ID:", this.profile.id);
            elizaLogger.log(
                "Twitter loaded:",
                JSON.stringify(this.profile, null, 10)
            );
            // Store profile info for use in responses
            this.runtime.character.twitterProfile = {
                id: this.profile.id,
                username: this.profile.username,
                screenName: this.profile.screenName,
                bio: this.profile.bio,
                nicknames: this.profile.nicknames,
            };
        } else {
            throw new Error("Failed to load profile");
        }

        await this.loadLatestCheckedTweetId();
    }

    /**
     * Fetch timeline for twitter account, optionally only from followed accounts
     */
    async fetchHomeTimeline(
        count: number,
        following?: boolean
    ): Promise<Tweet[]> {
        if (!this.twitterApiV2Client.hasUserContext()) {
            elizaLogger.warn(
                "Twitter API v2 user context unavailable; returning empty timeline"
            );
            return [];
        }

        try {
            elizaLogger.debug(
                `Fetching ${following ? "following" : "home"} timeline using Twitter API v2`
            );

            const timeline = await this.requestQueue.add(async () => {
                try {
                    return following
                        ? await this.twitterApiV2Client.fetchFollowingTimeline(
                              count
                          )
                        : await this.twitterApiV2Client.fetchHomeTimeline(
                              count
                          );
                } catch (error: unknown) {
                    if (getErrorCode(error) === 429) {
                        const rateLimitInfo = formatRateLimitInfo(error);
                        elizaLogger.warn(
                            `Rate limit hit for timeline fetch${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                        );
                    }
                    throw error;
                }
            });

            return timeline;
        } catch (error) {
            elizaLogger.error(
                "Error fetching home timeline using Twitter API v2:",
                error
            );
            return [];
        }
    }

    async fetchTimelineForActions(count: number): Promise<Tweet[]> {
        const agentUsername = this.twitterConfig.TWITTER_USERNAME;

        if (!this.twitterApiV2Client.hasUserContext()) {
            elizaLogger.warn(
                "Twitter API v2 user context unavailable; returning empty action timeline"
            );
            return [];
        }

        try {
            elizaLogger.debug(
                "fetching timeline for actions using Twitter API v2"
            );

            const isFollowing =
                this.twitterConfig.ACTION_TIMELINE_TYPE ===
                ActionTimelineType.Following;

            const timeline = await this.requestQueue.add(async () => {
                try {
                    return isFollowing
                        ? await this.twitterApiV2Client.fetchFollowingTimeline(
                              count
                          )
                        : await this.twitterApiV2Client.fetchHomeTimeline(
                              count
                          );
                } catch (error: unknown) {
                    if (getErrorCode(error) === 429) {
                        const rateLimitInfo = formatRateLimitInfo(error);
                        elizaLogger.warn(
                            `Rate limit hit for action timeline fetch${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                        );
                    }
                    throw error;
                }
            });

            return (timeline as Tweet[])
                .filter((tweet) => tweet.username !== agentUsername)
                .slice(0, count);
        } catch (error) {
            elizaLogger.error(
                "Error fetching timeline for actions using Twitter API v2:",
                error
            );
            return [];
        }
    }

    async fetchSearchTweets(
        query: string,
        maxTweets: number,
        cursor?: string,
        sinceId?: string
    ): Promise<QueryTweetsResponse> {
        const requestStartTime = Date.now();
        const allTweets: Tweet[] = [];
        let nextToken = cursor;
        let totalFetched = 0;

        try {
            // Use since_id if available, otherwise use start_time (7 days ago)
            // Twitter API v2 doesn't allow both parameters together
            const startTime = sinceId ? undefined : this.calculateStartTime();

            elizaLogger.debug(
                `Searching tweets for query "${query}" using Twitter API v2 with pagination${startTime ? ` with start_time: ${startTime}` : ""}${sinceId ? ` with since_id: ${sinceId}` : ""}`
            );

            // Continue fetching while we have more pages and haven't reached maxTweets
            while (totalFetched < maxTweets) {
                const remainingTweets = maxTweets - totalFetched;
                const batchSize = Math.min(remainingTweets, 100); // API max is 100 per request

                elizaLogger.debug(
                    `Fetching batch: ${totalFetched + 1}-${totalFetched + batchSize} of ${maxTweets} tweets${nextToken ? ` (page ${Math.floor(totalFetched / 100) + 1})` : ""}`
                );

                // Use request queue with rate limit awareness for API v2
                const searchResult = await this.requestQueue.add(async () => {
                    try {
                        return await this.twitterApiV2Client.searchTweets(
                            query,
                            batchSize,
                            nextToken,
                            sinceId,
                            startTime
                        );
                    } catch (error: unknown) {
                        const code = getErrorCode(error);
                        if (code === 429) {
                            const rateLimitInfo = formatRateLimitInfo(error);
                            elizaLogger.warn(
                                `Rate limit hit for search tweets${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                            );
                            // Return empty result instead of throwing
                            return { tweets: [], nextToken: undefined };
                        }

                        // Handle invalid since_id error - retry with start_time
                        if (
                            code === 400 &&
                            hasInvalidSinceId(error) &&
                            sinceId
                        ) {
                            elizaLogger.warn(
                                `Invalid since_id ${sinceId}, retrying with start_time and clearing cached IDs`
                            );

                            // Clear the invalid cached since_id to prevent future errors
                            this.lastCheckedTweetId = null;
                            await this.runtime.cacheManager.delete(
                                `twitter/${this.profile.username}/latest_checked_tweet_id`
                            );
                            await this.runtime.cacheManager.delete(
                                `twitter/${this.profile.username}/latest_knowledge_checked_tweet_id`
                            );

                            // Retry with start_time (no since_id)
                            const fallbackStartTime = this.calculateStartTime();
                            return await this.twitterApiV2Client.searchTweets(
                                query,
                                batchSize,
                                nextToken,
                                undefined,
                                fallbackStartTime
                            );
                        }

                        throw error;
                    }
                });

                // Add tweets from this batch, but respect maxTweets limit
                const tweetsToAdd = searchResult.tweets.slice(
                    0,
                    maxTweets - totalFetched
                );
                allTweets.push(...tweetsToAdd);
                totalFetched += tweetsToAdd.length;
                nextToken = searchResult.nextToken;

                elizaLogger.debug(
                    `Batch completed: fetched ${searchResult.tweets.length} tweets, total: ${totalFetched}/${maxTweets}${nextToken ? ", more pages available" : ", no more pages"}`
                );

                // Break if no more pages or no tweets in this batch
                if (!nextToken || searchResult.tweets.length === 0) {
                    elizaLogger.debug(
                        "No more pages available or empty batch, stopping pagination"
                    );
                    break;
                }
            }

            const requestDuration = Date.now() - requestStartTime;
            elizaLogger.log(
                "Twitter API v2 paginated search for query",
                query,
                "returned total tweets:",
                allTweets.length,
                `(completed in ${requestDuration}ms across ${Math.ceil(totalFetched / 100)} API calls)`
            );

            return {
                tweets: allTweets,
                next: nextToken, // Include pagination token for potential future requests
            } as QueryTweetsResponse;
        } catch (error) {
            const requestDuration = Date.now() - requestStartTime;
            elizaLogger.error(
                `Error fetching search tweets after ${requestDuration}ms:`,
                error
            );
            return { tweets: allTweets }; // Return partial results if any were fetched
        }
    }

    async saveRequestMessage(message: Memory, state: State) {
        if (message.content.text) {
            const recentMessage = await this.runtime.messageManager.getMemories(
                {
                    roomId: message.roomId,
                    count: 1,
                    unique: false,
                }
            );

            if (
                recentMessage.length > 0 &&
                recentMessage[0].content === message.content
            ) {
                elizaLogger.debug("Message already saved", recentMessage[0].id);
            } else {
                await this.runtime.messageManager.createMemory({
                    memory: {
                        ...message,
                    },
                    isUnique: true,
                });
            }

            await this.runtime.evaluate(message, state);
        }
    }

    async loadLatestCheckedTweetId(): Promise<void> {
        const latestCheckedTweetId =
            await this.runtime.cacheManager.get<string>(
                `twitter/${this.profile.username}/latest_checked_tweet_id`
            );

        if (latestCheckedTweetId) {
            this.lastCheckedTweetId = BigInt(latestCheckedTweetId);
        }
    }

    async cacheLatestCheckedTweetId() {
        if (this.lastCheckedTweetId) {
            await this.runtime.cacheManager.set(
                `twitter/${this.profile.username}/latest_checked_tweet_id`,
                this.lastCheckedTweetId.toString()
            );
        }
    }

    async loadLatestKnowledgeCheckedTweetId(): Promise<bigint | null> {
        const latestKnowledgeCheckedTweetId =
            await this.runtime.cacheManager.get<string>(
                `twitter/${this.profile.username}/latest_knowledge_checked_tweet_id`
            );

        return latestKnowledgeCheckedTweetId
            ? BigInt(latestKnowledgeCheckedTweetId)
            : null;
    }

    async cacheLatestKnowledgeCheckedTweetId(tweetId: bigint) {
        await this.runtime.cacheManager.set(
            `twitter/${this.profile.username}/latest_knowledge_checked_tweet_id`,
            tweetId.toString()
        );
    }

    /**
     * Calculate start_time for Twitter API v2 search (7 days ago)
     * Returns ISO 8601 formatted timestamp: YYYY-MM-DDTHH:mm:ssZ
     */
    private calculateStartTime(): string {
        // Twitter API v2 search has a 7-day limitation
        // Add 10 minutes buffer to ensure we're well within the 7-day limit
        const sevenDaysAgoWithBuffer = new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000
        );

        // Return ISO 8601 formatted timestamp
        const timestamp = sevenDaysAgoWithBuffer.toISOString();

        elizaLogger.debug(
            `Calculated start_time: ${timestamp} (${sevenDaysAgoWithBuffer.toString()})`
        );

        return timestamp;
    }

    async getCachedTimeline(): Promise<Tweet[] | undefined> {
        return await this.runtime.cacheManager.get<Tweet[]>(
            `twitter/${this.profile.username}/timeline`
        );
    }

    async cacheTimeline(timeline: Tweet[]) {
        await this.runtime.cacheManager.set(
            `twitter/${this.profile.username}/timeline`,
            timeline,
            { expires: Date.now() + 10 * 1000 }
        );
    }

    async cacheMentions(mentions: Tweet[]) {
        await this.runtime.cacheManager.set(
            `twitter/${this.profile.username}/mentions`,
            mentions,
            { expires: Date.now() + 10 * 1000 }
        );
    }

    async fetchProfile(username: string): Promise<TwitterProfile> {
        try {
            elizaLogger.debug(
                `Fetching profile for ${username} using Twitter API v2`
            );

            // Use request queue with rate limit awareness for API v2
            const profile = await this.requestQueue.add(async () => {
                try {
                    return await this.twitterApiV2Client.getProfile(username);
                } catch (error: unknown) {
                    if (getErrorCode(error) === 429) {
                        const rateLimitInfo = formatRateLimitInfo(error);
                        elizaLogger.warn(
                            `Rate limit hit for profile fetch${rateLimitInfo ? ` (${rateLimitInfo})` : ""}`
                        );
                        throw new Error(
                            `Rate limit exceeded for profile fetch of ${username}`
                        );
                    }
                    throw error;
                }
            });

            return {
                id: profile.userId,
                username,
                screenName: profile.name || this.runtime.character.name,
                bio:
                    profile.biography ||
                    typeof this.runtime.character.bio === "string"
                        ? (this.runtime.character.bio as string)
                        : this.runtime.character.bio.length > 0
                          ? this.runtime.character.bio[0]
                          : "",
                nicknames:
                    this.runtime.character.twitterProfile?.nicknames || [],
            } satisfies TwitterProfile;
        } catch (error) {
            elizaLogger.error("Error fetching Twitter profile:", error);
            throw error;
        }
    }
}
