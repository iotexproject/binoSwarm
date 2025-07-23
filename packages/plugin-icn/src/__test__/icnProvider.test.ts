import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import { elizaLogger } from "@elizaos/core";
import type { ICacheManager, IAgentRuntime, Memory } from "@elizaos/core";
import { icnProvider } from "../providers/ImpossibleCloudProvider";

vi.mock("axios");
vi.mock("@elizaos/core", async () => {
    const actual = await vi.importActual("@elizaos/core");
    return {
        ...actual,
        elizaLogger: {
            info: vi.fn(),
            error: vi.fn(),
        },
    };
});

describe("ImpossibleCloudProvider", () => {
    let mockCacheManager: ICacheManager;
    let mockRuntime: IAgentRuntime;
    let originalEnv: string | undefined;

    const validApiResponse = {
        $schema: "test-schema",
        data: {
            hardwareProvidersCount: 3,
            hyperNodesCount: 1,
            scalerNodesCount: 2,
            hyperNodesLocation: {
                ARE: 1,
                AUS: 2,
            },
            scalerNodesLocation: {
                DEU: 1,
                DNK: 2,
            },
            ICNLStaked: 31,
            ICNTStaked: "100000000000000000000000000",
            ICNLCount: 3,
            TVLTotal: "100000000000000000000000000",
            totalCapacity: "100000000000000000000000000",
            bookedCapacity: "0",
            totalUnlocked: "188300000000000000000000000",
            minStakePeriod: "P1D",
            maxICNTEfficiency: "100000000000000000000000000",
        },
    };

    beforeEach(() => {
        originalEnv = process.env.ICN_API_URL;
        process.env.ICN_API_URL = "https://api.test.com/stats";

        mockCacheManager = {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        } as ICacheManager;

        mockRuntime = {
            cacheManager: mockCacheManager,
        } as IAgentRuntime;

        vi.clearAllMocks();
    });

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.ICN_API_URL = originalEnv;
        } else {
            delete process.env.ICN_API_URL;
        }
    });

    describe("getNetworkStats", () => {
        it("should fetch and return valid network stats", async () => {
            vi.mocked(axios.get).mockResolvedValueOnce({
                data: validApiResponse,
            });

            const result = await icnProvider.get(mockRuntime, {} as Memory);

            expect(axios.get).toHaveBeenCalledWith(
                "https://api.test.com/stats"
            );
            expect(result).toContain("Impossible Cloud Network Statistics:");
            expect(result).toContain("Hardware Providers: 3");
            expect(result).toContain("Hyper Nodes: 1");
            expect(result).toContain("Scaler Nodes: 2");
            expect(result).toContain("ICNL Staked: 31");
            expect(result).toContain(
                "ICNT Staked: 100000000000000000000000000"
            );
            expect(result).toContain("TVL Total: 100000000000000000000000000");
            expect(result).toContain(
                "Total Capacity: 100000000000000000000000000"
            );
            expect(result).toContain("Booked Capacity: 0");
            expect(result).toContain(
                "Total Unlocked: 188300000000000000000000000"
            );
            expect(result).toContain("Min Stake Period: P1D");
            expect(result).toContain(
                "Max ICNTEfficiency: 100000000000000000000000000"
            );
        });

        it("should throw error when ICN_API_URL is not set", async () => {
            delete process.env.ICN_API_URL;

            const result = await icnProvider.get(mockRuntime, {} as Memory);

            expect(result).toBeNull();
            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error in Impossible Cloud provider:",
                expect.any(Error)
            );
        });

        it("should handle axios errors gracefully", async () => {
            const axiosError = {
                isAxiosError: true,
                message: "Network error",
                toJSON: () => ({ message: "Network error" }),
            };
            vi.mocked(axios.get).mockRejectedValueOnce(axiosError);
            vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);

            const result = await icnProvider.get(mockRuntime, {} as Memory);

            expect(result).toBeNull();
            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error in Impossible Cloud provider:",
                expect.any(Error)
            );
        });

        it("should handle invalid API response structure", async () => {
            const invalidResponse = {
                data: {
                    invalidField: "invalid",
                },
            };
            vi.mocked(axios.get).mockResolvedValueOnce(invalidResponse);

            const result = await icnProvider.get(mockRuntime, {} as Memory);

            expect(result).toBeNull();
            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error in Impossible Cloud provider:",
                expect.any(Error)
            );
        });

        it("should handle missing required fields in API response", async () => {
            const incompleteResponse = {
                $schema: "test-schema",
                data: {
                    totalCapacity: { cpu: 100 },
                    // Missing required fields
                },
            };
            vi.mocked(axios.get).mockResolvedValueOnce({
                data: incompleteResponse,
            });

            const result = await icnProvider.get(mockRuntime, {} as Memory);

            expect(result).toBeNull();
            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error in Impossible Cloud provider:",
                expect.any(Error)
            );
        });

        it("should handle unexpected errors", async () => {
            const unexpectedError = new Error("Unexpected error");
            vi.mocked(axios.get).mockRejectedValueOnce(unexpectedError);
            vi.mocked(axios.isAxiosError).mockReturnValueOnce(false);

            const result = await icnProvider.get(mockRuntime, {} as Memory);

            expect(result).toBeNull();
            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error in Impossible Cloud provider:",
                expect.any(Error)
            );
        });

        it("should format output correctly with valid data", async () => {
            vi.mocked(axios.get).mockResolvedValueOnce({
                data: validApiResponse,
            });

            const result = await icnProvider.get(mockRuntime, {} as Memory);

            expect(result).toContain(
                "Total Capacity: 100000000000000000000000000"
            );
            expect(result).toContain("Booked Capacity: 0");
            expect(result).toContain('Hyper Node Locations: {"ARE":1,"AUS":2}');
            expect(result).toContain(
                'Scaler Node Locations: {"DEU":1,"DNK":2}'
            );
            expect(result).toContain("ICNL Count: 3");
            expect(result).toContain(
                "Total Unlocked: 188300000000000000000000000"
            );
            expect(result).toContain("Min Stake Period: P1D");
            expect(result).toContain(
                "Max ICNTEfficiency: 100000000000000000000000000"
            );
        });
    });

    describe("data validation", () => {
        it("should accept valid response with all required fields", async () => {
            vi.mocked(axios.get).mockResolvedValueOnce({
                data: validApiResponse,
            });

            const result = await icnProvider.get(mockRuntime, {} as Memory);

            expect(result).not.toBeNull();
            expect(axios.get).toHaveBeenCalledTimes(1);
        });

        it("should reject response with invalid field types", async () => {
            const invalidTypeResponse = {
                ...validApiResponse,
                data: {
                    ...validApiResponse.data,
                    hardwareProvidersCount: "invalid", // Should be number
                },
            };
            vi.mocked(axios.get).mockResolvedValueOnce({
                data: invalidTypeResponse,
            });

            const result = await icnProvider.get(mockRuntime, {} as Memory);

            expect(result).toBeNull();
            expect(elizaLogger.error).toHaveBeenCalledWith(
                "Error in Impossible Cloud provider:",
                expect.any(Error)
            );
        });
    });
});
