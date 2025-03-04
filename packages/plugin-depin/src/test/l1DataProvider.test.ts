import { describe, expect, it, vi, beforeEach } from "vitest";
import { l1DataProvider } from "../providers/l1DataProvider";
import { elizaLogger } from "@elizaos/core";

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

vi.mock("../services/quicksilver", () => ({
    getRawDataFromQuicksilver: vi.fn().mockImplementation((endpoint) => {
        if (endpoint === "l1data") {
            return Promise.resolve({
                tvl: 123456789,
                contracts: 5678,
                totalStaked: 98765432.12345,
                nodes: 123,
                dapps: 456,
                crossChainTx: 78901,
                totalSupply: 10000000000,
                totalNumberOfHolders: 123456,
                totalNumberOfXrc20: 789,
                totalNumberOfXrc721: 234,
                stakingRatio: 0.3456,
                tps: 12.3456,
            });
        }
        return Promise.reject(new Error("Unknown endpoint"));
    }),
}));

import { getRawDataFromQuicksilver } from "../services/quicksilver";

describe("L1DataProvider", () => {
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
    });

    describe("get", () => {
        it("should fetch and format L1 data when not cached", async () => {
            mockCacheManager.get.mockResolvedValue(undefined);

            const result = await l1DataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalledWith("l1/stats");

            expect(getRawDataFromQuicksilver).toHaveBeenCalledWith(
                "l1data",
                {}
            );

            expect(mockCacheManager.set).toHaveBeenCalledTimes(1);
            expect(mockCacheManager.set).toHaveBeenCalledWith(
                "l1/stats",
                expect.any(Object),
                expect.any(Object)
            );

            expect(result).toContain("IoTeX L1 Blockchain Statistics");
            expect(result).toContain("Total Value Locked (TVL)");
            expect(result).toContain("123,456,789 IOTX");
            expect(result).toContain("**Total Staked**: 98,765,432.12 IOTX");
            expect(result).toContain("**Staking Ratio**: 34.56%");
            expect(result).toContain("**Transactions Per Second**: 12.3456");
        });

        it("should use cached L1 data when available", async () => {
            const cachedL1Data = {
                tvl: 123456789,
                contracts: 5678,
                totalStaked: 98765432.12345,
                nodes: 123,
                dapps: 456,
                crossChainTx: 78901,
                totalSupply: 10000000000,
                totalNumberOfHolders: 123456,
                totalNumberOfXrc20: 789,
                totalNumberOfXrc721: 234,
                stakingRatio: 0.3456,
                tps: 12.3456,
            };

            mockCacheManager.get.mockResolvedValue(cachedL1Data);

            const result = await l1DataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalledWith("l1/stats");

            expect(getRawDataFromQuicksilver).not.toHaveBeenCalled();

            expect(mockCacheManager.set).not.toHaveBeenCalled();

            expect(result).toContain("L1 Blockchain Statistics");
            expect(result).toContain("Total Value Locked (TVL)");
            expect(result).toContain("123,456,789 IOTX");
        });

        it("should handle cache errors gracefully", async () => {
            mockCacheManager.get.mockRejectedValue(new Error("Cache error"));

            const result = await l1DataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(getRawDataFromQuicksilver).toHaveBeenCalled();
            expect(result).toContain("L1 Blockchain Statistics");
            expect(elizaLogger.error).toHaveBeenCalled();
        });

        it("should handle API errors", async () => {
            (getRawDataFromQuicksilver as any).mockRejectedValueOnce(
                new Error("API error")
            );

            const result = await l1DataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(result).toBe("");
            expect(elizaLogger.error).toHaveBeenCalled();
        });

        it("should handle validation errors", async () => {
            (getRawDataFromQuicksilver as any).mockResolvedValueOnce({
                tvl: 123456789,
                contracts: 5678,
            });

            const result = await l1DataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(result).toBe("");
            expect(elizaLogger.error).toHaveBeenCalled();
        });
    });
});
