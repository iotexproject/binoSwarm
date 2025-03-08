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

// ABI of the Staking Contract
import bucketAbi from "../abis/BucketABI.json";
import { Bucket } from "../types";

export class IoTeXChainProvider {
    private provider: ethers.JsonRpcProvider;
    private contract: ethers.Contract;
    private cache: NodeCache;
    private cacheKey: string = "iotexchain";
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
    async fetchBucketInfo(bucketIDs: number[]): Promise<any[]> {
        const cacheKey = `${this.cacheKey}/bucketsInfo/${bucketIDs.join(",")}`;
        const cachedData = await this.getCachedData<any[]>(cacheKey);

        if (cachedData) {
            elizaLogger.log(`Returning cached bucket info for IDs: ${bucketIDs}`);
            return cachedData;
        }

        try {
            console.log(`Fetching bucket info for IDs: ${bucketIDs} from IoTeX blockchain...`);

            // Fetch all bucket data from the contract
            const bucketDataArray = await this.contract.bucketsByIndexes(bucketIDs);

            if (!bucketDataArray || bucketDataArray.length === 0) {
                throw new Error("No bucket data found for these IDs");
            }

            // Format each bucket's data
            const formattedBuckets = bucketDataArray.map((bucketData: any) => ({
                id: bucketData.index.toString(),
                owner: bucketData.owner,
                candidateAddress: bucketData.candidateAddress,
                stakedAmount: ethers.formatUnits(bucketData.stakedAmount, "ether"),
                stakedDuration: Number(bucketData.stakedDuration),
                createdAt: new Date(Number(bucketData.createTime) * 1000).toISOString(),
                stakeStartTime: new Date(Number(bucketData.stakeStartTime) * 1000).toISOString(),
                unstakeStartTime: bucketData.unstakeStartTime
                    ? new Date(Number(bucketData.unstakeStartTime) * 1000).toISOString()
                    : "",
                autoStake: bucketData.autoStake,
            }));

            console.log("Formatted bucket info:", formattedBuckets);

            // Cache the entire array of bucket info
            await this.setCachedData(cacheKey, formattedBuckets);

            console.log("Bucket info fetched successfully.");
            return formattedBuckets;
        } catch (error) {
            console.error(`bucketProvider: Error fetching bucket info: ${error}`);
            throw new Error("Failed to fetch bucket information");
        }
    }

    /**
     * Lists all staking buckets owned by an address.
     * @param ownerAddress - The address we want to list staking buckets of.
     * @returns - The list of buckets owned by the address, including each buket settings.
     */
    async listBuckets(ownerAddress: string): Promise<any> {
        const cacheKey = `${this.cacheKey}/bucketsList/${ownerAddress}`;
        const cachedData = await this.getCachedData(cacheKey);

        if (cachedData) {
            elizaLogger.log(
                `Returning cached buckets info for address: ${ownerAddress}`
            );
            return cachedData;
        }

        try {
            console.log(
                `Fetching buckets for address: ${ownerAddress} from IoTeX blockchain...`
            );
            const bucketsList = await this.contract.bucketsByVoter(
                ownerAddress,
                0,
                100
            );

            if (!bucketsList || bucketsList.length === 0) {
                throw new Error(
                    "This address doesn't seem to have any staking buckets"
                );
            }

            console.log(`Buckets for voter ${ownerAddress}:`);

            // Let's fetch all details for each bucket
            // this.fetchBucketInfo(bucketsList.map<Number>((b) => b.id));

            console.log(IoTeXChainProvider.bucketsListToString(bucketsList));

            //await this.setCachedData(cacheKey, bucketsList);

            console.log("Buckets info fetched successfully.");
            return bucketsList;
        } catch (error) {
            console.error(`iotexProvider: Error fetching buckets: ${error}`);
            throw new Error("Failed to fetch buckets");
        }
    }

    static bucketsListToString(bucketsList) {
        if (!bucketsList || bucketsList.length === 0) {
            return "No staking buckets found.";
        }

        return bucketsList
            .map(
                (bucket, _) =>
                    `Bucket ${bucket.index}: ` +
                    `Staked=${ethers.formatUnits(bucket.stakedAmount, 18)} IOTX, ` +
                    `Duration=${bucket.stakedDuration} days, ` +
                    `Candidate=${bucket.candidateAddress}, ` +
                    `StakeLock=${bucket.autoStake}, ` +
                    `Owner=${bucket.owner}`
            )
            .join("\n");
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
export const initIoTeXProvider = async (runtime: IAgentRuntime) => {
    const contractAddress = runtime.getSetting(
        "IOTEX_STAKING_CONTRACT_ADDRESS"
    );
    const rpcUrl = runtime.getSetting("IOTEX_RPC_URL");

    if (!contractAddress || !rpcUrl) {
        throw new Error(
            "IOTEX_STAKING_CONTRACT_ADDRESS and IOTEX_RPC_URL are required"
        );
    }

    return new IoTeXChainProvider(
        rpcUrl,
        contractAddress,
        runtime.cacheManager
    );
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
            const provider = await initIoTeXProvider(runtime);
            const bucketIDs = (_message as any)?.content?.bucketIDs;

            if (!bucketIDs) {
                return "Bucket IDs are required to retrieve information.";
            }

            const bucketsInfo = await provider.fetchBucketInfo(bucketIDs);
            // Return all buckets info as a string
            return bucketsInfo
                .map((bucket) => {
                    return `Bucket #${bucket.id} Info:
                        - Owner: ${bucket.owner}
                        - Candidate: ${bucket.candidateAddress}
                        - Staked Amount: ${bucket.stakedAmount} IOTX
                        - Created At: ${bucket.createdAt}
                        - Auto Stake: ${bucket.autoStake ? "Yes" : "No"}`;
                }).join("\n");
        } catch (error) {
            console.error("Error in IoTeX Bucket provider:", error);
            return "Failed to retrieve bucket info.";
        }
    },
};
