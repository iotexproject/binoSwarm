import {
    type IAgentRuntime,
    type Provider,
    type Memory,
    type State,
    elizaLogger,
    ICacheManager,
} from "@elizaos/core";
import NodeCache from "node-cache";
import * as path from "path";

import { getRawDataFromQuicksilver } from "../services/quicksilver";
import type { DepinScanMetrics, DepinScanProject } from "../types/depin";

export class DePINScanProvider {
    private cache: NodeCache;
    private cacheKey: string = "depin/metrics";

    constructor(private cacheManager: ICacheManager) {
        this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hour
    }

    private async readFromCache<T>(key: string): Promise<T | null> {
        const cached = await this.cacheManager.get<T>(
            path.join(this.cacheKey, key)
        );
        return cached;
    }

    private async writeToCache<T>(key: string, data: T): Promise<void> {
        await this.cacheManager.set(path.join(this.cacheKey, key), data, {
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        });
    }

    private async getCachedData<T>(key: string): Promise<T | null> {
        try {
            const cachedData = this.cache.get<T>(key);
            if (cachedData) {
                return cachedData;
            }

            const fileCachedData = await this.readFromCache<T>(key);
            if (fileCachedData) {
                this.cache.set(key, fileCachedData);
                return fileCachedData;
            }

            return null;
        } catch (error) {
            elizaLogger.error(
                `Error retrieving cached data for key ${key}:`,
                error
            );
            return null;
        }
    }

    private async setCachedData<T>(cacheKey: string, data: T): Promise<void> {
        this.cache.set(cacheKey, data);

        await this.writeToCache(cacheKey, data);
    }

    private async fetchDepinscanMetrics(): Promise<DepinScanMetrics> {
        return getRawDataFromQuicksilver("depin-metrics", { isLatest: true });
    }

    private async fetchDepinscanProjects(): Promise<DepinScanProject[]> {
        return getRawDataFromQuicksilver("depin-projects", {});
    }

    async getDailyMetrics(): Promise<DepinScanMetrics> {
        const cacheKey = "depinscanDailyMetrics";
        const cachedData = await this.getCachedData<DepinScanMetrics>(cacheKey);
        if (cachedData) {
            console.log("Returning cached DePINScan daily metrics");
            return cachedData;
        }

        const metrics = await this.fetchDepinscanMetrics();

        this.setCachedData<DepinScanMetrics>(cacheKey, metrics);
        console.log("DePIN daily metrics cached");

        return metrics;
    }

    private abbreviateNumber = (
        value: string | number | bigint | undefined
    ): string => {
        if (value === undefined || value === null) return "";

        let num: number;

        if (typeof value === "bigint") {
            // Convert bigint to number safely for processing
            num = Number(value);
        } else if (typeof value === "number") {
            num = value;
        } else if (typeof value === "string") {
            num = parseFloat(value);
        } else {
            return "";
        }

        if (isNaN(num)) return value.toString();
        if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
        return num.toString();
    };

    private parseProjects(projects: DepinScanProject[]): DepinScanProject[] {
        return projects;
    }

    async getProjects(): Promise<DepinScanProject[]> {
        const cacheKey = "depinscanProjects";
        const cachedData =
            await this.getCachedData<DepinScanProject[]>(cacheKey);
        if (cachedData) {
            console.log("Returning cached DePINScan projects");
            return cachedData;
        }

        const projects = await this.fetchDepinscanProjects();
        const parsedProjects = this.parseProjects(projects);

        this.setCachedData<DepinScanProject[]>(cacheKey, parsedProjects);
        console.log("DePINScan projects cached");

        return parsedProjects;
    }

    formatProject(project: DepinScanProject): string {
        return `## DePINScan Random Project: ${project.project_name}

- **Token**: ${project.token || "N/A"}
- **Description**: ${project.description || "N/A"}
- **Layer 1**: ${project.layer_1 ? project.layer_1.join(", ") : "N/A"}
- **Categories**: ${project.categories ? project.categories.join(", ") : "N/A"}
- **Market Cap**: ${this.abbreviateNumber(project.market_cap?.toString()) || "N/A"}
- **Token Price**: ${project.token_price?.toString() || "N/A"}
- **Total Devices**: ${project.total_devices?.toString() || "N/A"}
- **Average Device Cost**: ${project.avg_device_cost?.toString() || "N/A"}
- **Days to Breakeven**: ${project.days_to_breakeven?.toString() || "N/A"}
- **Estimated Daily Earnings**: ${project.estimated_daily_earnings?.toString() || "N/A"}
- **Chain ID**: ${project.chainid?.toString() || "N/A"}
- **CoinGecko ID**: ${project.coingecko_id?.toString() || "N/A"}
- **Fully Diluted Valuation**: ${this.abbreviateNumber(project.fully_diluted_valuation?.toString()) || "N/A"}
`;
    }

    formatMetrics(metrics: DepinScanMetrics): string {
        return `## DePINScan Daily Metrics

- **Date**: ${metrics[0].date || "N/A"}
- **Total Projects**: ${metrics[0].total_projects || "N/A"}
- **Market Cap**: ${this.abbreviateNumber(metrics[0].market_cap) || "N/A"}
- **Total Devices**: ${metrics[0].total_device || "N/A"}
`;
    }
}

export const depinDataProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string> {
        try {
            const depinscan = new DePINScanProvider(runtime.cacheManager);
            const depinscanMetrics = await depinscan.getDailyMetrics();
            const depinscanProjects = await depinscan.getProjects();

            const randomProject =
                depinscanProjects[
                    Math.floor(Math.random() * depinscanProjects.length)
                ];

            const metricsFormatted = depinscan.formatMetrics(depinscanMetrics);

            const projectFormatted = depinscan.formatProject(randomProject);

            return `
            ${metricsFormatted}
            ${projectFormatted}
            `;
        } catch (error) {
            elizaLogger.error("Error in DePIN data provider:", error.message);
            return "";
        }
    },
};
