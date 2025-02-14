import { z } from "zod";

// Action parameters
export const GetBucketInfoParams = z.object({
    bucketId: z.string().min(1),
});

// Transaction types
export interface Bucket {
    id: number;
    owner: string;
    amount: string;
    createdAt: string;
    updatedAt: string;
    lockPeriod: number;
    StakeLock: boolean;
}

export interface ListBucketsParams {
    owner: string;
}

// Action responses

export interface GetBucketInfoResponse {
    bucket: Bucket;
}

export interface ListBucketsResponse {
    bucketIds: number[];
}

// Plugin configuration
export interface EvmPluginConfig {
    secrets?: {
        IOTEX_PRIVATE_KEY: string;
    };
    testMode?: boolean;
    multicall?: {
        batchSize?: number;
        wait?: number;
    };
}
