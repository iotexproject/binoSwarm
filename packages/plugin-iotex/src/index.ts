// export * from "./actions/listBuckets";
export * from "./providers/iotexchain";
export * from "./types";

import type { Plugin } from "@elizaos/core";
import { getBucketInfoAction } from "./actions/getBucketInfo";
import { bucketProvider } from "./providers/iotexchain";
import { listBucketsAction } from "./actions/listBuckets";

export const iotexPlugin: Plugin = {
    name: "iotex",
    description:
        "This plugin provides actions to interact with specific IoTeX blockchain concepts like staking",
    providers: [bucketProvider],
    evaluators: [],
    services: [],
    actions: [getBucketInfoAction, listBucketsAction],
};

export default iotexPlugin;
