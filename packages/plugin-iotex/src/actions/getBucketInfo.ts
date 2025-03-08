import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    composeContext,
    generateObject,
    ModelClass,
    generateText,
} from "@elizaos/core";

import { IoTeXChainProvider, initIoTeXProvider } from "../providers/iotexchain";
import {
    getBucketIDTemplate,
    summarizeStakingStatusTemplate,
} from "../templates";
import { GetBucketInfoParams } from "../types";

export class GetBucketInfoAction {
    constructor(private bucketProvider: IoTeXChainProvider) {}

    async getBucketInfo(bucketIDs: Number[]): Promise<any> {
        console.log(`Fetching bucket info for IDs: ${bucketIDs}`);
        try {
            const bucketInfo =
                await this.bucketProvider.fetchBucketInfo(bucketIDs);
            return {
                success: true,
                bucket: bucketInfo,
            };
        } catch (error) {
            console.error(
                `getBucketInfo: Error fetching bucket info: ${error.message}`
            );
            return {
                success: false,
                error: error.message,
            };
        }
    }
}

export const getBucketInfoAction: Action = {
    name: "get_bucket_info",
    description: "Retrieve information for an array of IoTeX bucket IDs",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback?: HandlerCallback
    ) => {
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        console.log("Buckets Info action handler invoked.");

        const bucketProvider = await initIoTeXProvider(runtime);
        const action = new GetBucketInfoAction(bucketProvider);

        const context = composeContext({
            state,
            template: getBucketIDTemplate,
        });

        const params = await generateObject({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
            schema: GetBucketInfoParams,
        });

        const bucketIDs = params.object?.bucketIDs;
        console.log("Bucket IDs:", bucketIDs);

        // ensure bucket id is found and it's a positive integer

        if (!bucketIDs) {
            const errorMessage = "Bucket IDs are required to fetch information.";
            console.error(errorMessage);
            if (callback) {
                callback({
                    text: errorMessage,
                    content: { error: errorMessage },
                });
            }
            return false;
        }

        try {
            const response = await action.getBucketInfo(bucketIDs);
            const buckets = response.bucket;
            if (callback) {
                if (response.success) {
                    await callback({
                        text:
                          buckets.map((bucket) => {
                            return
                                `**Bucket ID**: ${bucket.id}
                                **Staked Amount**: ${bucket.stakedAmount} IOTX
                                **StakeLock**: ${bucket.autoStake ? "Enabled" : "Disabled"}
                                **Created At**: ${bucket.createdAt}
                                **Stake Start Time**: ${bucket.stakeStartTime}
                                **Unstake Start Time**: ${bucket.unstakeStartTime || "Not yet initiated"}
                                **Staked Duration**: ${bucket.stakedDuration} days`
                            }).join("\n")}
                    );

                    state = await runtime.updateRecentMessageState(state);
                    const context2 = composeContext({
                        state,
                        template: summarizeStakingStatusTemplate,
                    });
                    const summary = await generateText({
                        runtime,
                        context: context2,
                        modelClass: ModelClass.SMALL,
                    });
                    callback({ text: summary });
                } else {
                    callback({
                        text: `Error: ${response.error}`,
                        content: { error: response.error },
                    });
                    return false;
                }
            }
            return response.success;
        } catch (error) {
            console.error("Error handling bucket info action:", error);
            if (callback) {
                callback({
                    text: `Error: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    validate: async (_runtime: IAgentRuntime) => true,
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "Retrieve info for bucket ID 12345",
                    action: "GET_BUCKET_INFO",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "I'll fetch details for bucket ID 12345",
                    action: "GET_BUCKET_INFO",
                },
            },
        ],
    ],
    similes: ["GET_BUCKET_INFO", "FETCH_BUCKET_DETAILS", "LOOKUP_BUCKET"],
};
