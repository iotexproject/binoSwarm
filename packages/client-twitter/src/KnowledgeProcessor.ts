import { twitterKnowledgeProcessorTemplate } from "./templates";
import { Tweet } from "agent-twitter-client";
import {
    IAgentRuntime,
    ModelClass,
    stringToUuid,
    elizaLogger,
    IImageDescriptionService,
    ServiceType,
    generateObject,
    composeContext,
} from "@elizaos/core";
import { z } from "zod";
import { ClientBase } from "./base";

const RELEVANCE_THRESHOLD = 0.5;

const analysisSchema = z.object({
    tweetId: z.string().describe("The ID of the tweet"),
    summary: z.string().describe("A concise summary of the tweet"),
    relevanceScore: z
        .number()
        .describe("A score between 0 and 1, where 1 is highly informative"),
    knowledgePoints: z
        .preprocess((val) => {
            if (typeof val === "string") {
                return [val];
            }
            return val;
        }, z.array(z.string()))
        .nullable()
        .default([])
        .describe(
            "Specific facts or insights extracted from both text and media. If N/A, return an empty array."
        ),
    mediaInsights: z
        .preprocess((val) => {
            if (typeof val === "string") {
                return [val];
            }
            return val;
        }, z.array(z.string()))
        .nullable()
        .default([])
        .describe(
            "Insights extracted from media. If N/A, return an empty array."
        ),
    topics: z
        .preprocess((val) => {
            if (typeof val === "string") {
                return [val];
            }
            return val;
        }, z.array(z.string()))
        .nullable()
        .default([])
        .describe(
            "Topics or categories relevant to the tweet. If N/A, return an empty array."
        ),
});

const analysisArraySchema = z.object({
    analysis: z.array(analysisSchema),
});

type AnalysisArray = z.infer<typeof analysisArraySchema>;
type Analysis = z.infer<typeof analysisSchema>;

export class KnowledgeProcessor {
    runtime: IAgentRuntime;
    client: ClientBase;

    constructor(runtime: IAgentRuntime, client: ClientBase) {
        this.runtime = runtime;
        this.client = client;
    }

    async processKnowledge(preFetchedTweets: Tweet[] = []) {
        const KNOWLEDGE_USERS =
            this.client.twitterConfig.TWITTER_KNOWLEDGE_USERS;

        if (!KNOWLEDGE_USERS?.length) {
            elizaLogger.log("No knowledge users configured, skipping");
            return;
        }

        if (preFetchedTweets.length === 0) {
            elizaLogger.log(
                "No pre-fetched tweets provided for knowledge processing"
            );
            return;
        }

        elizaLogger.log("Processing knowledge users:", KNOWLEDGE_USERS);
        elizaLogger.log(
            `Processing ${preFetchedTweets.length} pre-fetched tweets for knowledge`
        );

        try {
            const allUserTweets = preFetchedTweets;

            // Group tweets by username (tweets are already filtered for knowledge users)
            const tweetsByUser = new Map<string, Tweet[]>();

            for (const tweet of allUserTweets) {
                const username = tweet.username;
                if (!username) {
                    continue;
                }

                if (!tweetsByUser.has(username)) {
                    tweetsByUser.set(username, []);
                }
                tweetsByUser.get(username)!.push(tweet);
            }

            // Process each user's tweets using existing pipeline
            let highestTweetId: bigint | null = null;

            for (const username of KNOWLEDGE_USERS) {
                const userTweets = tweetsByUser.get(username) || [];
                await this.processKnowledgeUserWithTweets(username, userTweets);

                // Track the highest tweet ID processed
                for (const tweet of userTweets) {
                    const tweetId = BigInt(tweet.id);
                    if (!highestTweetId || tweetId > highestTweetId) {
                        highestTweetId = tweetId;
                    }
                }
            }

            // Update the knowledge processor's last checked tweet ID
            if (highestTweetId) {
                await this.client.cacheLatestKnowledgeCheckedTweetId(
                    highestTweetId
                );
                elizaLogger.log(
                    `Updated knowledge processor last checked tweet ID to: ${highestTweetId}`
                );
            }
        } catch (error) {
            elizaLogger.error("Error fetching knowledge tweets:", error);
        }
    }

