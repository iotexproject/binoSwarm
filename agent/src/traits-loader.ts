import { CharacterDBTraits, elizaLogger } from "@elizaos/core";
import fs from "fs";
import path from "path";

const TRAITS_BASE_DIR = "characters/agentsTraits";

const FILE_NAMES = {
    BIO: "bio.json",
    LORE: "lore.json",
    KNOWLEDGE: "knowledge.json",
    MESSAGE_EXAMPLES: "messageExamples.json",
    POST_EXAMPLES: "postExamples.json",
    TOPICS: "topics.json",
    ADJECTIVES: "adjective.json",
    STYLE: "style.json",
    TEMPLATES: "templates.json",
    TARGET_USERS: "xTargetUsers.txt",
    KNOWLEDGE_USERS: "xKnowledgeUsers.txt",
    PROMPTS_DIR: "prompts",
    SYSTEM_PROMPT: "system.md",
} as const;

export function loadTraitsFromFilesystem(
    characterName: string
): CharacterDBTraits | null {
    const traitsDir = path.resolve(
        process.cwd(),
        TRAITS_BASE_DIR,
        characterName
    );

    if (!fs.existsSync(traitsDir)) {
        return null;
    }

    return parseTraitsDirectory(traitsDir);
}

function parseTraitsDirectory(dirPath: string): CharacterDBTraits {
    const traits: Partial<CharacterDBTraits> = {
        id: "",
        agent_id: "",
    };

    parseArrayFields(traits, dirPath);
    parseKnowledgeField(traits, dirPath);
    parseMessageExamplesField(traits, dirPath);
    parseStyleField(traits, dirPath);
    parseTemplatesField(traits, dirPath);
    parseTextFields(traits, dirPath);
    parseSystemPrompt(traits, dirPath);

    return traits as CharacterDBTraits;
}

function parseArrayFields(
    traits: Partial<CharacterDBTraits>,
    dirPath: string
): void {
    const arrayJsonFiles = [
        { file: FILE_NAMES.BIO, field: "bio" },
        { file: FILE_NAMES.LORE, field: "lore" },
        { file: FILE_NAMES.POST_EXAMPLES, field: "postExamples" },
        { file: FILE_NAMES.TOPICS, field: "topics" },
        { file: FILE_NAMES.ADJECTIVES, field: "adjectives" },
    ] as const;

    for (const { file, field } of arrayJsonFiles) {
        const filePath = path.join(dirPath, file);
        const data = readJsonFile(filePath);
        if (data !== null && Array.isArray(data)) {
            traits[field] = data.filter(
                (item): item is string => typeof item === "string"
            );
        }
    }
}

function parseKnowledgeField(
    traits: Partial<CharacterDBTraits>,
    dirPath: string
): void {
    const knowledgePath = path.join(dirPath, FILE_NAMES.KNOWLEDGE);
    const knowledgeData = readJsonFile(knowledgePath);
    if (knowledgeData !== null && Array.isArray(knowledgeData)) {
        traits.knowledge = knowledgeData
            .map((item) => {
                if (typeof item === "string") {
                    return item;
                }
                if (
                    typeof item === "object" &&
                    item !== null &&
                    "path" in item &&
                    typeof item.path === "string"
                ) {
                    return item.path;
                }
                return null;
            })
            .filter((item): item is string => item !== null);
    }
}

function parseMessageExamplesField(
    traits: Partial<CharacterDBTraits>,
    dirPath: string
): void {
    const messageExamplesPath = path.join(dirPath, FILE_NAMES.MESSAGE_EXAMPLES);
    const messageExamples = readJsonFile(messageExamplesPath);
    if (messageExamples !== null && Array.isArray(messageExamples)) {
        traits.messageExamples = messageExamples.filter(
            (
                example
            ): example is NonNullable<
                CharacterDBTraits["messageExamples"]
            >[number] => Array.isArray(example)
        );
    }
}

function parseStyleField(
    traits: Partial<CharacterDBTraits>,
    dirPath: string
): void {
    const stylePath = path.join(dirPath, FILE_NAMES.STYLE);
    const style = readJsonFile(stylePath);
    if (style !== null && typeof style === "object") {
        traits.style = style as CharacterDBTraits["style"];
    }
}

function parseTemplatesField(
    traits: Partial<CharacterDBTraits>,
    dirPath: string
): void {
    const templatesPath = path.join(dirPath, FILE_NAMES.TEMPLATES);
    const templatesConfig = readJsonFile(templatesPath);
    if (
        templatesConfig === null ||
        typeof templatesConfig !== "object" ||
        Array.isArray(templatesConfig)
    ) {
        return;
    }

    const templateMap: Record<string, string> = {};
    const templatesObj = templatesConfig as Record<string, unknown>;

    for (const [templateName, templatePath] of Object.entries(templatesObj)) {
        if (typeof templatePath !== "string") {
            elizaLogger.warn(
                `Invalid template path for ${templateName}: expected string`
            );
            continue;
        }

        const resolvedPath = path.resolve(dirPath, templatePath);
        if (!fs.existsSync(resolvedPath)) {
            elizaLogger.warn(
                `Template file not found: ${resolvedPath} (from ${templateName})`
            );
            continue;
        }

        try {
            const content = fs.readFileSync(resolvedPath, "utf8");
            templateMap[templateName] = content.trim();
        } catch (e) {
            elizaLogger.error(
                `Error reading template file ${resolvedPath} (from ${templateName}):`,
                e
            );
        }
    }

    if (Object.keys(templateMap).length > 0) {
        traits.templates = templateMap;
    }
}

function parseTextFields(
    traits: Partial<CharacterDBTraits>,
    dirPath: string
): void {
    const targetUsersPath = path.join(dirPath, FILE_NAMES.TARGET_USERS);
    const targetUsers = readTextLines(targetUsersPath);
    if (targetUsers.length > 0) {
        traits.env_twitter_target_users = targetUsers;
    }

    const knowledgeUsersPath = path.join(dirPath, FILE_NAMES.KNOWLEDGE_USERS);
    const knowledgeUsers = readTextLines(knowledgeUsersPath);
    if (knowledgeUsers.length > 0) {
        traits.env_twitter_knowledge_users = knowledgeUsers;
    }
}

function parseSystemPrompt(
    traits: Partial<CharacterDBTraits>,
    dirPath: string
): void {
    const promptsDir = path.join(dirPath, FILE_NAMES.PROMPTS_DIR);
    if (!fs.existsSync(promptsDir) || !fs.statSync(promptsDir).isDirectory()) {
        return;
    }

    const systemPromptPath = path.join(promptsDir, FILE_NAMES.SYSTEM_PROMPT);
    if (!fs.existsSync(systemPromptPath)) {
        return;
    }

    try {
        const systemPrompt = fs.readFileSync(systemPromptPath, "utf8");
        traits.system_prompt = systemPrompt.trim();
    } catch (e) {
        elizaLogger.error(
            `Error reading system prompt from ${systemPromptPath}:`,
            e
        );
    }
}

function readJsonFile(filePath: string): unknown | null {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(filePath, "utf8");
        return JSON.parse(content);
    } catch (e) {
        elizaLogger.error(`Error reading JSON file ${filePath}:`, e);
        return null;
    }
}

function readTextLines(filePath: string): string[] {
    if (!fs.existsSync(filePath)) {
        return [];
    }

    try {
        const content = fs.readFileSync(filePath, "utf8");
        return content
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    } catch (e) {
        elizaLogger.warn(`Error reading text file ${filePath}:`, e);
        return [];
    }
}
