import {
    Content,
    IAgentRuntime,
    Memory,
    State,
    UUID,
    elizaLogger,
    stringToUuid,
    ActionTimelineType,
} from "@elizaos/core";
import { QueryTweetsResponse, Scraper, Tweet } from "agent-twitter-client";
import { EventEmitter } from "events";

import { TwitterConfig } from "./environment.ts";
import { TwitterAuthManager } from "./TwitterAuthManager.ts";
import { RequestQueue } from "./RequestQueue.ts";
import { TwitterApiV2Client } from "./TwitterApiV2Client.ts";

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
            } catch (error: any) {
                // Handle rate limiting gracefully
                if (error.code === 429) {
                    elizaLogger.warn(
                        `Rate limit hit for tweet fetch. Reset time: ${error.rateLimit?.reset || "unknown"}`
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
        await this.populateTimeline();
    }

    /**
     * Fetch timeline for twitter account, optionally only from followed accounts
     */
    async fetchHomeTimeline(
        count: number,
        following?: boolean
    ): Promise<Tweet[]> {
        try {
            elizaLogger.debug(
                `Fetching ${following ? "following" : "home"} timeline using Twitter API v2`
            );

            // Use request queue with rate limiting for API v2
            const timeline = await this.requestQueue.add(async () => {
                return following
                    ? await this.twitterApiV2Client.fetchFollowingTimeline(
                          count
                      )
                    : await this.twitterApiV2Client.fetchHomeTimeline(count);
            });

            // Return API v2 results directly (already processed)
            return timeline;
        } catch (error) {
            elizaLogger.error("Error fetching home timeline:", error);
            return [];
        }
    }

    async fetchTimelineForActions(count: number): Promise<Tweet[]> {
        try {
            elizaLogger.debug(
                "fetching timeline for actions using Twitter API v2"
            );

            const agentUsername = this.twitterConfig.TWITTER_USERNAME;
            const isFollowing =
                this.twitterConfig.ACTION_TIMELINE_TYPE ===
                ActionTimelineType.Following;

            // Use request queue with rate limiting for API v2
            const timeline = await this.requestQueue.add(async () => {
                return isFollowing
                    ? await this.twitterApiV2Client.fetchFollowingTimeline(
                          count
                      )
                    : await this.twitterApiV2Client.fetchHomeTimeline(count);
            });

            // Filter out agent's own tweets and return API v2 results
            return (timeline as Tweet[])
                .filter((tweet) => tweet.username !== agentUsername)
                .slice(0, count);
        } catch (error) {
            elizaLogger.error("Error fetching timeline for actions:", error);
            return [];
        }
    }

    async fetchSearchTweets(
        query: string,
        maxTweets: number,
        cursor?: string
    ): Promise<QueryTweetsResponse> {
        try {
            elizaLogger.debug(
                `Searching tweets for query "${query}" using Twitter API v2`
            );

            // Use request queue with rate limit awareness for API v2
            const searchResult = await this.requestQueue.add(async () => {
                try {
                    return await this.twitterApiV2Client.searchTweets(
                        query,
                        maxTweets,
                        cursor
                    );
                } catch (error: any) {
                    // Handle rate limiting gracefully
                    if (error.code === 429) {
                        elizaLogger.warn(
                            `Rate limit hit for search tweets. Reset time: ${error.rateLimit?.reset || "unknown"}`
                        );
                        // Return empty result instead of throwing
                        return { tweets: [] };
                    }
                    throw error;
                }
            });

            elizaLogger.log(
                "Twitter API v2 search for query",
                query,
                "returned number of tweets",
                searchResult.tweets.length
            );

            return {
                tweets: searchResult.tweets,
            } as QueryTweetsResponse;
        } catch (error) {
            elizaLogger.error("Error fetching search tweets:", error);
            return { tweets: [] };
        }
    }

    private async populateTimeline() {
        elizaLogger.debug("populating timeline...");

        const cachedTimeline = await this.getCachedTimeline();

        // Check if the cache file exists
        if (cachedTimeline) {
            // Read the cached search results from the file

            // Get the existing memories from the database
            const existingMemories =
                await this.runtime.messageManager.getMemoriesByRoomIds({
                    roomIds: cachedTimeline.map((tweet) =>
                        stringToUuid(
                            tweet.conversationId + "-" + this.runtime.agentId
                        )
                    ),
                });

            //TODO: load tweets not in cache?

            // Create a Set to store the IDs of existing memories
            const existingMemoryIds = new Set(
                existingMemories.map((memory) => memory.id.toString())
            );

            // Check if any of the cached tweets exist in the existing memories
            const someCachedTweetsExist = cachedTimeline.some((tweet) =>
                existingMemoryIds.has(
                    stringToUuid(tweet.id + "-" + this.runtime.agentId)
                )
            );

            if (someCachedTweetsExist) {
                // Filter out the cached tweets that already exist in the database
                const tweetsToSave = cachedTimeline.filter(
                    (tweet) =>
                        !existingMemoryIds.has(
                            stringToUuid(tweet.id + "-" + this.runtime.agentId)
                        )
                );

                elizaLogger.log({
                    processingTweets: tweetsToSave
                        .map((tweet) => tweet.id)
                        .join(","),
                });

                // Save the missing tweets as memories
                for (const tweet of tweetsToSave) {
                    elizaLogger.log("Saving Tweet", tweet.id);

                    const roomId = stringToUuid(
                        tweet.conversationId + "-" + this.runtime.agentId
                    );

                    const userId =
                        tweet.userId === this.profile.id
                            ? this.runtime.agentId
                            : stringToUuid(tweet.userId);

                    if (tweet.userId === this.profile.id) {
                        await this.runtime.ensureConnection(
                            this.runtime.agentId,
                            roomId,
                            this.profile.username,
                            this.profile.screenName,
                            "twitter"
                        );
                    } else {
                        await this.runtime.ensureConnection(
                            userId,
                            roomId,
                            tweet.username,
                            tweet.name,
                            "twitter"
                        );
                    }

                    const content = {
                        text: tweet.text,
                        url: tweet.permanentUrl,
                        source: "twitter",
                        inReplyTo: tweet.inReplyToStatusId
                            ? stringToUuid(
                                  tweet.inReplyToStatusId +
                                      "-" +
                                      this.runtime.agentId
                              )
                            : undefined,
                    } as Content;

                    elizaLogger.log("Creating memory for tweet", tweet.id);

                    // check if it already exists
                    const memory =
                        await this.runtime.messageManager.getMemoryById(
                            stringToUuid(tweet.id + "-" + this.runtime.agentId)
                        );

                    if (memory) {
                        elizaLogger.log(
                            "Memory already exists, skipping timeline population"
                        );
                        break;
                    }

                    await this.runtime.messageManager.createMemory({
                        memory: {
                            id: stringToUuid(
                                tweet.id + "-" + this.runtime.agentId
                            ),
                            userId,
                            content: content,
                            agentId: this.runtime.agentId,
                            roomId,
                            createdAt: tweet.timestamp * 1000,
                        },
                        isUnique: true,
                    });

                    await this.cacheTweet(tweet);
                }

                elizaLogger.log(
                    `Populated ${tweetsToSave.length} missing tweets from the cache.`
                );
                return;
            }
        }

        const timeline = await this.fetchHomeTimeline(cachedTimeline ? 10 : 50);
        const username = this.twitterConfig.TWITTER_USERNAME;

        // Get the most recent 20 mentions and interactions
        const mentionsAndInteractions = await this.fetchSearchTweets(
            `@${username}`,
            20
        );

        // Combine the timeline tweets and mentions/interactions
        const allTweets = [...timeline, ...mentionsAndInteractions.tweets];

        // Create a Set to store unique tweet IDs
        const tweetIdsToCheck = new Set<string>();
        const roomIds = new Set<UUID>();

        // Add tweet IDs to the Set
        for (const tweet of allTweets) {
            tweetIdsToCheck.add(tweet.id);
            roomIds.add(
                stringToUuid(tweet.conversationId + "-" + this.runtime.agentId)
            );
        }

        // Check the existing memories in the database
        const existingMemories =
            await this.runtime.messageManager.getMemoriesByRoomIds({
                roomIds: Array.from(roomIds),
            });

        // Create a Set to store the existing memory IDs
        const existingMemoryIds = new Set<UUID>(
            existingMemories.map((memory) => memory.id)
        );

        // Filter out the tweets that already exist in the database
        const tweetsToSave = allTweets.filter(
            (tweet) =>
                !existingMemoryIds.has(
                    stringToUuid(tweet.id + "-" + this.runtime.agentId)
                )
        );

        elizaLogger.debug({
            processingTweets: tweetsToSave.map((tweet) => tweet.id).join(","),
        });

        await this.runtime.ensureUserExists(
            this.runtime.agentId,
            this.profile.username,
            this.runtime.character.name,
            "twitter"
        );

        // Save the new tweets as memories
        for (const tweet of tweetsToSave) {
            elizaLogger.log("Saving Tweet", tweet.id);

            const roomId = stringToUuid(
                tweet.conversationId + "-" + this.runtime.agentId
            );
            const userId =
                tweet.userId === this.profile.id
                    ? this.runtime.agentId
                    : stringToUuid(tweet.userId);

            if (tweet.userId === this.profile.id) {
                await this.runtime.ensureConnection(
                    this.runtime.agentId,
                    roomId,
                    this.profile.username,
                    this.profile.screenName,
                    "twitter"
                );
            } else {
                await this.runtime.ensureConnection(
                    userId,
                    roomId,
                    tweet.username,
                    tweet.name,
                    "twitter"
                );
            }

            const content = {
                text: tweet.text,
                url: tweet.permanentUrl,
                source: "twitter",
                inReplyTo: tweet.inReplyToStatusId
                    ? stringToUuid(tweet.inReplyToStatusId)
                    : undefined,
            } as Content;

            await this.runtime.messageManager.createMemory({
                memory: {
                    id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
                    userId,
                    content: content,
                    agentId: this.runtime.agentId,
                    roomId,
                    createdAt: tweet.timestamp * 1000,
                },
                isUnique: true,
            });

            await this.cacheTweet(tweet);
        }

        // Cache
        await this.cacheTimeline(timeline);
        await this.cacheMentions(mentionsAndInteractions.tweets);
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

            await this.runtime.evaluate(message, {
                ...state,
                twitterClient: this.twitterClient,
            });
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
                } catch (error: any) {
                    // Handle rate limiting gracefully
                    if (error.code === 429) {
                        elizaLogger.warn(
                            `Rate limit hit for profile fetch. Reset time: ${error.rateLimit?.reset || "unknown"}`
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
