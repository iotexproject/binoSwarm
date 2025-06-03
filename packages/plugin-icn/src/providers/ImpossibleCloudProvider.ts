import axios from "axios";
import { ICNNetworkStatsResponse } from "../types";
import { z } from "zod";
import type {
    IAgentRuntime,
    Memory,
    Provider,
    State,
    ICacheManager,
} from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";
import * as path from "path";

const ICNCapacitySchema = z.record(z.string(), z.number());
const ICNNodeLocationSchema = z.record(z.string(), z.number());

const ICNDataSchema = z.object({
    totalCapacity: ICNCapacitySchema,
    bookedCapacity: ICNCapacitySchema,
    hardwareProvidersCount: z.number(),
    hyperNodesCount: z.number(),
    scalerNodesCount: z.number(),
    hyperNodesLocation: ICNNodeLocationSchema,
    scalerNodesLocation: ICNNodeLocationSchema,
    ICNLStaked: z.number(),
    ICNTStaked: z.number(),
    ICNLCount: z.number(),
    TVLTotal: z.string(), // Represented as a string in the API response
});

const ICNNetworkStatsResponseSchema = z.object({
    $schema: z.string(),
    data: ICNDataSchema,
});

class ImpossibleCloudProvider {
    private cacheKey: string = "icn/network-stats";
    private CACHE_EXPIRY_SEC = 5 * 60; // 5 minutes

    constructor(private cacheManager: ICacheManager) {}

    private async getCachedData<T>(key: string): Promise<T | null> {
        const cached = await this.cacheManager.get<T>(
            path.join(this.cacheKey, key)
        );
        return cached;
    }

    private async setCachedData<T>(key: string, data: T): Promise<void> {
        await this.cacheManager.set(path.join(this.cacheKey, key), data, {
            expires: Date.now() + this.CACHE_EXPIRY_SEC * 1000,
        });
    }

    public async getNetworkStats(): Promise<ICNNetworkStatsResponse> {
        const cacheKey = "network-stats";

        // Check cache first
        const cachedData =
            await this.getCachedData<ICNNetworkStatsResponse>(cacheKey);
        if (cachedData) {
            elizaLogger.info(
                "Returning cached Impossible Cloud network stats."
            );
            return cachedData;
        }

        const apiUrlToUse = process.env.ICN_API_URL;

        if (!apiUrlToUse) {
            throw new Error("ICN_API_URL environment variable is not set.");
        }

        try {
            const response = await axios.get<unknown>(apiUrlToUse);

            const validationResult = ICNNetworkStatsResponseSchema.safeParse(
                response.data
            );

            if (!validationResult.success) {
                elizaLogger.error(
                    "Invalid data structure received from Impossible Cloud API:",
                    validationResult.error.errors
                );
                throw new Error(
                    `Invalid data structure received from Impossible Cloud API: ${validationResult.error.message}`
                );
            }

            const validatedData =
                validationResult.data as ICNNetworkStatsResponse;

            await this.setCachedData(cacheKey, validatedData);
            elizaLogger.info(
                "Fetched and cached Impossible Cloud network stats."
            );
            return validatedData;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                elizaLogger.error(
                    "Error fetching Impossible Cloud network stats:",
                    error.toJSON()
                );
                throw new Error(
                    `Failed to fetch network stats from Impossible Cloud API: ${error.message}`
                );
            } else if (error instanceof z.ZodError) {
                elizaLogger.error(
                    "Zod validation error during fetch:",
                    error.errors
                );
                throw new Error(
                    `Data validation failed after fetch: ${error.message}`
                );
            } else {
                elizaLogger.error("An unexpected error occurred:", error);
                throw new Error(
                    "An unexpected error occurred while fetching network stats."
                );
            }
        }
    }
}

export const icnProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string> {
        try {
            const provider = new ImpossibleCloudProvider(runtime.cacheManager);
            const stats = await provider.getNetworkStats();

            return `Impossible Cloud Network Statistics:
- Total Capacity: ${JSON.stringify(stats.data.totalCapacity)}
- Booked Capacity: ${JSON.stringify(stats.data.bookedCapacity)}
- Hardware Providers: ${stats.data.hardwareProvidersCount}
- Hyper Nodes: ${stats.data.hyperNodesCount}
- Scaler Nodes: ${stats.data.scalerNodesCount}
- Hyper Node Locations: ${JSON.stringify(stats.data.hyperNodesLocation)}
- Scaler Node Locations: ${JSON.stringify(stats.data.scalerNodesLocation)}
- ICNL Staked: ${stats.data.ICNLStaked}
- ICNT Staked: ${stats.data.ICNTStaked}
- ICNL Count: ${stats.data.ICNLCount}
- TVL Total: ${stats.data.TVLTotal}`;
        } catch (error) {
            elizaLogger.error("Error in Impossible Cloud provider:", error);
            return null;
        }
    },
};
