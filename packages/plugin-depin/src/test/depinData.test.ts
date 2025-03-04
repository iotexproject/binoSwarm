import { describe, expect, it, vi, beforeEach } from "vitest";
import { depinDataProvider } from "../providers/depinData";
import { elizaLogger } from "@elizaos/core";
import { DepinScanMetrics, DepinScanProject } from "../types/depin";

vi.mock("@elizaos/core", async () => {
    const actual = await vi.importActual("@elizaos/core");
    return {
        ...actual,
        elizaLogger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
});

vi.mock("node-cache", () => {
    return {
        default: vi.fn().mockImplementation(() => {
            return {
                get: vi.fn(),
                set: vi.fn(),
                del: vi.fn(),
            };
        }),
    };
});

vi.mock("../services/quicksilver", () => ({
    getRawDataFromQuicksilver: vi.fn().mockImplementation((endpoint) => {
        if (endpoint === "depin-metrics") {
            return Promise.resolve([
                {
                    date: "2023-06-01",
                    total_projects: "123",
                    market_cap: "5000000000",
                    total_device: "500000",
                },
            ] as DepinScanMetrics);
        } else if (endpoint === "depin-projects") {
            return Promise.resolve([
                {
                    project_name: "Project A",
                    slug: "project-a",
                    token: "TKNA",
                    description: "Description for Project A",
                    layer_1: ["Ethereum", "Polygon"],
                    categories: ["Computing", "Storage"],
                    market_cap: "1000000000",
                    token_price: "2.5",
                    total_devices: "100000",
                    avg_device_cost: "500",
                    days_to_breakeven: "180",
                    estimated_daily_earnings: "2.75",
                    chainid: "1",
                    coingecko_id: "project-a",
                    fully_diluted_valuation: "1500000000",
                },
                {
                    project_name: "Project B",
                    slug: "project-b",
                    token: "TKNB",
                    description: "Description for Project B",
                    layer_1: ["Solana"],
                    categories: ["Wireless"],
                    market_cap: "500000000",
                    token_price: "1.2",
                    total_devices: "50000",
                    avg_device_cost: "300",
                    days_to_breakeven: "120",
                    estimated_daily_earnings: "2.5",
                    chainid: "2",
                    coingecko_id: "project-b",
                    fully_diluted_valuation: "750000000",
                },
            ] as DepinScanProject[]);
        }
        return Promise.reject(new Error("Unknown endpoint"));
    }),
}));

import { getRawDataFromQuicksilver } from "../services/quicksilver";

describe("DePINScanProvider", () => {
    let mockRuntime: any;
    let mockMessage: any;
    let mockState: any;
    let mockCacheManager: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCacheManager = {
            get: vi.fn().mockResolvedValue(undefined),
            set: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
        };

        mockRuntime = {
            getSetting: vi.fn(),
            cacheManager: mockCacheManager,
        };
        mockMessage = { content: { text: "test message" } };
        mockState = {};

        vi.spyOn(global.Math, "random").mockReturnValue(0);
    });

    describe("get", () => {
        it("should fetch and format DePIN data when not cached", async () => {
            mockCacheManager.get.mockResolvedValue(undefined);

            const result = await depinDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalled();

            expect(getRawDataFromQuicksilver).toHaveBeenCalledWith(
                "depin-metrics",
                { isLatest: true }
            );
            expect(getRawDataFromQuicksilver).toHaveBeenCalledWith(
                "depin-projects",
                {}
            );

            expect(mockCacheManager.set).toHaveBeenCalled();

            expect(result).toContain("DePINScan Daily Metrics");
            expect(result).toContain("**Date**: 2023-06-01");
            expect(result).toContain("**Total Projects**: 123");
            expect(result).toContain("**Market Cap**: 5.00B");
            expect(result).toContain("**Total Devices**: 500000");

            expect(result).toContain("DePINScan Random Project: Project A");
            expect(result).toContain("**Token**: TKNA");
            expect(result).toContain("**Layer 1**: Ethereum, Polygon");
            expect(result).toContain("**Categories**: Computing, Storage");
            expect(result).toContain("**Market Cap**: 1.00B");
        });

        it("should use cached DePIN data when available", async () => {
            const cachedMetrics: DepinScanMetrics = [
                {
                    date: "2023-06-01",
                    total_projects: "123",
                    market_cap: "5000000000",
                    total_device: "500000",
                },
            ];

            const cachedProjects: DepinScanProject[] = [
                {
                    project_name: "Project A",
                    slug: "project-a",
                    token: "TKNA",
                    description: "Description for Project A",
                    layer_1: ["Ethereum", "Polygon"],
                    categories: ["Computing", "Storage"],
                    market_cap: "1000000000",
                    token_price: "2.5",
                    total_devices: "100000",
                    avg_device_cost: "500",
                    days_to_breakeven: "180",
                    estimated_daily_earnings: "2.75",
                    chainid: "1",
                    coingecko_id: "project-a",
                    fully_diluted_valuation: "1500000000",
                },
            ];

            mockCacheManager.get.mockImplementation((key) => {
                if (key.includes("depinscanDailyMetrics")) {
                    return Promise.resolve(cachedMetrics);
                } else if (key.includes("depinscanProjects")) {
                    return Promise.resolve(cachedProjects);
                }
                return Promise.resolve(undefined);
            });

            const result = await depinDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalled();

            expect(getRawDataFromQuicksilver).not.toHaveBeenCalled();

            expect(result).toContain("DePINScan Daily Metrics");
            expect(result).toContain("**Date**: 2023-06-01");
            expect(result).toContain("DePINScan Random Project: Project A");
        });

        it("should handle cache errors gracefully", async () => {
            mockCacheManager.get.mockRejectedValue(new Error("Cache error"));

            const result = await depinDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(getRawDataFromQuicksilver).toHaveBeenCalled();
            expect(result).toContain("DePINScan Daily Metrics");
            expect(elizaLogger.error).toHaveBeenCalled();
        });

        it("should handle API errors", async () => {
            (getRawDataFromQuicksilver as any).mockRejectedValueOnce(
                new Error("API error")
            );

            const result = await depinDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(result).toBe("");
            expect(elizaLogger.error).toHaveBeenCalled();
        });
    });

    describe("formatting", () => {
        it("should abbreviate large numbers correctly", async () => {
            const result = await depinDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(result).toContain("**Market Cap**: 5.00B");
            expect(result).toContain("**Market Cap**: 1.00B");
        });

        it("should format project data correctly", async () => {
            const result = await depinDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(result).toContain("DePINScan Random Project: Project A");
            expect(result).toContain("**Token**: TKNA");
            expect(result).toContain("**Description**: Description for Project A");
            expect(result).toContain("**Layer 1**: Ethereum, Polygon");
            expect(result).toContain("**Categories**: Computing, Storage");
            expect(result).toContain("**Token Price**: 2.5");
            expect(result).toContain("**Total Devices**: 100000");
            expect(result).toContain("**Average Device Cost**: 500");
            expect(result).toContain("**Days to Breakeven**: 180");
            expect(result).toContain("**Estimated Daily Earnings**: 2.75");
            expect(result).toContain("**Chain ID**: 1");
            expect(result).toContain("**CoinGecko ID**: project-a");
            expect(result).toContain("**Fully Diluted Valuation**: 1.50B");
        });

        it("should format metrics data correctly", async () => {
            const result = await depinDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(result).toContain("DePINScan Daily Metrics");
            expect(result).toContain("**Date**: 2023-06-01");
            expect(result).toContain("**Total Projects**: 123");
            expect(result).toContain("**Market Cap**: 5.00B");
            expect(result).toContain("**Total Devices**: 500000");
        });
    });
});
