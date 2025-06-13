import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import {
    defaultCharacter,
    elizaLogger,
    validateCharacterConfig,
} from "@elizaos/core";
import { handlePluginImporting } from "../src/plugins";
import { parseArguments } from "../src/parsing";
import { parseArgsAndLoadCharacters } from "../src/characterLoader";

vi.mock("fs");
vi.mock("../src/parsing");
vi.mock("../src/plugins");
vi.mock("@elizaos/core", async (importOriginal) => {
    const actualCore = await importOriginal<typeof import("@elizaos/core")>();
    return {
        ...actualCore,
        defaultCharacter: { name: "default" },
        elizaLogger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
        validateCharacterConfig: vi.fn(),
    };
});

const mockedFs = vi.mocked(fs);
const mockedParseArguments = vi.mocked(parseArguments);
const mockedElizaLogger = vi.mocked(elizaLogger);
const mockedValidateCharacterConfig = vi.mocked(validateCharacterConfig);
const mockedHandlePluginImporting = vi.mocked(handlePluginImporting);

describe("characterLoader", () => {
    let exitSpy: any;

    beforeEach(() => {
        vi.resetAllMocks();
        exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
            // Do nothing
        }) as any);
    });

    afterEach(() => {
        exitSpy.mockRestore();
    });

    describe("parseArgsAndLoadCharacters", () => {
        it("should return default character if no character arguments are provided", async () => {
            mockedParseArguments.mockReturnValue({});
            const characters = await parseArgsAndLoadCharacters();
            expect(characters).toEqual([defaultCharacter]);
        });

        it("should load a single character from the provided path", async () => {
            const characterPath = "my-character.json";
            const characterContent = { name: "Test Character", plugins: [] };
            mockedParseArguments.mockReturnValue({ characters: characterPath });
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue(
                JSON.stringify(characterContent)
            );
            mockedHandlePluginImporting.mockImplementation(
                async (plugins) => plugins
            );

            const characters = await parseArgsAndLoadCharacters();

            expect(characters).toHaveLength(1);
            expect(characters[0].name).toBe("Test Character");
            expect(mockedValidateCharacterConfig).toHaveBeenCalledWith(
                expect.objectContaining(characterContent)
            );
            expect(mockedElizaLogger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Successfully loaded character from:`)
            );
        });

        it("should load multiple characters from comma-separated paths", async () => {
            const characterPath1 = "char1.json";
            const characterContent1 = { name: "Character One", plugins: [] };
            const characterPath2 = "char2.json";
            const characterContent2 = { name: "Character Two", plugins: [] };

            mockedParseArguments.mockReturnValue({
                characters: `${characterPath1}, ${characterPath2}`,
            });

            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockImplementation((path) => {
                const pathStr = path.toString();
                if (pathStr.endsWith(characterPath1)) {
                    return JSON.stringify(characterContent1);
                }
                if (pathStr.endsWith(characterPath2)) {
                    return JSON.stringify(characterContent2);
                }
                return "";
            });

            mockedHandlePluginImporting.mockImplementation(
                async (plugins) => plugins
            );

            const characters = await parseArgsAndLoadCharacters();

            expect(characters).toHaveLength(2);
            expect(characters[0].name).toBe("Character One");
            expect(characters[1].name).toBe("Character Two");
        });

        it("should use --character arg if --characters is not present", async () => {
            const characterPath = "my-character.json";
            const characterContent = { name: "Test Character", plugins: [] };
            mockedParseArguments.mockReturnValue({ character: characterPath });
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue(
                JSON.stringify(characterContent)
            );

            const characters = await parseArgsAndLoadCharacters();

            expect(characters).toHaveLength(1);
            expect(characters[0].name).toBe("Test Character");
        });

        it("should exit if character file is not found", async () => {
            const characterPath = "non-existent-character.json";
            mockedParseArguments.mockReturnValue({ characters: characterPath });
            mockedFs.existsSync.mockReturnValue(false);

            // In the current implementation, this will cause process.exit(1)
            // and the promise will not resolve with a value, so we don't check for it
            await parseArgsAndLoadCharacters();

            expect(mockedElizaLogger.error).toHaveBeenCalledWith(
                "Error loading character: files not found in any of the expected locations"
            );
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it("should exit if character file has invalid JSON", async () => {
            const characterPath = "invalid-character.json";
            mockedParseArguments.mockReturnValue({ characters: characterPath });
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue("{ invalid json }");

            // In the current implementation, this will cause process.exit(1)
            await parseArgsAndLoadCharacters();

            expect(mockedElizaLogger.error).toHaveBeenCalledWith(
                expect.stringContaining(`Error parsing character from`)
            );
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it.skip("should return default character and warn if no characters are successfully loaded", async () => {
            mockedParseArguments.mockReturnValue({ characters: "" });

            const characters = await parseArgsAndLoadCharacters();

            expect(mockedElizaLogger.warn).toHaveBeenCalledWith(
                "No characters found, using default character"
            );
            expect(characters).toEqual([defaultCharacter]);
        });
    });
});
