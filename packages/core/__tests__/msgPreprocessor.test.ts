import { expect, beforeAll, vi } from "vitest";
import {
    MsgPreprocessor,
    ReceivedMessage,
} from "../src/clientHelpers/MsgPreprocessor";
import { IAgentRuntime, UUID } from "../src/types";
import { stringToUuid } from "@elizaos/core";

vi.mock("@elizaos/core", () => ({
    stringToUuid: vi.fn(),
}));

vi.mocked(stringToUuid).mockImplementation(
    (input: string | number) => ("uuid-" + input) as UUID
);

describe("MsgPreprocessor", () => {
    let runtime: IAgentRuntime;
    let receivedMessage: ReceivedMessage;

    beforeAll(() => {
        runtime = {
            agentId: "test" as UUID,
            ensureConnection: vi.fn(),
        } as unknown as IAgentRuntime;

        receivedMessage = {
            rawUserId: "testUserId",
            rawRoomId: "testRoomId",
            userName: "testUserName",
            userScreenName: "testUserScreenName",
            source: "discord",
        };
    });

    it("should be initialized with runtime", () => {
        const msgPreprocessor = new MsgPreprocessor(runtime);
        expect(msgPreprocessor["runtime"].agentId).toBe(runtime.agentId);
    });

    it("should ensure connection between user and agent in a room", async () => {
        const msgPreprocessor = new MsgPreprocessor(runtime);
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
        const msgPreprocessor = new MsgPreprocessor(runtime);
        expect(() => msgPreprocessor["genRoomId"]("")).toThrow();
    });

    it("should generate a user id if not provided", () => {
        const msgPreprocessor = new MsgPreprocessor(runtime);
        expect(() => msgPreprocessor["genUserId"]("")).toThrow();
    });
});
