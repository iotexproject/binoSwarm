import { ethers } from "ethers";
import NodeCache from "node-cache";
import {
    type IAgentRuntime,
    type Provider,
    type Memory,
    type State,
    type ICacheManager,
    elizaLogger,
} from "@elizaos/core";

import bucketAbi from "../abis/BucketABI.json"; // Ensure ABI is correctly referenced

export class BucketProvider {
    private provider: ethers.JsonRpcProvider;
    private contract: ethers.Contract;
    private cache: NodeCache;
    private cacheKey: string = "iotex/buckets";
    private CACHE_EXPIRY_SEC = 10; // Cache expiry in seconds

    constructor(
        rpcUrl: string,
        contractAddress: string,
        private cacheManager: ICacheManager
    ) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.contract = new ethers.Contract(
            contractAddress,
            bucketAbi,
            this.provider
        );
        this.cache = new NodeCache({ stdTTL: this.CACHE_EXPIRY_SEC });
    }

    /**
     * Fetches bucket information from IoTeX smart contract.
     * @param bucketId - The ID of the bucket to retrieve.
     * @returns - The bucket details from the blockchain.
     */
    async fetchBucketInfo(bucketId: string): Promise<any> {
        const cacheKey = `${this.cacheKey}/${bucketId}`;
        const cachedData = await this.getCachedData(cacheKey);

        if (cachedData) {
            elizaLogger.log(`Returning cached bucket info for ID: ${bucketId}`);
            return cachedData;
        }

        try {
            console.log(
                `Fetching bucket info for ID: ${bucketId} from IoTeX blockchain...`
            );
            const bucketData = await this.contract.bucketsByIndexes([bucketId]);

            if (!bucketData || bucketData.length === 0) {
                throw new Error("No bucket data found for this ID");
            }

            const bucketInfo = bucketData[0]; // Only one bucket is expected

            const formattedBucketInfo = {
                id: bucketInfo.index.toString(),
                owner: bucketInfo.owner,
                candidateAddress: bucketInfo.candidateAddress,
                stakedAmount: ethers.formatUnits(
                    bucketInfo.stakedAmount,
                    "ether"
                ),
                stakedDuration: Number(bucketInfo.stakedDuration),
                createdAt: new Date(Number(bucketInfo.createTime) * 1000).toISOString(),
                stakeStartTime: new Date(
                    Number(bucketInfo.stakeStartTime) * 1000
                ).toISOString(),
                unstakeStartTime: bucketInfo.unstakeStartTime
                    ? new Date(Number(bucketInfo.unstakeStartTime) * 1000).toISOString()
                    : '',
                autoStake: bucketInfo.autoStake,
            };

            console.log("Formatted bucket info:", formattedBucketInfo);

            await this.setCachedData(cacheKey, formattedBucketInfo);

            console.log("Bucket info fetched successfully.");
            return formattedBucketInfo;
        } catch (error) {
            console.error(
                `bucketProvider: Error fetching bucket info: ${error}`
            );
            throw new Error("Failed to fetch bucket information");
        }
    }

    /**
     * Retrieves data from cache if available.
     * @param key - The cache key.
     */
    private async getCachedData<T>(key: string): Promise<T | null> {
        const cachedData = this.cache.get<T>(key);
        if (cachedData) return cachedData;

        const fileCachedData = await this.cacheManager.get<T>(key);
        if (fileCachedData) {
            this.cache.set(key, fileCachedData);
            return fileCachedData;
        }

        return null;
    }

    /**
     * Stores data in cache.
     * @param key - The cache key.
     * @param data - The data to store.
     */
    private async setCachedData<T>(key: string, data: T): Promise<void> {
        this.cache.set(key, data);
        await this.cacheManager.set(key, data, {
            expires: Date.now() + this.CACHE_EXPIRY_SEC * 1000,
        });
    }
}

/**
 * Initializes the IoTeX Bucket Provider for Eliza AI Agent
 */
export const initBucketProvider = async (runtime: IAgentRuntime) => {
    const contractAddress = runtime.getSetting(
        "IOTEX_STAKING_CONTRACT_ADDRESS"
    );
    const rpcUrl = runtime.getSetting("IOTEX_RPC_URL");

    if (!contractAddress || !rpcUrl) {
        throw new Error(
            "IOTEX_STAKING_CONTRACT_ADDRESS and IOTEX_RPC_URL are required"
        );
    }

    return new BucketProvider(rpcUrl, contractAddress, runtime.cacheManager);
};

/**
 * Exposing the provider to Eliza
 */
export const bucketProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        state?: State
    ): Promise<string | null> {
        try {
            const provider = await initBucketProvider(runtime);
            const bucketId = (_message as any)?.content?.bucketId;

            if (!bucketId) {
                return "Bucket ID is required to retrieve information.";
            }

            const bucketInfo = await provider.fetchBucketInfo(bucketId);
            return `Bucket Info:
            - ID: ${bucketInfo.id}
            - Owner: ${bucketInfo.owner}
            - Candidate: ${bucketInfo.candidateAddress}
            - Staked Amount: ${bucketInfo.stakedAmount} IOTX
            - Created At: ${bucketInfo.createdAt}
            - Auto Stake: ${bucketInfo.autoStake ? "Yes" : "No"}`;
        } catch (error) {
            console.error("Error in IoTeX Bucket provider:", error);
            return "Failed to retrieve bucket info.";
        }
    },
};
