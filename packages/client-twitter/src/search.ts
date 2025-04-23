import { Tweet } from "agent-twitter-client";
import { composeContext, elizaLogger } from "@elizaos/core";
import { generateMessageResponse } from "@elizaos/core";
import {
    Content,
    HandlerCallback,
    IAgentRuntime,
    IImageDescriptionService,
    ModelClass,
    ServiceType,
    State,
} from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { ClientBase } from "./base";
import { buildConversationThread, sendTweet, wait } from "./utils.ts";
import { twitterSearchTemplate } from "./templates";
import { SearchTweetSelector } from "./SearchTweetSelector";

export class TwitterSearchClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
    private respondedTweets: Set<string> = new Set();

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
    }

    async start() {
        this.engageWithSearchTermsLoop();
    }

    private engageWithSearchTermsLoop() {
        this.engageWithSearchTerms().catch((error) => {
            elizaLogger.error("Error in search terms engagement loop:", error);
        });

        const randomMinutes = this.getRandomMinutes();
        elizaLogger.log(
            `Next twitter search scheduled in ${randomMinutes} minutes`
        );
        setTimeout(
            () => this.engageWithSearchTermsLoop(),
            randomMinutes * 60 * 1000
        );
    }

    private async engageWithSearchTerms() {
        elizaLogger.log("Engaging with search terms");
        try {
            const tweetSelector = new SearchTweetSelector(
                this.runtime,
                this.client
            );
            const selectedTweet = await tweetSelector.selectTweet();
            const message = await this.createMessageFromTweet(selectedTweet);
            const replyContext = this.buildReplyContext(selectedTweet);

            let tweetBackground = "";
            if (selectedTweet.isRetweet) {
                const originalTweet = await this.client.requestQueue.add(() =>
                    this.client.twitterClient.getTweet(selectedTweet.id)
                );
                tweetBackground = `Retweeting @${originalTweet.username}: ${originalTweet.text}`;
            }

            // Generate image descriptions using GPT-4 vision API
            const imageDescriptions = [];
            for (const photo of selectedTweet.photos) {
                const description = await this.runtime
                    .getService<IImageDescriptionService>(
                        ServiceType.IMAGE_DESCRIPTION
                    )
                    .describeImage(photo.url);
                imageDescriptions.push(description);
            }

            let state = await this.runtime.composeState(message, {
                twitterClient: this.client.twitterClient,
                twitterUserName: this.twitterUsername,
                tweetContext: `${tweetBackground}

  Original Post:
  By @${selectedTweet.username}
  ${selectedTweet.text}${replyContext.length > 0 && `\nReplies to original post:\n${replyContext}`}
  ${`Original post text: ${selectedTweet.text}`}
  ${selectedTweet.urls.length > 0 ? `URLs: ${selectedTweet.urls.join(", ")}\n` : ""}${imageDescriptions.length > 0 ? `\nImages in Post (Described): ${imageDescriptions.join(", ")}\n` : ""}
  `,
            });

            await this.client.saveRequestMessage(message, state as State);

            const context = composeContext({
                state,
                template:
                    this.runtime.character.templates?.twitterSearchTemplate ||
                    twitterSearchTemplate,
            });

            const responseContent = await generateMessageResponse({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.LARGE,
            });

            responseContent.inReplyTo = message.id;

            const response = responseContent;

            elizaLogger.log(
                `Bot would respond to tweet ${selectedTweet.id} with: ${response.text}`
            );
            try {
                const callback: HandlerCallback = async (response: Content) => {
                    const memories = await sendTweet(
                        this.client,
                        response,
                        message.roomId,
                        this.twitterUsername,
                        selectedTweet.id
                    );
                    return memories;
                };

                const responseMessages = await callback(responseContent);

                state = await this.runtime.updateRecentMessageState(state);

                for (const responseMessage of responseMessages) {
                    await this.runtime.messageManager.createMemory(
                        responseMessage,
                        "twitter",
                        false,
                        true
                    );
                }

                state = await this.runtime.updateRecentMessageState(state);

                await this.runtime.evaluate(message, state);

                await this.runtime.processActions(
                    message,
                    responseMessages,
                    state,
                    callback
                );

                this.respondedTweets.add(selectedTweet.id);
                const responseInfo = `Context:\n\n${context}\n\nSelected Post: ${selectedTweet.id} - ${selectedTweet.username}: ${selectedTweet.text}\nAgent's Output:\n${response.text}`;

                await this.runtime.cacheManager.set(
                    `twitter/tweet_generation_${selectedTweet.id}.txt`,
                    responseInfo
                );

                await wait();
            } catch (error) {
                elizaLogger.error(`Error sending response post: ${error}`);
            }
        } catch (error) {
            elizaLogger.error("Error engaging with search terms:", error);
        }
    }

    private buildReplyContext(selectedTweet: Tweet) {
        // Fetch replies and retweets
        const replies = selectedTweet.thread;
        const replyContext = replies
            .filter((reply) => reply.username !== this.twitterUsername)
            .map((reply) => `@${reply.username}: ${reply.text}`)
            .join("\n");
        return replyContext;
    }

    private async createMessageFromTweet(selectedTweet: Tweet) {
        const conversationId = selectedTweet.conversationId;
        const roomId = stringToUuid(
            conversationId + "-" + this.runtime.agentId
        );
        const userIdUUID = stringToUuid(selectedTweet.userId as string);

        await this.runtime.ensureConnection(
            userIdUUID,
            roomId,
            selectedTweet.username,
            selectedTweet.name,
            "twitter"
        );

        // crawl additional conversation tweets, if there are any
        await buildConversationThread(selectedTweet, this.client);

        const message = {
            id: stringToUuid(selectedTweet.id + "-" + this.runtime.agentId),
            agentId: this.runtime.agentId,
            content: {
                text: selectedTweet.text,
                url: selectedTweet.permanentUrl,
                inReplyTo: selectedTweet.inReplyToStatusId
                    ? stringToUuid(
                          selectedTweet.inReplyToStatusId +
                              "-" +
                              this.runtime.agentId
                      )
                    : undefined,
            },
            userId: userIdUUID,
            roomId,
            // Timestamps are in seconds, but we need them in milliseconds
            createdAt: selectedTweet.timestamp * 1000,
        };

        if (!message.content.text) {
            elizaLogger.warn("Returning: No response text found");
            throw new Error("No response text found");
        }

        return message;
    }

    private getRandomMinutes() {
        return Math.floor(Math.random() * (120 - 60 + 1)) + 60;
    }
}