    private async processKnowledgeUserWithTweets(
        username: string,
        userTweets: Tweet[]
    ) {
        try {
            const validTweets = await this.validateTweets(userTweets);

            if (validTweets.length === 0) {
                elizaLogger.debug(
                    `No valid tweets found for ${username}, skipping`
                );
                return;
            }

            elizaLogger.log(
                `Processing ${validTweets.length} knowledge tweets from ${username}`
            );

            await this.processUserTweets(validTweets, username);
        } catch (error) {
            elizaLogger.error(
                `Error processing knowledge tweets for ${username}:`,
                error
            );
        }
    }

    private async processUserTweets(validTweets: Tweet[], username: string) {
        const batchSize = 5;

        for (let i = 0; i < validTweets.length; i += batchSize) {
            const batchTweets = validTweets.slice(i, i + batchSize);
            await this.processBatch(batchTweets, username);
        }
    }

    private async processBatch(tweets: Tweet[], username: string) {
        const tweetMediaDescriptions = await this.describeMedia(tweets);
        const batchPrompt = this.buildBatchPrompt(
            username,
            tweets,
            tweetMediaDescriptions
        );

        const analysysResponse = await generateObject<AnalysisArray>({
            runtime: this.runtime,
            context: batchPrompt,
            modelClass: ModelClass.SMALL,
            schema: analysisArraySchema,
            schemaName: "analysis",
            schemaDescription: "The analysis of the tweets",
            functionId: "twitter_processKnowledgeUser",
            tags: ["twitter", "twitter-process-knowledge-user"],
        });

        const analysisResultsObj = analysisArraySchema.parse(
            analysysResponse.object
        );
        const analysisResults = analysisResultsObj.analysis;

        try {
            for (const tweet of tweets) {
                await this.processAnalyzedTweet(
                    analysisResults,
                    tweet,
                    tweetMediaDescriptions,
                    username
                );
            }
        } catch (error) {
            elizaLogger.error(
                "Error processing batch analysis:",
                error,
                error.message
            );
        }
    }

    private async processAnalyzedTweet(
        analysisResults: AnalysisArray["analysis"],
        tweet: Tweet,
        tweetMediaDescriptions: { tweetId: string; descriptions: any[] }[],
        username: string
    ) {
        const analysis = analysisResults.find((r) => r.tweetId === tweet.id);
        const mediaDesc = tweetMediaDescriptions.find(
            (t) => t.tweetId === tweet.id
        );

        if (!analysis) {
            elizaLogger.log(
                `No analysis found for tweet ${tweet.id}, skipping`
            );
            return;
        }

        if (analysis.relevanceScore > RELEVANCE_THRESHOLD) {
            await this.storeTweetInKnowledge(
                tweet,
                mediaDesc,
                analysis,
                username
            );

            elizaLogger.log(
                `Stored knowledge from tweet ${tweet.id} with relevance score ${analysis.relevanceScore}${mediaDesc?.descriptions.length ? " (includes media analysis)" : ""}`
            );
        } else {
            elizaLogger.log(`Skipping low relevance tweet ${tweet.id}`);
        }
    }

    private async storeTweetInKnowledge(
        tweet: Tweet,
        mediaDesc: { tweetId: string; descriptions: any[] },
        analysis: {
            tweetId?: string;
            summary?: string | null;
            knowledgePoints?: string[] | null;
            mediaInsights?: string[] | null;
            topics?: string[] | null;
            relevanceScore?: number;
        },
        username: string
    ) {
        const { tweetId, tweetContent } = this.buildTweetContent(
            tweet,
            mediaDesc,
            analysis
        );

        await this.runtime.ragKnowledgeManager.createKnowledge(
            {
                id: tweetId,
                agentId: this.runtime.agentId,
                content: {
                    text: JSON.stringify(tweetContent, null, 2),
                    metadata: {
                        source: "twitter",
                        type: "tweet",
                        author: username,
                        tweetId: tweet.id,
                        timestamp: tweet.timestamp,
                        topics: analysis.topics || [],
                        relevanceScore: analysis.relevanceScore,
                        hasMedia: mediaDesc?.descriptions.length > 0,
                    },
                },
            },
            "twitter",
            false
        );
    }

