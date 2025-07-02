import { describe, it, expect, vi, beforeEach } from "vitest";
import { callAgent } from "../src/lib/callAgent";

// Mock dependencies
vi.mock("viem", () => ({
    http: vi.fn(),
    createWalletClient: vi.fn(),
    walletActions: {},
    privateKeyToAccount: vi.fn(),
}));

vi.mock("viem/chains", () => ({
    iotex: {
        rpcUrls: {
            default: {
                http: ["https://babel-api.mainnet.iotex.io"],
            },
        },
    },
}));

vi.mock("viem/accounts", () => ({
    privateKeyToAccount: vi.fn(),
}));

vi.mock("x402-fetch", () => ({
    wrapFetchWithPayment: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
    elizaLogger: {
        info: vi.fn(),
    },
    getEnvVariable: vi.fn(),
}));

import { http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
import { elizaLogger, getEnvVariable } from "@elizaos/core";

describe("callAgent", () => {
    const mockWalletClient = {
        extend: vi.fn().mockReturnThis(),
    };
    const mockFetchWithPayment = vi.fn();
    const mockAccount = { address: "0x123" };

    beforeEach(() => {
        vi.clearAllMocks();

        (getEnvVariable as any).mockReturnValue("0x1234567890abcdef");
        (privateKeyToAccount as any).mockReturnValue(mockAccount);
        (http as any).mockReturnValue("mock-transport");
        (createWalletClient as any).mockReturnValue(mockWalletClient);
        (wrapFetchWithPayment as any).mockReturnValue(mockFetchWithPayment);
    });

    it("should successfully call agent and stream data", async () => {
        const mockResponse = {
            ok: true,
            body: {
                getReader: () => ({
                    read: vi
                        .fn()
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode(
                                "data: first message\n"
                            ),
                        })
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode(
                                "data: second message\n"
                            ),
                        })
                        .mockResolvedValueOnce({
                            done: true,
                            value: undefined,
                        }),
                }),
            },
        };

        mockFetchWithPayment.mockResolvedValue(mockResponse);

        const onDataMock = vi.fn();
        const agentUrl = "https://test-agent.com";
        const message = "Hello, agent!";

        await callAgent(agentUrl, message, onDataMock);

        expect(mockFetchWithPayment).toHaveBeenCalledWith(
            `${agentUrl}/message-paid`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: message,
                }),
            }
        );

        expect(onDataMock).toHaveBeenCalledTimes(2);
        expect(onDataMock).toHaveBeenNthCalledWith(1, "first message");
        expect(onDataMock).toHaveBeenNthCalledWith(2, "second message");
        expect(elizaLogger.info).toHaveBeenCalledWith(
            "response:",
            mockResponse
        );
    });

    it("should throw error when EVM_PRIVATE_KEY is not set", async () => {
        (getEnvVariable as any).mockReturnValue(null);

        await expect(
            callAgent("https://test.com", "message", vi.fn())
        ).rejects.toThrow("EVM_PRIVATE_KEY environment variable not set.");
    });

    it("should throw error when response is not ok", async () => {
        const mockResponse = {
            ok: false,
            status: 400,
            text: vi.fn().mockResolvedValue("Bad Request"),
        };

        mockFetchWithPayment.mockResolvedValue(mockResponse);

        await expect(
            callAgent("https://test.com", "message", vi.fn())
        ).rejects.toThrow(
            "Request to https://test.com/message-paid failed with status 400: Bad Request"
        );
    });

    it("should throw error when response body is null", async () => {
        const mockResponse = {
            ok: true,
            body: null,
        };

        mockFetchWithPayment.mockResolvedValue(mockResponse);

        await expect(
            callAgent("https://test.com", "message", vi.fn())
        ).rejects.toThrow("Response body is null");
    });

    it("should handle partial data chunks correctly", async () => {
        const mockResponse = {
            ok: true,
            body: {
                getReader: () => ({
                    read: vi
                        .fn()
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode("data: partial"),
                        })
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode(
                                " message\ndata: complete message\n"
                            ),
                        })
                        .mockResolvedValueOnce({
                            done: true,
                            value: undefined,
                        }),
                }),
            },
        };

        mockFetchWithPayment.mockResolvedValue(mockResponse);

        const onDataMock = vi.fn();

        await callAgent("https://test.com", "message", onDataMock);

        expect(onDataMock).toHaveBeenCalledTimes(2);
        expect(onDataMock).toHaveBeenNthCalledWith(1, "partial message");
        expect(onDataMock).toHaveBeenNthCalledWith(2, "complete message");
    });

    it("should ignore empty data lines", async () => {
        const mockResponse = {
            ok: true,
            body: {
                getReader: () => ({
                    read: vi
                        .fn()
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode(
                                "data: \ndata: valid message\ndata:    \n"
                            ),
                        })
                        .mockResolvedValueOnce({
                            done: true,
                            value: undefined,
                        }),
                }),
            },
        };

        mockFetchWithPayment.mockResolvedValue(mockResponse);

        const onDataMock = vi.fn();

        await callAgent("https://test.com", "message", onDataMock);

        expect(onDataMock).toHaveBeenCalledTimes(1);
        expect(onDataMock).toHaveBeenCalledWith("valid message");
    });

    it("should ignore non-data lines", async () => {
        const mockResponse = {
            ok: true,
            body: {
                getReader: () => ({
                    read: vi
                        .fn()
                        .mockResolvedValueOnce({
                            done: false,
                            value: new TextEncoder().encode(
                                "event: start\ndata: message\nid: 123\n"
                            ),
                        })
                        .mockResolvedValueOnce({
                            done: true,
                            value: undefined,
                        }),
                }),
            },
        };

        mockFetchWithPayment.mockResolvedValue(mockResponse);

        const onDataMock = vi.fn();

        await callAgent("https://test.com", "message", onDataMock);

        expect(onDataMock).toHaveBeenCalledTimes(1);
        expect(onDataMock).toHaveBeenCalledWith("message");
    });

    it("should properly setup wallet client", async () => {
        const mockResponse = {
            ok: true,
            body: {
                getReader: () => ({
                    read: vi.fn().mockResolvedValue({ done: true }),
                }),
            },
        };

        mockFetchWithPayment.mockResolvedValue(mockResponse);

        await callAgent("https://test.com", "message", vi.fn());

        expect(getEnvVariable).toHaveBeenCalledWith("EVM_PRIVATE_KEY");
        expect(privateKeyToAccount).toHaveBeenCalledWith("0x1234567890abcdef");
        expect(http).toHaveBeenCalledWith("https://babel-api.mainnet.iotex.io");
        expect(createWalletClient).toHaveBeenCalledWith({
            chain: expect.any(Object),
            transport: "mock-transport",
            account: mockAccount,
        });
        expect(mockWalletClient.extend).toHaveBeenCalled();
        expect(wrapFetchWithPayment).toHaveBeenCalledWith(
            fetch,
            mockWalletClient
        );
    });
});
