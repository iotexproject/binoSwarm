import { expect, beforeEach, afterEach, vi } from "vitest";
import { MessageProcessor, ReceivedMessage } from "../src/messageProcessor";
import {
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    UUID,
} from "../src/types";
import { stringToUuid } from "../src/uuid";
import { composeContext } from "../src/context";
import { generateMessageResponse } from "../src/generation";

vi.mock("../src/uuid", () => ({
    stringToUuid: vi.fn(),
}));

vi.mock("../src/context", () => ({
    composeContext: vi.fn(),
}));

vi.mock("../src/generation", () => ({
    generateMessageResponse: vi.fn(),
}));

vi.mocked(stringToUuid).mockImplementation(
    (input: string | number) => ("uuid-" + input) as UUID
);

describe("MsgPreprocessor", () => {
    let runtime: IAgentRuntime;
    let receivedMessage: ReceivedMessage;
    let mockState: State;
    let tags: string[];
    let callback: HandlerCallback;

    beforeEach(() => {
        mockState = {
            agentId: "testAgentId",
            agentName: "testAgentName",
            bio: "testBio",
            system: "testSystem",
            lore: "testLore",
        } as unknown as State;
        runtime = {
            agentId: "test" as UUID,
            ensureConnection: vi.fn(),
            messageManager: {
                createMemory: vi.fn(),
            },
            composeState: vi.fn().mockResolvedValue(mockState),
            updateRecentMessageState: vi.fn().mockResolvedValue(mockState),
        } as unknown as IAgentRuntime;

        receivedMessage = {
            rawMessageId: "testMessageId",
            text: "testText",
            attachments: [],
            rawUserId: "testUserId",
            rawRoomId: "testRoomId",
            userName: "testUserName",
            userScreenName: "testUserScreenName",
            source: "discord",
            createdAt: 1717000000000,
            messageUrl: "https://discord.com/channels/1234567890/1234567890",
        };
        tags = ["direct", "direct-response"];
        callback = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should be initialized with runtime", () => {
        const msgPreprocessor = new MessageProcessor(runtime);
        expect(msgPreprocessor["runtime"].agentId).toBe(runtime.agentId);
    });

    it("should ensure connection between user and agent in a room", async () => {
        const msgPreprocessor = new MessageProcessor(runtime);
        vi.mocked(runtime.ensureConnection).mockResolvedValue();
        await msgPreprocessor.preprocess(receivedMessage);
        expect(runtime.ensureConnection).toHaveBeenCalledWith(
            "uuid-testUserId",
            "uuid-testRoomId",
            receivedMessage.userName,
            receivedMessage.userScreenName,
            receivedMessage.source
        );
    });

    it("should throw an error if a room id is not provided", () => {
        const msgPreprocessor = new MessageProcessor(runtime);
        expect(() => msgPreprocessor["genRoomId"]("")).toThrow();
    });

    it("should generate a user id if not provided", () => {
        const msgPreprocessor = new MessageProcessor(runtime);
        expect(() => msgPreprocessor["genUserId"]("")).toThrow();
    });

    it("should create and save a memory", async () => {
        const msgPreprocessor = new MessageProcessor(runtime);

        await msgPreprocessor.preprocess(receivedMessage);
        expect(runtime.messageManager.createMemory).toHaveBeenCalledWith({
            memory: {
                id: "uuid-testMessageId-test",
                content: {
                    text: "testText",
                    attachments: [],
                    source: "discord",
                    inReplyTo: undefined,
                    url: "https://discord.com/channels/1234567890/1234567890",
                },
                userId: "uuid-testUserId",
                roomId: "uuid-testRoomId",
                agentId: "test",
                createdAt: expect.any(Number),
            },
            isUnique: true,
        });
    });

    it("should compose state", async () => {
        const msgPreprocessor = new MessageProcessor(runtime);
        const { memory } = await msgPreprocessor.preprocess(receivedMessage);
        expect(runtime.composeState).toHaveBeenCalledWith(memory);
    });

    it("should composeContext and generate message response", async () => {
        const msgPreprocessor = new MessageProcessor(runtime);
        vi.mocked(composeContext).mockReturnValue("testContext");
        vi.mocked(generateMessageResponse).mockResolvedValue({
            text: "testResponse",
        });
        await msgPreprocessor.preprocess(receivedMessage);
        await msgPreprocessor.generate("testTemplate", tags, callback);
        expect(composeContext).toHaveBeenCalledWith({
            state: mockState,
            template: "testTemplate",
        });

        expect(generateMessageResponse).toHaveBeenCalledWith(
            expect.objectContaining({
                runtime,
                context: "testContext",
                modelClass: ModelClass.LARGE,
                message: expect.objectContaining({
                    id: "uuid-testMessageId-test",
                    content: expect.objectContaining({
                        text: receivedMessage.text,
                        source: receivedMessage.source,
                        url: receivedMessage.messageUrl,
                    }),
                }),
                tags,
            })
        );
    });

    it("should send response to the user and save the memory", async () => {
        const msgPreprocessor = new MessageProcessor(runtime);
        vi.mocked(composeContext).mockReturnValue("testContext");
        vi.mocked(generateMessageResponse).mockResolvedValue({
            text: "testResponse",
        });
        vi.mocked(callback).mockImplementation(async (response: Content) => {
            expect(response).toEqual({
                text: "testResponse",
            });
            return [{} as Memory];
        });
        await msgPreprocessor.preprocess(receivedMessage);

        vi.mocked(runtime.messageManager.createMemory).mockResolvedValue();

        await msgPreprocessor.generate("testTemplate", tags, callback);

        expect(callback).toHaveBeenCalledWith({
            text: "testResponse",
        });
        expect(runtime.messageManager.createMemory).toHaveBeenCalledWith(
            expect.objectContaining({
                memory: expect.objectContaining({
                    id: "uuid-uuid-testMessageId-test-test",
                    content: {
                        text: "testResponse",
                    },
                }),
                isUnique: true,
            })
        );
    });
});
