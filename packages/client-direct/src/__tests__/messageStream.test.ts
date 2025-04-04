import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";

import { AgentRuntime } from "@elizaos/core";

import { DirectClient } from "..";
import { buildAgentRuntimeMock } from "./mocks";

vi.mock("@elizaos/core", async () => {
    const actual = await vi.importActual("@elizaos/core");
    return {
        ...actual,
        elizaLogger: {
            log: vi.fn(),
            success: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
        },
        streamWithTools: vi.fn().mockReturnValue({
            pipeDataStreamToResponse: vi.fn().mockImplementation((res) => {
                // First message
                res.write('f:{"messageId":"msg-xok4SDg8pH9X53dWSIM7tIBs"}\n');
                res.write('0:"I\'ll "\n');
                res.write('0:"check the "\n');
                res.write('0:"current weather in New York "\n');
                res.write('0:"for you using "\n');
                res.write('0:"the "\n');
                res.write('0:"Quicksilver "\n');

                // Tool call
                res.write(
                    '9:{"toolCallId":"toolu_01EEA1i78cYL4xSbhKrUfgvj","toolName":"quicksilver","args":{"expert_roundtable":"weather","question":"What is the current weather in New York City on April 4, 2025?"}}\n'
                );

                // Tool result
                res.write(
                    'a:{"toolCallId":"toolu_01EEA1i78cYL4xSbhKrUfgvj","result":"# Current Weather in New York City (April 4, 2025)\\n\\nBased on the latest DePIN weather data for New York City, here\'s the current weather information:\\n\\n**Temperature:** 15.17°C (59.3°F)\\n**Condition:** Light rain\\n**Humidity:** 80%\\n**Wind Speed:** 1.54 m/s (light breeze)\\n**Pressure:** 1018 hPa\\n**Rain:** 0.49 mm of precipitation\\n\\nIt\'s currently a mild spring day in New York City with light rain. The temperature feels like 14.83°C (58.7°F) due to the humidity and wind conditions. You might want to bring an umbrella if you\'re heading out!"}\n'
                );

                res.write('0:"tool."\n');
                res.write(
                    'e:{"finishReason":"tool-calls","usage":{"promptTokens":2812,"completionTokens":111},"isContinued":false}\n'
                );

                // Second message
                res.write('f:{"messageId":"msg-LJz95BEKZ9bRbt8mw1PBKyav"}\n');
                res.write('0:"Yo, crypto "\n');
                res.write('0:"fam! Looks like "\n');
                res.write('0:"NYC is serving up "\n');
                res.write('0:"some classic spring vibes today "\n');
                res.write('0:"- light rain, mild "\n');
                res.write('0:"temps, perfect weather for "\n');
                res.write('0:"HODLing and vibing "\n');
                res.write('0:"with the DePIN revolution! "\n');
                res.write('0:"🌧️🚀 Grab "\n');
                res.write('0:"an umbrella and keep your "\n');
                res.write('0:"blockchain spirit dry! "\n');
                res.write('0:"#DePINWeather "\n');
                res.write('0:"#CryptoClimateTech"\n');

                // Final completion
                res.write(
                    'e:{"finishReason":"stop","usage":{"promptTokens":3112,"completionTokens":83},"isContinued":false}\n'
                );
                res.write(
                    'd:{"finishReason":"stop","usage":{"promptTokens":5924,"completionTokens":194}}\n'
                );
                res.end();
            }),
            response: Promise.resolve({
                id: "msg_01PpkQVEWGdvmwVPFUESjbkq",
                messages: [
                    {
                        role: "assistant",
                        content: [
                            {
                                type: "text",
                                text: "I'll check the current weather in New York for you using the Quicksilver tool.",
                            },
                            {
                                type: "tool-call",
                                toolCallId: "toolu_01EEA1i78cYL4xSbhKrUfgvj",
                                toolName: "quicksilver",
                                args: {
                                    expert_roundtable: "weather",
                                    question:
                                        "What is the current weather in New York City on April 4, 2025?",
                                },
                            },
                        ],
                        id: "msg-xok4SDg8pH9X53dWSIM7tIBs",
                    },
                    {
                        role: "tool",
                        id: "msg-V4DoP7wsvcYDMI29Vvl7emg2",
                        content: [
                            {
                                type: "tool-result",
                                toolCallId: "toolu_01EEA1i78cYL4xSbhKrUfgvj",
                                toolName: "quicksilver",
                                result: "# Current Weather in New York City (April 4, 2025)\n\nBased on the latest DePIN weather data...",
                            },
                        ],
                    },
                    {
                        role: "assistant",
                        content: [
                            {
                                type: "text",
                                text: "Yo, crypto fam! Looks like NYC is serving up some classic spring vibes today...",
                            },
                        ],
                        id: "msg-LJz95BEKZ9bRbt8mw1PBKyav",
                    },
                ],
            }),
        }),
        composeContext: vi.fn().mockReturnValue("mocked context"),
        stringToUuid: vi.fn((str) => str),
        getEmbeddingZeroVector: vi.fn().mockReturnValue([]),
    };
});

