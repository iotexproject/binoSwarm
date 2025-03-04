import {
    IAgentRuntime,
    Memory,
    State,
    Provider,
    elizaLogger,
    ICacheManager,
} from "@elizaos/core";
import { z } from "zod";
import { getRawDataFromQuicksilver } from "../services/quicksilver";

const L1StatsSchema = z.object({
    tvl: z.number().describe("Total Value Locked in the chain"),
    contracts: z.number().describe("Number of deployed contracts"),
    totalStaked: z.number().describe("Total amount of IOTX staked"),
    nodes: z.number().describe("Number of active nodes"),
    dapps: z.number().describe("Number of decentralized applications"),
    crossChainTx: z.number().describe("Number of cross-chain transactions"),
    totalSupply: z.number().describe("Total supply of IOTX tokens"),
    totalNumberOfHolders: z.number().describe("Total number of IOTX holders"),
    totalNumberOfXrc20: z.number().describe("Total number of XRC20 tokens"),
    totalNumberOfXrc721: z.number().describe("Total number of XRC721 tokens"),
    stakingRatio: z.number().describe("Ratio of staked IOTX to total supply"),
    tps: z.number().describe("Transactions per second"),
});

type L1Stats = z.infer<typeof L1StatsSchema>;

class L1DataProvider implements Provider {
    private cacheManager: ICacheManager;
    private readonly L1_CACHE_KEY = "l1/stats";
    private readonly L1_CACHE_TTL = 60 * 60; // 1 hour in seconds

    constructor(runtime: IAgentRuntime) {
        this.cacheManager = runtime.cacheManager;
    }

    private async readFromCache<T>(key: string): Promise<T | null> {
        try {
            const cached = await this.cacheManager.get<T>(key);
            return cached;
        } catch (error) {
            elizaLogger.error(
                `Error reading from cache for key ${key}:`,
                error
            );
            return null;
        }
    }

    private async writeToCache<T>(
        key: string,
        data: T,
        ttl?: number
    ): Promise<void> {
        try {
            const options = ttl
                ? { expires: Date.now() + ttl * 1000 }
                : undefined;
            await this.cacheManager.set(key, data, options);
        } catch (error) {
            elizaLogger.error(`Error writing to cache for key ${key}:`, error);
        }
    }

    private async fetchL1Data(): Promise<L1Stats> {
        elizaLogger.info("Fetching L1 blockchain statistics from Quicksilver");

        const l1Data = await getRawDataFromQuicksilver("l1data", {});

        try {
            return L1StatsSchema.parse(l1Data);
        } catch (error) {
            elizaLogger.error("Error validating L1 data:", error);
            throw new Error("Invalid L1 data format received");
        }
    }

    private formatL1Data(stats: L1Stats): string {
        return `## IoTeX L1 Blockchain Statistics

- **Total Value Locked (TVL)**: ${stats.tvl.toLocaleString()} IOTX
- **Contracts Deployed**: ${stats.contracts.toLocaleString()}
- **Total Staked**: ${Number(stats.totalStaked.toFixed(2)).toLocaleString()} IOTX
- **Active Nodes**: ${stats.nodes.toLocaleString()}
- **Decentralized Applications**: ${stats.dapps.toLocaleString()}
- **Cross-Chain Transactions**: ${stats.crossChainTx.toLocaleString()}
- **Total Supply**: ${stats.totalSupply.toLocaleString()} IOTX
- **Total Holders**: ${stats.totalNumberOfHolders.toLocaleString()}
- **XRC20 Tokens**: ${stats.totalNumberOfXrc20.toLocaleString()}
- **XRC721 Tokens**: ${stats.totalNumberOfXrc721.toLocaleString()}
- **Staking Ratio**: ${Number((stats.stakingRatio * 100).toFixed(2))}%
- **Transactions Per Second**: ${Number(stats.tps.toFixed(4))}
`;
    }

    async get(
        _runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string> {
        try {
            const cachedL1Data = await this.readFromCache<L1Stats>(
                this.L1_CACHE_KEY
            );

            let l1Data: L1Stats;

            if (cachedL1Data) {
                elizaLogger.info("Using cached L1 blockchain statistics");
                l1Data = cachedL1Data;
            } else {
                l1Data = await this.fetchL1Data();

                await this.writeToCache(
                    this.L1_CACHE_KEY,
                    l1Data,
                    this.L1_CACHE_TTL
                );
            }

            return this.formatL1Data(l1Data);
        } catch (error) {
            elizaLogger.error(
                "Error fetching L1 blockchain statistics:",
                error
            );
            return "";
        }
    }
}

export const l1DataProvider = {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string> {
        return new L1DataProvider(runtime).get(runtime, message, state);
    },
};
