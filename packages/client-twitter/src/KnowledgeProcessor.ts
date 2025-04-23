import { SearchMode, Tweet } from "agent-twitter-client";
import {
    IAgentRuntime,
    ModelClass,
    stringToUuid,
    elizaLogger,
    IImageDescriptionService,
    ServiceType,
    generateObject,
} from "@elizaos/core";
import { z } from "zod";
import { ClientBase } from "./base";

export class KnowledgeProcessor {
    runtime: IAgentRuntime;
    client: ClientBase;

    constructor(runtime: IAgentRuntime, client: ClientBase) {
        this.runtime = runtime;
        this.client = client;
    }

    async processKnowledge() {
        const KNOWLEDGE_USERS =
            this.client.twitterConfig.TWITTER_KNOWLEDGE_USERS;

        if (!KNOWLEDGE_USERS?.length) {
            elizaLogger.log("No knowledge users configured, skipping");
            return;
        }

        elizaLogger.log("Processing knowledge users:", KNOWLEDGE_USERS);

        for (const username of KNOWLEDGE_USERS) {
            await this.processKnowledgeUser(username);
        }
    }

    private async processKnowledgeUser(username: string) {
        try {
            const validTweets = await this.fetchValidTweets(username);

            if (validTweets.length > 0) {
                elizaLogger.log(
                    `Processing ${validTweets.length} knowledge tweets from ${username}`
                );

                // Process tweets in batches of 5
                for (let i = 0; i < validTweets.length; i += 5) {
                    const batchTweets = validTweets.slice(i, i + 5);

                    // First, process all media for the batch
                    const tweetMediaDescriptions = await Promise.all(
                        batchTweets.map(async (tweet) => {
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
                                    elizaLogger.error(
                                        "Error describing image:",
                                        error
                                    );
                                }
                            }
                            return {
                                tweetId: tweet.id,
                                descriptions: imageDescriptions,
                            };
                        })
                    );

                    const batchPrompt = `Analyze the following tweets and their media from ${username} and extract key information, insights, or knowledge. Pay special attention to both text content and media descriptions. Ignore promotional or non-informative content.

${batchTweets
    .map((tweet) => {
        const mediaDesc = tweetMediaDescriptions.find(
            (t) => t.tweetId === tweet.id
        );
        return `Tweet ${tweet.id}:
Text: ${tweet.text}
${
    mediaDesc?.descriptions.length
        ? `Media Descriptions:
${mediaDesc.descriptions
    .map(
        (desc, i) => `Image ${i + 1}: Title: ${desc.title}
Description: ${desc.description}`
    )
    .join("\n")}`
        : "No media attached"
}
`;
    })
    .join("\n\n")}

For each tweet that contains valuable information (in either text or media), provide a concise summary and any key knowledge points.
`;

                    const analysisSchema = z.object({
                        analysis: z.array(
                            z.object({
                                tweetId: z
                                    .string()
                                    .describe("The ID of the tweet"),
                                summary: z
                                    .string()
                                    .describe(
                                        "A concise summary of the tweet if it contains valuable information, otherwise null"
                                    ),
                                knowledgePoints: z
                                    .array(z.string())
                                    .describe(
                                        "Specific facts or insights extracted from both text and media, if any"
                                    ),
                                mediaInsights: z
                                    .array(z.string())
                                    .describe(
                                        "Insights extracted from media, if any"
                                    ),
                                topics: z
                                    .array(z.string())
                                    .describe(
                                        "Topics or categories relevant to the tweet"
                                    ),
                                relevanceScore: z
                                    .number()
                                    .describe(
                                        "A score between 0 and 1, where 1 is highly informative"
                                    ),
                            })
                        ),
                    });

                    type Analysis = z.infer<typeof analysisSchema>;

                    const analysysResponse = await generateObject<Analysis>({
                        runtime: this.runtime,
                        context: batchPrompt,
                        modelClass: ModelClass.SMALL,
                        schema: analysisSchema,
                        schemaName: "analysis",
                        schemaDescription: "The analysis of the tweets",
                    });

                    const analysisResultsObj = analysisSchema.parse(
                        analysysResponse.object
                    );
                    const analysisResults = analysisResultsObj.analysis;

                    try {
                        // Process each analyzed tweet
                        for (const tweet of batchTweets) {
                            const analysis = analysisResults.find(
                                (r) => r.tweetId === tweet.id
                            );
                            const mediaDesc = tweetMediaDescriptions.find(
                                (t) => t.tweetId === tweet.id
                            );

                            // Only store tweets with meaningful content
                            if (analysis && analysis.relevanceScore > 0.5) {
                                // Create enriched knowledge item
                                const tweetId = stringToUuid(
                                    tweet.id + "-knowledge"
                                );
                                const tweetContent = {
                                    text: tweet.text,
                                    username: tweet.username,
                                    name: tweet.name,
                                    timestamp: tweet.timestamp,
                                    url: tweet.permanentUrl,
                                    images: mediaDesc?.descriptions || [],
                                    analysis: {
                                        summary: analysis.summary,
                                        knowledgePoints:
                                            analysis.knowledgePoints,
                                        mediaInsights: analysis.mediaInsights,
                                        topics: analysis.topics,
                                    },
                                };

                                await this.runtime.ragKnowledgeManager.createKnowledge(
                                    {
                                        id: tweetId,
                                        agentId: this.runtime.agentId,
                                        content: {
                                            text: JSON.stringify(
                                                tweetContent,
                                                null,
                                                2
                                            ),
                                            metadata: {
                                                source: "twitter",
                                                type: "tweet",
                                                author: username,
                                                tweetId: tweet.id,
                                                timestamp: tweet.timestamp,
                                                topics: analysis.topics,
                                                relevanceScore:
                                                    analysis.relevanceScore,
                                                hasMedia:
                                                    mediaDesc?.descriptions
                                                        .length > 0,
                                            },
                                        },
                                    },
                                    "twitter",
                                    false
                                );

                                elizaLogger.log(
                                    `Stored knowledge from tweet ${tweet.id} with relevance score ${analysis.relevanceScore}${mediaDesc?.descriptions.length ? " (includes media analysis)" : ""}`
                                );
                            } else {
                                elizaLogger.log(
                                    `Skipping low relevance tweet ${tweet.id}`
                                );
                            }
                        }
                    } catch (error) {
                        elizaLogger.error(
                            "Error processing batch analysis:",
                            error,
                            error.message
                        );
                    }
                }
            }
        } catch (error) {
            elizaLogger.error(
                `Error processing knowledge tweets for ${username}:`,
                error
            );
        }
    }

    private async fetchValidTweets(username: string) {
        const userTweets = await this.fetchUserTweets(username);
        const unprocessedTweets = this.filterUnprocessed(userTweets);
        const recentTweets = this.filterRecent(unprocessedTweets);

        return recentTweets;
    }

    private filterRecent(unprocessedTweets: Tweet[]) {
        const threeDays = 24 * 60 * 60 * 1000 * 3;
        return unprocessedTweets.filter(
            (t: Tweet) => Date.now() - t.timestamp * 1000 < threeDays
        );
    }

    private filterUnprocessed(userTweets: Tweet[]) {
        return userTweets.filter(
            (tweet) =>
                !this.client.lastCheckedTweetId ||
                parseInt(tweet.id) > this.client.lastCheckedTweetId
        );
    }

    private async fetchUserTweets(username: string) {
        const tweetsRes = await this.client.twitterClient.fetchSearchTweets(
            `from:${username}`,
            10,
            SearchMode.Latest
        );
        return tweetsRes.tweets;
    }
}
