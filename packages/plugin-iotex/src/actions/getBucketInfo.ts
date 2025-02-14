import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    composeContext,
    generateObject,
    ModelClass,
} from "@elizaos/core";

import { BucketProvider, initBucketProvider } from "../providers/bucket";
import { getBucketInfoTemplate } from "../templates";
import { GetBucketInfoParams } from "../types";

export class GetBucketInfoAction {
    constructor(private bucketProvider: BucketProvider) {}

    async getBucketInfo(bucketId: string): Promise<any> {
        console.log(`Fetching bucket info for ID: ${bucketId}`);
        try {
            const bucketInfo =
                await this.bucketProvider.fetchBucketInfo(bucketId);
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
    description: "Retrieve information for a specified IoTeX bucket ID",
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

        console.log("Bucket Info action handler invoked.");

        const bucketProvider = await initBucketProvider(runtime);
        const action = new GetBucketInfoAction(bucketProvider);

        const context = composeContext({
            state,
            template: getBucketInfoTemplate,
        });

        const params = await generateObject({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
            schema: GetBucketInfoParams,
        });

        console.log("Type of params:", typeof params);
        console.log("Params keys:", Object.keys(params));
        console.log("Params object:", params.object);
        const bucketId = params.object?.bucketId;
        console.log("Bucket ID:", bucketId);

        if (!bucketId) {
            const errorMessage = "Bucket ID is required to fetch information.";
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
            const response = await action.getBucketInfo(bucketId);
            if (callback) {
                if (response.success) {
                    callback({
                        text: `Bucket Info: ${JSON.stringify(response.bucket)}`,
                        action: "continue",
                    });
                } else {
                    callback({
                        text: `Error: ${response.error}`,
                        content: { error: response.error },
                    });
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
            {
                user: "assistant",
                content: {
                    text: "According to on-chain data, bucket ID 12345 has a deposit of 100 IOTX. The stake was created on Jan 1, 2022 with a lock period of 120 days. The bucket is locked because StakeLock is enabled which keeps the lock fixed at 120 days and not counting down.",
                    action: "GET_BUCKET_INFO",
                },
            },
        ],
    ],
    similes: ["GET_BUCKET_INFO", "FETCH_BUCKET_DETAILS", "LOOKUP_BUCKET"],
};
