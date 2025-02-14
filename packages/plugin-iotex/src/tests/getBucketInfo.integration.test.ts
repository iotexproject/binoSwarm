import { describe, test, expect, beforeAll } from "vitest";
import { GetBucketInfoAction } from "../actions/getBucketInfo";
import { BucketProvider } from "../providers/bucket";
import { IAgentRuntime } from "@elizaos/core";
import bucketAbi from "../abis/BucketABI.json";

// Define constants for testing
const IOTEX_RPC_URL = "https://babel-api.mainnet.iotex.io"; // Use testnet if possible
const BUCKET_CONTRACT_ADDRESS = "0x04c22afae6a03438b8fed74cb1cf441168df3f12"; // Replace with actual address
const TEST_BUCKET_ID = "32"; // Use a known valid bucket ID for testing

// Mock runtime (only cache manager is needed)
const mockRuntime: IAgentRuntime = {
    cacheManager: {
        get: async (key: string) => null, // No cache for integration tests
        set: async (key: string, value: any) => {},
    },
} as unknown as IAgentRuntime;

describe("Integration Test: GetBucketInfoAction", () => {
    let bucketProvider: BucketProvider;
    let getBucketInfoAction: GetBucketInfoAction;

    beforeAll(() => {
        bucketProvider = new BucketProvider(
            IOTEX_RPC_URL,
            BUCKET_CONTRACT_ADDRESS,
            mockRuntime.cacheManager
        );

        getBucketInfoAction = new GetBucketInfoAction(mockRuntime);
        (getBucketInfoAction as any).bucketProvider = bucketProvider;
    });

    test("should fetch real bucket info from IoTeX blockchain", async () => {
        try {
            const result =
                await getBucketInfoAction.getBucketInfo(TEST_BUCKET_ID);

            console.log("Bucket Info:", result);

            expect(result.success).toBe(true);
            expect(result.bucket).toHaveProperty("id");
            expect(result.bucket).toHaveProperty("owner");
            expect(result.bucket).toHaveProperty("candidateAddress");
            expect(result.bucket).toHaveProperty("stakedAmount");
            expect(result.bucket).toHaveProperty("stakedDuration");
            expect(result.bucket).toHaveProperty("createdAt");
            expect(result.bucket).toHaveProperty("stakeStartTime");
            expect(result.bucket).toHaveProperty("autoStake");

            // Ensure values are valid
            expect(result.bucket.id).toBe(TEST_BUCKET_ID);
            expect(typeof result.bucket.owner).toBe("string");
            expect(typeof result.bucket.candidateAddress).toBe("string");
            expect(Number(result.bucket.stakedAmount)).toBeGreaterThan(0);
            expect(Number(result.bucket.stakedDuration)).toBeGreaterThan(0);
            expect(result.bucket.createdAt instanceof Date).toBe(true);
            expect(result.bucket.stakeStartTime instanceof Date).toBe(true);
        } catch (error) {
            console.error("Integration test failed:", error);
            throw error;
        }
    });
});