    private buildTweetContent(
        tweet: Tweet,
        mediaDesc: { tweetId: string; descriptions: any[] },
        analysis: Analysis
    ) {
        const tweetId = stringToUuid(tweet.id + "-knowledge");
        const tweetContent = {
            text: tweet.text,
            username: tweet.username,
            name: tweet.name,
            timestamp: tweet.timestamp,
            url: tweet.permanentUrl,
            images: mediaDesc?.descriptions || [],
            analysis: {
                summary: analysis.summary || "",
                knowledgePoints: analysis.knowledgePoints || [],
                mediaInsights: analysis.mediaInsights || [],
                topics: analysis.topics || [],
            },
        };
        return { tweetId, tweetContent };
    }

    private buildBatchPrompt(
        username: string,
        tweets: Tweet[],
        tweetMediaDescriptions: { tweetId: string; descriptions: any[] }[]
    ) {
        const formattedTweets = this.formatTweets(
            tweets,
            tweetMediaDescriptions
        );

        const state = {
            twitterUserName: username,
            formattedTweets: formattedTweets,
        };

        const prompt = composeContext({
            // @ts-expect-error: current state is enough to generate the prompt
            state: state,
            template: twitterKnowledgeProcessorTemplate,
        });

        return prompt;
    }

    private formatTweets(
        tweets: Tweet[],
        tweetMediaDescriptions: { tweetId: string; descriptions: any[] }[]
    ) {
        return tweets
            .map((tweet) => {
                const mediaDesc = tweetMediaDescriptions.find(
                    (t) => t.tweetId === tweet.id
                );

                // Format the tweet header and text
                let formattedTweet = `Tweet ${tweet.id}:\n    Text: ${tweet.text}\n`;

                // Add media descriptions if available
                if (mediaDesc?.descriptions.length) {
                    const mediaContent = this.formatMediaDescriptions(
                        mediaDesc.descriptions
                    );
                    formattedTweet += `    Media Descriptions:\n${mediaContent}`;
                } else {
                    formattedTweet += "    No media attached\n";
                }

                return formattedTweet;
            })
            .join("\n\n");
    }

    private formatMediaDescriptions(descriptions: any[]) {
        return descriptions
            .map(
                (desc, i) =>
                    `Image ${i + 1}: Title: ${desc.title}\nDescription: ${desc.description}`
            )
            .join("\n");
    }

    private async describeMedia(tweets: Tweet[]) {
        return await Promise.all(
            tweets.map(async (tweet) => {
                const imageDescriptions = [];
                for (const photo of tweet.photos) {
                    try {
                        const description = await this.runtime
                            .getService<IImageDescriptionService>(
                                ServiceType.IMAGE_DESCRIPTION
                            )
                            .describeImage(photo.url);
                        imageDescriptions.push(description);
                    } catch (error) {
                        elizaLogger.error("Error describing image:", error);
                    }
                }
                return {
                    tweetId: tweet.id,
                    descriptions: imageDescriptions,
                };
            })
        );
    }

    private async validateTweets(userTweets: Tweet[]) {
        const unprocessedTweets = this.filterUnprocessed(userTweets);
        const recentTweets = this.filterRecent(unprocessedTweets);
        const notInKnowledge = await this.filterNotInKnowledge(recentTweets);

        return notInKnowledge;
    }

    private async fetchAndValidateTweets(username: string) {
        const userTweets = await this.fetchUserTweets(username);
        return await this.validateTweets(userTweets);
    }

    private filterRecent(tweets: Tweet[]) {
        const threeDays = 24 * 60 * 60 * 1000 * 3;
        return tweets.filter(
            (t: Tweet) => Date.now() - t.timestamp * 1000 < threeDays
        );
    }

    private filterUnprocessed(tweets: Tweet[]) {
        return tweets.filter(
            (tweet) =>
                !this.client.lastCheckedTweetId ||
                parseInt(tweet.id) > this.client.lastCheckedTweetId
        );
    }

    private async filterNotInKnowledge(tweets: Tweet[]) {
        const knowledgeChecks = await Promise.all(
            tweets.map(async (tweet) => {
                const existingKnowledge =
                    await this.runtime.ragKnowledgeManager.checkExistingKnowledge(
                        tweet.text
                    );
                return { tweet, existingKnowledge };
            })
        );

        return tweets.filter(
            (_, index) => !knowledgeChecks[index].existingKnowledge
        );
    }

    private async fetchUserTweets(username: string) {
        const tweetsRes = await this.client.fetchSearchTweets(
            `from:${username}`,
            10
        );
        return tweetsRes.tweets;
    }
}
