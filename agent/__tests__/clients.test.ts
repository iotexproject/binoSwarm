import { describe, it, expect, vi, beforeEach } from "vitest";
import { initializeClients } from "../src/clients";
import { AutoClientInterface } from "@elizaos/client-auto";
import { DiscordClientInterface } from "@elizaos/client-discord";
import { TelegramClientInterface } from "@elizaos/client-telegram";
import { TwitterClientInterface } from "@elizaos/client-twitter";
import { Character, Clients, elizaLogger, IAgentRuntime } from "@elizaos/core";

// Mock dependencies
vi.mock("@elizaos/client-auto", () => ({
    AutoClientInterface: {
        start: vi.fn(),
    },
}));

vi.mock("@elizaos/client-discord", () => ({
    DiscordClientInterface: {
        start: vi.fn(),
    },
}));

vi.mock("@elizaos/client-telegram", () => ({
    TelegramClientInterface: {
        start: vi.fn(),
    },
}));

vi.mock("@elizaos/client-twitter", () => ({
    TwitterClientInterface: {
        start: vi.fn(),
    },
}));

vi.mock("@elizaos/core", () => ({
    Clients: {
        AUTO: "auto",
        DISCORD: "discord",
        TELEGRAM: "telegram",
        TWITTER: "twitter",
    },
    elizaLogger: {
        log: vi.fn(),
        debug: vi.fn(),
    },
}));

describe("initializeClients", () => {
    // Test fixtures
    const mockRuntime = {} as IAgentRuntime;

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("should initialize no clients when character has no clients configured", async () => {
        // @ts-expect-error: mock character
        const character: Character = {
            name: "Test Character",
            id: "test-id",
            clients: [],
        } as Character;

        // Execute
        const result = await initializeClients(character, mockRuntime);

        // Verify
        expect(result).toEqual({});
        expect(elizaLogger.log).toHaveBeenCalled();
        expect(AutoClientInterface.start).not.toHaveBeenCalled();
        expect(DiscordClientInterface.start).not.toHaveBeenCalled();
        expect(TelegramClientInterface.start).not.toHaveBeenCalled();
        expect(TwitterClientInterface.start).not.toHaveBeenCalled();
    });

    it("should initialize auto client when configured", async () => {
        // @ts-expect-error: mock character
        const character: Character = {
            name: "Test Character",
            id: "test-id",
            clients: [Clients.AUTO],
        } as Character;

        const mockAutoClient = { name: "mockAutoClient" };
        vi.mocked(AutoClientInterface.start).mockResolvedValue(mockAutoClient);

        // Execute
        const result = await initializeClients(character, mockRuntime);

        // Verify
        expect(AutoClientInterface.start).toHaveBeenCalledWith(mockRuntime);
        expect(result).toEqual({ auto: mockAutoClient });
    });

    it("should initialize all standard clients when configured", async () => {
        // @ts-expect-error: mock character
        const character: Character = {
            name: "Test Character",
            id: "test-id",
            clients: [
                Clients.AUTO,
                Clients.DISCORD,
                Clients.TELEGRAM,
                Clients.TWITTER,
            ],
        } as Character;

        const mockAutoClient = { name: "mockAutoClient" };
        const mockDiscordClient = { name: "mockDiscordClient" };
        const mockTelegramClient = { name: "mockTelegramClient" };
        const mockTwitterClient = { name: "mockTwitterClient" };

        vi.mocked(AutoClientInterface.start).mockResolvedValue(mockAutoClient);
        vi.mocked(DiscordClientInterface.start).mockResolvedValue(
            mockDiscordClient
        );
        vi.mocked(TelegramClientInterface.start).mockResolvedValue(
            mockTelegramClient
        );
        vi.mocked(TwitterClientInterface.start).mockResolvedValue(
            mockTwitterClient
        );

        // Execute
        const result = await initializeClients(character, mockRuntime);

        // Verify
        expect(AutoClientInterface.start).toHaveBeenCalledWith(mockRuntime);
        expect(DiscordClientInterface.start).toHaveBeenCalledWith(mockRuntime);
        expect(TelegramClientInterface.start).toHaveBeenCalledWith(mockRuntime);
        expect(TwitterClientInterface.start).toHaveBeenCalledWith(mockRuntime);

        expect(result).toEqual({
            auto: mockAutoClient,
            discord: mockDiscordClient,
            telegram: mockTelegramClient,
            twitter: mockTwitterClient,
        });
    });

    it("should skip client initialization if client start returns falsy value", async () => {
        // @ts-expect-error: mock character
        const character: Character = {
            name: "Test Character",
            id: "test-id",
            clients: [Clients.AUTO, Clients.DISCORD],
        } as Character;

        vi.mocked(AutoClientInterface.start).mockResolvedValue(null);
        vi.mocked(DiscordClientInterface.start).mockResolvedValue({
            name: "mockDiscordClient",
        });

        // Execute
        const result = await initializeClients(character, mockRuntime);

        // Verify
        expect(result).toEqual({
            discord: { name: "mockDiscordClient" },
        });
    });

    it("should handle mixed-case client names", async () => {
        // @ts-expect-error: mock character
        const character: Character = {
            name: "Test Character",
            id: "test-id",
            clients: ["AuTo", "DiScOrD"],
        } as Character;

        const mockAutoClient = { name: "mockAutoClient" };
        const mockDiscordClient = { name: "mockDiscordClient" };

        vi.mocked(AutoClientInterface.start).mockResolvedValue(mockAutoClient);
        vi.mocked(DiscordClientInterface.start).mockResolvedValue(
            mockDiscordClient
        );

        // Execute
        const result = await initializeClients(character, mockRuntime);

        // Verify
        expect(AutoClientInterface.start).toHaveBeenCalledWith(mockRuntime);
        expect(DiscordClientInterface.start).toHaveBeenCalledWith(mockRuntime);

        expect(result).toEqual({
            auto: mockAutoClient,
            discord: mockDiscordClient,
        });
    });
});
