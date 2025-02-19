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
    listBucketsTemplate,
    summarizeStakingStatusTemplate,
} from "../templates";
import { ListBucketsParams } from "../types";

export class ListBucketsAction {
    constructor(private iotexProvider: IoTeXChainProvider) {}

    async listBuckets(ownerAddress: string): Promise<any> {
        console.log(`Fetching buckets owned by wallet: ${ownerAddress}`);
        try {
            const bucketsList =
                await this.iotexProvider.listBuckets(ownerAddress);
            return {
                success: true,
                bucketsList: bucketsList,
            };
        } catch (error) {
            console.error(
                `listBuckets: Error fetching buckets: ${error.message}`
            );
            return {
                success: false,
                error: error.message,
            };
        }
    }
}

export const listBucketsAction: Action = {
    name: "list_buckets",
    description:
        "List all staking bucket including bucket details owned by a certain IoTeX wallet address",
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

        console.log("List buckets action handler invoked.");

        const iotexProvider = await initIoTeXProvider(runtime);
        const action = new ListBucketsAction(iotexProvider);

        const context = composeContext({
            state,
            template: listBucketsTemplate,
        });

        const params = await generateObject({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
            schema: ListBucketsParams,
        });

        const ownerAddress = params.object?.ownerAddress;
        console.log("ownerAddress:", ownerAddress);

        if (!ownerAddress) {
            const errorMessage =
                "A valid wallet address is required to fetch information.";
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
            const response = await action.listBuckets(ownerAddress);
            const bucketsList = response.bucketsList;
            if (callback) {
                if (response.success) {
                    await callback({
                        text: IoTeXChainProvider.bucketsListToString(
                            bucketsList
                        ),
                    });
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
            console.error("Error handling list buckets action:", error);
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
                    text: "Can you list my staking buckets?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Sure, could you please provide your wallet address?",
                    action: "NONE",
                },
            },
            {
                user: "user",
                content: {
                    text: "Here is my wallet: 0xf76898f6aa5bf236f10b5da22461632bae054b84",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Great, let me fetch the staking buckets for you...",
                    action: "LIST_BUCKETS",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "If ound 3 buckets for your wallet. Here are the IDs: 32, 123, 44. Do you want me to fetch details for any of them?",
                    action: "NONE",
                },
            },
        ],
    ],
    similes: ["LIST_BUCKETS", "FETCH_STAKING", "GET_STAKING_BUCKETS"],
};
