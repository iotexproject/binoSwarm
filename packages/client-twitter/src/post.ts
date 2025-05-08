import {
    composeContext,
    IAgentRuntime,
    ModelClass,
    stringToUuid,
    UUID,
    truncateToCompleteSentence,
    elizaLogger,
    generateMessageResponse,
    State,
    generateObject,
} from "@elizaos/core";

import { ClientBase } from "./base.ts";
import { twitterPostTemplate, twitterQSPrompt } from "./templates.ts";
import { TwitterHelpers } from "./helpers.ts";
import { DiscordApprover } from "./DiscordApprover.ts";
import qsTool from "./providers.ts";

export class TwitterPostClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;

    private approvalRequired: boolean = false;
    private discordApprover: DiscordApprover;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;

        this.logConfigOnInitialization();
        this.configureApprovals();
    }

    private configureApprovals() {
        const approvalRequired: boolean =
            this.runtime
                .getSetting("TWITTER_APPROVAL_ENABLED")
                ?.toLocaleLowerCase() === "true";
        if (approvalRequired) {
            this.discordApprover = new DiscordApprover(
                this.runtime,
                this.client,
                this.twitterUsername
            );
            this.approvalRequired = true;
        }
    }

    private logConfigOnInitialization() {
        elizaLogger.log("Twitter Client Configuration:");
        elizaLogger.log(`- Username: ${this.twitterUsername}`);
        elizaLogger.log(
            `- Post Interval: ${this.client.twitterConfig.POST_INTERVAL_MIN}-${this.client.twitterConfig.POST_INTERVAL_MAX} minutes`
        );
        elizaLogger.log(
            `- Post Immediately: ${this.client.twitterConfig.POST_IMMEDIATELY ? "enabled" : "disabled"}`
        );
        elizaLogger.log(
            `- Search Enabled: ${this.client.twitterConfig.TWITTER_SEARCH_ENABLE ? "enabled" : "disabled"}`
        );
    }

    async start() {
        if (!this.client.profile) {
            await this.client.init();
        }

        if (this.client.twitterConfig.POST_IMMEDIATELY) {
            await this.generateNewTweet();
        }
        await this.generateNewTweetLoop();

        if (this.approvalRequired) {
            this.discordApprover.runPendingTweetCheckLoop();
        }
    }

    private async generateNewTweetLoop() {
        elizaLogger.log("Starting generate new tweet loop");

        const delayMs = this.getPostDelay();
        await this.postTweetInCurrentIteration(delayMs);
        this.setupNextTweetIteration(delayMs);
    }

    private setupNextTweetIteration(delayMs: number) {
        setTimeout(() => {
            this.generateNewTweetLoop();
        }, delayMs);

        const delayMinutes = delayMs / 60000;
        elizaLogger.log(`Next tweet scheduled in ${delayMinutes} minutes`);
    }

    private async postTweetInCurrentIteration(delayMs: number) {
        const isTimeToPost = await this.isTimeToPost(delayMs);
        if (isTimeToPost) {
            await this.generateNewTweet();
        }
    }

    private async isTimeToPost(delayMs: number) {
        const lastPostTimestamp = await this.getLastPostTimestamp();
        return Date.now() > lastPostTimestamp + delayMs;
    }

    private getPostDelay() {
        const minMinutes = this.client.twitterConfig.POST_INTERVAL_MIN;
        const maxMinutes = this.client.twitterConfig.POST_INTERVAL_MAX;
        // Calculate random number of minutes between min and max
        const range = maxMinutes - minMinutes + 1;
        const randomMinutes = Math.floor(Math.random() * range);
        const delayMinutes = randomMinutes + minMinutes;

        // Convert to milliseconds and return
        return delayMinutes * 60 * 1000;
    }

    private async getLastPostTimestamp() {
        const lastPost = await this.runtime.cacheManager.get<{
            timestamp: number;
        }>("twitter/" + this.twitterUsername + "/lastPost");

        return lastPost?.timestamp ?? 0;
    }

    /**
     * Generates and posts a new tweet.
     */
    private async generateNewTweet() {
        elizaLogger.log("Generating new tweet");

        try {
            const username = this.client.profile.username;
            const roomId = stringToUuid("twitter_generate_room-" + username);

            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                username,
                this.runtime.character.name,
                "twitter"
            );

            const newTweetContent = await this.genAndCleanNewTweet(roomId);
            if (this.approvalRequired) {
                await this.discordApprover.sendForApproval(
                    newTweetContent,
                    roomId,
                    newTweetContent
                );
            } else {
                await TwitterHelpers.postTweet(
                    this.runtime,
                    this.client,
                    newTweetContent,
                    roomId,
                    newTweetContent,
                    this.twitterUsername
                );
            }
        } catch (error) {
            elizaLogger.error("Error generating new tweet:", error);
        }
    }

    private truncateNewTweet(maxTweetLength: number, newTweetContent: string) {
        if (maxTweetLength) {
            newTweetContent = truncateToCompleteSentence(
                newTweetContent,
                maxTweetLength
            );
        }
        return newTweetContent;
    }

    private async genAndCleanNewTweet(roomId: UUID) {
        const maxTweetLength = this.client.twitterConfig.MAX_TWEET_LENGTH;
        const newTweetContent = await this.generateNewTweetContent(
            roomId,
            maxTweetLength
        );
        elizaLogger.debug("generate new tweet content:\n" + newTweetContent);

        let cleanedContent = this.truncateNewTweet(
            maxTweetLength,
            newTweetContent
        );
        cleanedContent = this.fixNewLines(cleanedContent);
        cleanedContent = this.removeQuotes(cleanedContent);

        return cleanedContent;
    }

    private removeQuotes(str: string) {
        return str.replace(/^['"](.*)['"]$/, "$1");
    }

    private fixNewLines(str: string) {
        return str.replaceAll(/\\n/g, "\n\n"); //ensures double spaces
    }

    private async generateNewTweetContent(
        roomId: UUID,
        maxTweetLength: number
    ) {
        const state = await this.composeNewTweetState(roomId, maxTweetLength);

        const qsContext = this.composeAskQsContext(state);
        const qsResponse = await this.askOracle(qsContext);

        state.oracleResponse = qsResponse;
        const context = this.composeNewTweetContext(state);

        const { text } = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        return text;
    }

    private async askOracle(context: string) {
        const { object } = await generateObject<{ question: string }>({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
            schema: qsTool.parameters,
            schemaName: qsTool.name,
            schemaDescription: qsTool.description,
            customSystemPrompt:
                "You are a neutral processing agent. Wait for task-specific instructions in the user prompt.",
        });

        const answer = await qsTool.execute({ question: object.question });
        return answer;
    }

    private composeAskQsContext(state: State) {
        const expertContext = composeContext({
            state,
            template:
                this.runtime.character.templates?.twitterQSPrompt ||
                twitterQSPrompt,
        });

        return expertContext;
    }

    private async composeNewTweetState(roomId: UUID, maxTweetLength: number) {
        const topics = this.runtime.character.topics.join(", ");
        const agentId = this.runtime.agentId;

        const state = await this.runtime.composeState(
            {
                userId: agentId,
                roomId,
                agentId,
                content: {
                    text: topics || "",
                    action: "TWEET",
                },
            },
            {
                twitterUserName: this.client.profile.username,
                maxTweetLength,
            }
        );

        return state;
    }

    private composeNewTweetContext(state: State) {
        return composeContext({
            state,
            template:
                this.runtime.character.templates?.twitterPostWithQS ||
                this.runtime.character.templates?.twitterPostTemplate ||
                twitterPostTemplate,
        });
    }
}
