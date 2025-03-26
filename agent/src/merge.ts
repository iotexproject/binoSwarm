import { Character, CharacterDBTraits, MessageExample } from "@elizaos/core";

export function mergeCharacterTraits(
    character: Character,
    dbTraits: CharacterDBTraits
): Character {
    // Create a new character object to avoid mutations
    const mergedCharacter = { ...character };

    // System prompt is now required with default
    mergedCharacter.system = dbTraits.system_prompt || "";

    // Handle array fields with new default behavior
    const arrayFields: (keyof CharacterDBTraits)[] = [
        "bio",
        "lore",
        "knowledge",
        "postExamples",
        "topics",
        "adjectives",
    ];

    arrayFields.forEach((field) => {
        const sanitizedField = sanitizeArrayField(dbTraits[field]);
        mergedCharacter[field] = [
            ...new Set([...mergedCharacter[field], ...sanitizedField]),
        ];
    });

    // Handle message examples with new default behavior
    if (dbTraits.messageExamples) {
        const sanitizedMessageExamples = sanitizeMessageExamples(
            dbTraits.messageExamples
        );
        mergedCharacter.messageExamples = [
            ...mergedCharacter.messageExamples,
            ...sanitizedMessageExamples,
        ];
    }

    // Handle style with new default behavior
    const sanitizedStyle = sanitizeStyle(dbTraits.style);
    mergedCharacter.style = {
        all: [
            ...new Set([
                ...(mergedCharacter.style?.all || []),
                ...sanitizedStyle.all,
            ]),
        ],
        chat: [
            ...new Set([
                ...(mergedCharacter.style?.chat || []),
                ...sanitizedStyle.chat,
            ]),
        ],
        post: [
            ...new Set([
                ...(mergedCharacter.style?.post || []),
                ...sanitizedStyle.post,
            ]),
        ],
    };

    // Handle templates with new default behavior
    const sanitizedTemplates = sanitizeTemplates(dbTraits.templates);
    mergedCharacter.templates = {
        ...(mergedCharacter.templates || {}),
        ...sanitizedTemplates,
    };

    // Handle Twitter environment variables (still optional)
    mergedCharacter.settings = mergedCharacter.settings || {};
    mergedCharacter.settings.secrets = mergedCharacter.settings.secrets || {};

    if (dbTraits.env_twitter_target_users) {
        const sanitizedUsers = sanitizeArrayField(
            dbTraits.env_twitter_target_users
        );
        if (sanitizedUsers.length > 0) {
            mergedCharacter.settings.secrets.TWITTER_TARGET_USERS =
                sanitizedUsers.join(",");
        }
    }

    if (dbTraits.env_twitter_knowledge_users) {
        const sanitizedUsers = sanitizeArrayField(
            dbTraits.env_twitter_knowledge_users
        );
        if (sanitizedUsers.length > 0) {
            mergedCharacter.settings.secrets.TWITTER_KNOWLEDGE_USERS =
                sanitizedUsers.join(",");
        }
    }

    return mergedCharacter;
}

function sanitizeStyle(style: unknown): Required<CharacterStyle> {
    if (!style || typeof style !== "object") {
        return { all: [], chat: [], post: [] };
    }

    const rawStyle = style as Record<string, unknown>;
    const sanitized: Required<CharacterStyle> = {
        all: [],
        chat: [],
        post: [],
    };

    // Handle typos and invalid keys
    Object.entries(rawStyle).forEach(([key, value]) => {
        const normalizedKey = key.toLowerCase();
        const validKey = VALID_STYLE_KEYS.find(
            (valid) => valid.toLowerCase() === normalizedKey
        );

        if (validKey) {
            sanitized[validKey] = Array.isArray(value)
                ? value.filter(
                      (item): item is string => typeof item === "string"
                  )
                : [];
        }
    });

    return sanitized;
}

const VALID_STYLE_KEYS = ["all", "chat", "post"] as const;

interface CharacterStyle {
    all: string[];
    chat: string[];
    post: string[];
}

function sanitizeMessageExamples(
    messageExamples: MessageExample[][]
): MessageExample[][] {
    return messageExamples.filter((example) =>
        example?.every(
            (msg) =>
                msg.user && msg.content && typeof msg.content.text === "string"
        )
    );
}

function sanitizeArrayField(field: unknown): string[] {
    if (!field || !Array.isArray(field)) {
        return []; // Default to empty array instead of undefined
    }
    return field.filter((item): item is string => typeof item === "string");
}

function sanitizeTemplates(templates: unknown): Record<string, string> {
    if (!templates || typeof templates !== "object") {
        return {}; // Default to empty object
    }

    const rawTemplates = templates as Record<string, unknown>;
    return Object.entries(rawTemplates).reduce(
        (acc, [key, value]) => {
            if (typeof value === "string") {
                acc[key] = value;
            }
            return acc;
        },
        {} as Record<string, string>
    );
}
