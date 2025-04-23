import { SearchMode, Tweet } from "agent-twitter-client";
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
        const slicedTweets = this.sliceTweets(recentTweets.tweets, 20);
        this.validateTweetsLength(slicedTweets, searchTerm);

        const tweetId = await this.chooseMostInterestingTweet(
            searchTerm,
            slicedTweets
        );
        const selectedTweet = this.selectTweetToReply(slicedTweets, tweetId);
        this.validateNotSelf(selectedTweet);
        return { selectedTweet };
    }

    private validateNotSelf(selectedTweet: Tweet) {
        if (selectedTweet.username === this.twitterUsername) {
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
        };

        const prompt = composeContext({
            // @ts-expect-error: current state enough for the template
            state,
            template: twitterChooseSearchTweetTemplate,
        });

        return prompt;
    }

    private formatTweets(slicedTweets: Tweet[]) {
        return slicedTweets
            .filter((tweet) => {
                // ignore tweets where any of the thread tweets contain a tweet by the bot
                const thread = tweet.thread;
                const botTweet = thread.find(
                    (t) => t.username === this.twitterUsername
                );
                return !botTweet;
            })
            .map(
                (tweet) => `
      ID: ${tweet.id}${tweet.inReplyToStatusId ? ` In reply to: ${tweet.inReplyToStatusId}` : ""}
      From: ${tweet.name} (@${tweet.username})
      Text: ${tweet.text}
    `
            )
            .join("\n");
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

    private sliceTweets(recentTweets: Tweet[], numberOfTweets: number) {
        // randomly slice .tweets down to 20
        return recentTweets
            .sort(() => Math.random() - 0.5)
            .slice(0, numberOfTweets);
    }

    private async getRecentTweets(searchTerm: string) {
        elizaLogger.log("Fetching search tweets");
        const recentTweets = await this.client.fetchSearchTweets(
            searchTerm,
            20,
            SearchMode.Latest
        );
        elizaLogger.log("Search tweets fetched");
        return recentTweets;
    }

    private getSearchTerm() {
        return [...this.runtime.character.topics][
            Math.floor(Math.random() * this.runtime.character.topics.length)
        ];
    }
}
