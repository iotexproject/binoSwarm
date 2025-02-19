import { z } from "zod";

// Action parameters
export const GetBucketInfoParams = z.object({
    bucketId: z.string().min(1),
});

export const ListBucketsParams = z.object({
    ownerAddress: z.string().min(1),
});

export interface Bucket {
    id: number;
    owner: string;
    amount: string;
    createdAt: string;
    updatedAt: string;
    lockPeriod: number;
    StakeLock: boolean;
}
