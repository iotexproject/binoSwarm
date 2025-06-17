import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { MCPManager } from "../src/mcps";
import { Character } from "@elizaos/core";
import { experimental_createMCPClient as createMCPClient } from "ai";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "ai/mcp-stdio";

vi.mock("ai", () => ({
    experimental_createMCPClient: vi.fn(),
}));

vi.mock("ai/mcp-stdio", () => ({
    Experimental_StdioMCPTransport: vi.fn(),
}));

const mockCreateMCPClient = createMCPClient as any;
const mockStdioMCPTransport = StdioMCPTransport as any;

describe("MCPManager", () => {
    let mcpManager: MCPManager;
    let mockClient: any;
    let consoleLogSpy: any;
    let consoleErrorSpy: any;
    let consoleWarnSpy: any;

    beforeEach(() => {
        mcpManager = new MCPManager();
        mockClient = {
            tools: vi.fn(),
            close: vi.fn(),
        };
        mockCreateMCPClient.mockResolvedValue(mockClient);
        mockStdioMCPTransport.mockImplementation((config) => ({ config }));
        consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should initialize without MCP servers if not configured", async () => {
        const character = {} as Character;
        await mcpManager.initialize(character);
        expect(consoleLogSpy).toHaveBeenCalledWith(
            "No MCP servers configured for this character."
        );
        expect(mockCreateMCPClient).not.toHaveBeenCalled();
    });

    it("should initialize MCP clients from character configuration", async () => {
        const character = {
            mcpServers: {
                server1: { command: "node", args: ["server1.js"] },
                server2: { command: "python", args: ["server2.py"] },
            },
        } as unknown as Character;

        await mcpManager.initialize(character);

        expect(mockStdioMCPTransport).toHaveBeenCalledTimes(2);
        expect(mockStdioMCPTransport).toHaveBeenCalledWith({
            command: "node",
            args: ["server1.js"],
        });
        expect(mockStdioMCPTransport).toHaveBeenCalledWith({
            command: "python",
            args: ["server2.py"],
        });

        expect(mockCreateMCPClient).toHaveBeenCalledTimes(2);
        expect(consoleLogSpy).toHaveBeenCalledWith("server1 initialized");
        expect(consoleLogSpy).toHaveBeenCalledWith("server2 initialized");

        const tools = await mcpManager.getTools();
        expect(tools).toEqual({});
    });

    it("should initialize an SSE MCP client", async () => {
        const character = {
            mcpServers: {
                sseServer: { url: "https://example.com/sse" },
            },
        } as unknown as Character;

        await mcpManager.initialize(character);

        expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
        expect(mockCreateMCPClient).toHaveBeenCalledWith({
            transport: {
                type: "sse",
                url: "https://example.com/sse",
            },
        });
        expect(mockStdioMCPTransport).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith("sseServer initialized");
    });

    it("should warn and skip invalid MCP server configurations", async () => {
        const character = {
            mcpServers: {
                invalidServer: { someOtherProp: "value" },
            },
        } as unknown as Character;

        await mcpManager.initialize(character);

        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(consoleLogSpy).not.toHaveBeenCalledWith(
            "invalidServer initialized"
        );
        expect(mockCreateMCPClient).not.toHaveBeenCalled();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            "Invalid MCP server configuration for invalidServer. Skipping."
        );
        const tools = await mcpManager.getTools();
        expect(tools).toEqual({});
    });

    it("should handle errors during MCP client initialization", async () => {
        const error = new Error("Initialization failed");
        mockCreateMCPClient.mockRejectedValueOnce(error);

        const character = {
            mcpServers: {
                server1: { command: "node", args: ["server1.js"] },
            },
        } as unknown as Character;

        await mcpManager.initialize(character);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Failed to initialize MCP client for server1:",
            error
        );
    });

    it("should close all MCP clients", async () => {
        const character = {
            mcpServers: {
                server1: { command: "node", args: ["server1.js"] },
            },
        } as unknown as Character;

        await mcpManager.initialize(character);
        await mcpManager.close();

        expect(mockClient.close).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith("closing mcpClient");
        const tools = await mcpManager.getTools();
        expect(tools).toEqual({});
    });

    it("should get tools from all MCP clients", async () => {
        const mockClient1 = {
            tools: vi.fn().mockResolvedValue({ toolA: { description: "A" } }),
            close: vi.fn(),
        };
        const mockClient2 = {
            tools: vi.fn().mockResolvedValue({ toolB: { description: "B" } }),
            close: vi.fn(),
        };
        mockCreateMCPClient
            .mockResolvedValueOnce(mockClient1)
            .mockResolvedValueOnce(mockClient2);

        const character = {
            mcpServers: {
                server1: { command: "node", args: ["server1.js"] },
                server2: { command: "python", args: ["server2.py"] },
            },
        } as unknown as Character;

        await mcpManager.initialize(character);
        const tools = await mcpManager.getTools();

        expect(mockClient1.tools).toHaveBeenCalled();
        expect(mockClient2.tools).toHaveBeenCalled();
        expect(tools).toEqual({
            toolA: { description: "A" },
            toolB: { description: "B" },
        });
    });

    it("should handle tool name collisions by merging, with last client winning", async () => {
        const mockClient1 = {
            tools: vi.fn().mockResolvedValue({ toolA: { description: "A1" } }),
            close: vi.fn(),
        };
        const mockClient2 = {
            tools: vi.fn().mockResolvedValue({ toolA: { description: "A2" } }),
            close: vi.fn(),
        };
        mockCreateMCPClient
            .mockResolvedValueOnce(mockClient1)
            .mockResolvedValueOnce(mockClient2);

        const character = {
            mcpServers: {
                server1: { command: "node", args: ["server1.js"] },
                server2: { command: "python", args: ["server2.py"] },
            },
        } as unknown as Character;

        await mcpManager.initialize(character);
        const tools = await mcpManager.getTools();

        expect(tools).toEqual({
            toolA: { description: "A2" },
        });
    });
});
