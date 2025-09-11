import { Tweet } from "agent-twitter-client";
import {
    composeContext,
    elizaLogger,
    generateObject,
    ModelClass,
    IAgentRuntime,
} from "@elizaos/core";
import { z } from "zod";

import { ClientBase } from "./base";
import { twitterChooseSearchTweetTemplate } from "./templates";

const TWEETS_TO_FETCH = parseInt(process.env.SEARCH_TWEETS_TO_FETCH ?? "20");

export class SearchTweetSelector {
    private twitterUsername: string;

    constructor(
        private runtime: IAgentRuntime,
        private client: ClientBase
    ) {
        this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
    }

    async selectTweet() {
        const searchTerm = this.getSearchTerm();
        const recentTweets = await this.getRecentTweets(searchTerm);
        this.validateTweetsLength(recentTweets, searchTerm);

        const tweetId = await this.chooseMostInterestingTweet(
            searchTerm,
            recentTweets
        );
        const selectedTweet = this.selectTweetToReply(recentTweets, tweetId);
        this.validateNotSelf(selectedTweet);

        return selectedTweet;
    }

    private validateNotSelf(selectedTweet: Tweet) {
        if (
            selectedTweet.username.toLowerCase() ===
            this.twitterUsername.toLowerCase()
        ) {
            elizaLogger.log("Skipping tweet from bot itself");
            throw new Error("Skipping tweet from bot itself");
        }
    }

    private selectTweetToReply(slicedTweets: Tweet[], tweetId: string) {
        const selectedTweet = slicedTweets.find(
            (tweet) =>
                tweet.id.toString().includes(tweetId) ||
                tweetId.includes(tweet.id.toString())
        );

        if (!selectedTweet) {
            elizaLogger.warn("No matching tweet found for the selected ID");
            elizaLogger.log("Selected tweet ID:", tweetId);
            throw new Error("No matching tweet found for the selected ID");
        }

        elizaLogger.log("Selected tweet to reply to:", selectedTweet?.text);
        return selectedTweet;
    }

    private async chooseMostInterestingTweet(
        searchTerm: string,
        slicedTweets: Tweet[]
    ) {
        const prompt = this.buildSearchPrompt(searchTerm, slicedTweets);

        const schema = z.object({
            tweetId: z.string().describe("The ID of the tweet to reply to"),
        });

        const mostInterestingTweetResponse = await generateObject<{
            tweetId: string;
        }>({
            runtime: this.runtime,
            context: prompt,
            customSystemPrompt:
                "You are a neutral processing agent. Wait for task-specific instructions in the user prompt.",
            modelClass: ModelClass.SMALL,
            schema,
            schemaName: "mostInterestingTweetResponse",
            schemaDescription:
                "The response from the user about which tweet is the most interesting and relevant for the agent to reply to",
            functionId: "twitter_chooseMostInterestingTweet",
            tags: ["twitter", "twitter-choose-most-interesting-tweet"],
        });

        elizaLogger.log("TWITTER_CHOOSE_SEARCH_TWEET_RES", {
            body: {
                prompt,
                mostInterestingTweetResponse,
            },
            type: "response",
        });

        if (!mostInterestingTweetResponse.object) {
            elizaLogger.warn("No tweet ID found in the response");
            throw new Error(
                "Choose most interesting tweet: No tweet ID found in the response"
            );
        }

        const tweetId = mostInterestingTweetResponse.object.tweetId;
        return tweetId;
    }

    private buildSearchPrompt(searchTerm: string, slicedTweets: Tweet[]) {
        const state = {
            twitterUserName: this.twitterUsername,
            searchTerm,
            formattedTweets: this.formatTweets(slicedTweets),
            bio: this.runtime.character.bio,
            topics: [...this.runtime.character.topics],
        };

        const prompt = composeContext({
            // @ts-expect-error: current state enough for the template
            state,
            template: twitterChooseSearchTweetTemplate,
        });

        return prompt;
    }

    private formatTweets(slicedTweets: Tweet[]) {
        const tweetsWithoutBot = this.filterOutBotTweets(slicedTweets);
        const eligibleTweets = this.filterOutTargetUsers(tweetsWithoutBot);

        const formattedTweets = eligibleTweets
            .map(
                (tweet) => `
      ID: ${tweet.id}${tweet.inReplyToStatusId ? ` In reply to: ${tweet.inReplyToStatusId}` : ""}
      From: ${tweet.name} (@${tweet.username})
      Text: ${tweet.text}
    `
            )
            .join("\n");

        return formattedTweets;
    }

    private filterOutTargetUsers(tweets: Tweet[]) {
        const targetUsers =
            this.client.twitterConfig.TWITTER_TARGET_USERS || [];

        if (targetUsers.length === 0) {
            return tweets;
        }

        return tweets.filter((tweet) => {
            return !targetUsers.includes(tweet.username);
        });
    }

    private filterOutBotTweets(slicedTweets: Tweet[]) {
        return slicedTweets.filter((tweet) => {
            // Skip if the tweet is from the bot itself
            if (
                tweet.username.toLowerCase() ===
                this.twitterUsername.toLowerCase()
            ) {
                return false;
            }

            // Also ignore tweets where any of the thread tweets contain a tweet by the bot
            const thread = tweet.thread;
            const botTweet = thread.find(
                (t) =>
                    t.username.toLowerCase() ===
                    this.twitterUsername.toLowerCase()
            );
            return !botTweet;
        });
    }

    private validateTweetsLength(slicedTweets: Tweet[], searchTerm: string) {
        if (slicedTweets.length === 0) {
            elizaLogger.log(
                "No valid tweets found for the search term",
                searchTerm
            );
            throw new Error("No valid tweets found for the search term");
        }
    }

    private async getRecentTweets(searchTerm: string) {
        elizaLogger.log("Fetching search tweets");

        const recentTweets = await this.client.requestQueue.add(() =>
            this.client.fetchSearchTweets(
                searchTerm,
                TWEETS_TO_FETCH
            )
        );

        elizaLogger.log("Search tweets fetched");
        return recentTweets.tweets;
    }

    private getSearchTerm() {
        // Use TWITTER_SEARCH_TERMS from environment if available
        const searchTerms = this.client.twitterConfig.TWITTER_SEARCH_TERMS;

        if (searchTerms && searchTerms.length > 0) {
            const searchTerm =
                searchTerms[Math.floor(Math.random() * searchTerms.length)];
            elizaLogger.log("Using configured search term:", searchTerm);
            return searchTerm;
        }

        // Fall back to character topics if no search terms configured
        const topics = [...this.runtime.character.topics];

        // Ensure we have topics to choose from
        if (topics && topics.length > 0) {
            const topicTerm = topics[Math.floor(Math.random() * topics.length)];
            elizaLogger.log("Using character topic as search term:", topicTerm);
            return topicTerm;
        }

        // Default fallback if no topics are available
        const defaultTerm = "technology";
        elizaLogger.log(
            "No topics available, using default search term:",
            defaultTerm
        );
        return defaultTerm;
    }
}
