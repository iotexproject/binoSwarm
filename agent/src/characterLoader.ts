import {
    Character,
    defaultCharacter,
    elizaLogger,
    validateCharacterConfig,
} from "@elizaos/core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { handlePluginImporting } from "./plugins";

const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

export async function loadCharacters(
    charactersArg: string
): Promise<Character[]> {
    const characterPaths = parseCharacterArgs(charactersArg);
    const loadedCharacters: Character[] = [];

    await Promise.all(
        characterPaths.map(async (characterPath) => {
            const { resolvedPath, content } = resolvePath(characterPath);

            try {
                const character: Character = await parseCharacter(
                    resolvedPath,
                    content
                );
                loadedCharacters.push(character);
            } catch (e) {
                handleCharacterParsing(resolvedPath, e);
            }
        })
    );

    if (loadedCharacters.length === 0) {
        elizaLogger.warn("No characters found, using default character");
        loadedCharacters.push(defaultCharacter);
    }

    return loadedCharacters;
}

function handleCharacterParsing(resolvedPath: string, e: any) {
    elizaLogger.error(`Error parsing character from ${resolvedPath}: ${e}`);
    process.exit(1);
}

function resolvePath(characterPath: string) {
    const pathsToTry = buildPathsToTry(characterPath);

    const existingPaths = pathsToTry.filter((p) => fs.existsSync(p));
    elizaLogger.info("Existing paths:", ...existingPaths);

    let content: string | null = null;
    let resolvedPath = "";

    existingPaths.map((p) => {
        content = tryLoadFile(p);
        if (content !== null) {
            resolvedPath = p;
            return;
        }
    });

    validateContent(content);

    return { resolvedPath, content };
}

function validateContent(content: string | null) {
    if (content === null) {
        elizaLogger.error(
            `Error loading character: files not found in any of the expected locations`
        );
        process.exit(1);
    }
}

function buildPathsToTry(characterPath: string) {
    const cwd = process.cwd();
    const basename = path.basename(characterPath);

    return [
        characterPath, // exact path as specified
        path.resolve(cwd, characterPath), // relative to cwd
        path.resolve(cwd, "agent", characterPath), // Add this
        path.resolve(__dirname, characterPath), // relative to current script
        path.resolve(__dirname, "characters", basename), // relative to agent/characters
        path.resolve(__dirname, "../characters", basename), // relative to characters dir from agent
        path.resolve(__dirname, "../../characters", basename),
    ];
}

function parseCharacterArgs(charactersArg: string): string[] {
    if (!charactersArg) {
        return [];
    }
    return charactersArg.split(",").map((filePath) => filePath.trim());
}

async function parseCharacter(
    filePath: string,
    content: string
): Promise<Character> {
    let character = JSON.parse(content);
    validateCharacterConfig(character);

    character.plugins = await handlePluginImporting(character.plugins);

    elizaLogger.info(`Successfully loaded character from: ${filePath}`);

    return character;
}

function tryLoadFile(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (e) {
        return null;
    }
}