describe("Message stream endpoint", () => {
    let client: DirectClient;
    let mockAgentRuntime: AgentRuntime;

    beforeEach(() => {
        vi.clearAllMocks();
        mockAgentRuntime = buildAgentRuntimeMock();
        client = new DirectClient();
        client.registerAgent(mockAgentRuntime);
    });

    afterEach(() => {
        client.stop();
    });

    it("should handle message stream request with correct streaming format", async () => {
        const response = await request(client.app)
            .post(`/${mockAgentRuntime.agentId}/message-stream`)
            .send({
                text: "What's the weather like in New York?",
                userId: "test-user",
                roomId: "test-room",
                name: "test-user",
                userName: "test-user",
            });

        expect(response.status).toBe(200);

        const responseText = response.text;

        // Check message format
        expect(responseText).toMatch(/^f:{"messageId":"msg-.*"}/m);
        expect(responseText).toMatch(/^0:".*"$/m);
        expect(responseText).toMatch(
            /^9:{"toolCallId":.*,"toolName":"quicksilver"/m
        );
        expect(responseText).toMatch(/^a:{"toolCallId":.*,"result":.*}/m);
        expect(responseText).toMatch(/^e:{"finishReason":.*,"usage":.*}/m);
        expect(responseText).toMatch(/^d:{"finishReason":"stop","usage":.*}/m);

        // Check content chunks
        expect(responseText).toContain('"I\'ll "');
        expect(responseText).toContain('"check the "');
        expect(responseText).toContain('"Quicksilver "');
        expect(responseText).toContain('"tool."');

        // Check tool call
        expect(responseText).toContain('"expert_roundtable":"weather"');
        expect(responseText).toContain(
            '"question":"What is the current weather in New York City on April 4, 2025?"'
        );

        // Check final response
        expect(responseText).toContain('"Yo, crypto "');
        expect(responseText).toContain('"#CryptoClimateTech"');

        // Verify runtime interactions
        expect(mockAgentRuntime.ensureConnection).toHaveBeenCalledWith(
            "test-user",
            "test-room",
            "test-user",
            "test-user",
            "direct"
        );
        expect(
            mockAgentRuntime.messageManager.addEmbeddingToMemory
        ).toHaveBeenCalled();
        expect(mockAgentRuntime.messageManager.createMemory).toHaveBeenCalled();
        expect(mockAgentRuntime.composeState).toHaveBeenCalled();
    });

    it("should handle message stream with proper message sequence", async () => {
        const response = await request(client.app)
            .post(`/${mockAgentRuntime.agentId}/message-stream`)
            .send({
                text: "What's the weather like in New York?",
                userId: "test-user",
                roomId: "test-room",
            });

        const responseText = response.text;

        // Test the sequence of messages
        expect(responseText).toContain("I'll");
        expect(responseText).toContain("for you using ");
        expect(responseText).toContain("tool-call");
        expect(responseText).toContain("quicksilver");
        expect(responseText).toContain("Yo, crypto ");
    });

    it("should handle non-existent agent gracefully", async () => {
        const response = await request(client.app)
            .post("/non-existent-agent/message-stream")
            .send({
                text: "Hello",
                userId: "test-user",
                roomId: "test-room",
            });

        expect(response.status).toBe(200); // SSE should still return 200
        expect(response.text).toContain("Agent not found");
    });
});
