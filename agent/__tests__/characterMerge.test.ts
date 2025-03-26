import { describe, it, expect } from "vitest";
import { mergeCharacterTraits } from "../src/merge";
import {
    Character,
    ModelProviderName,
    type CharacterDBTraits,
} from "@elizaos/core";

describe("Character Trait Merging", () => {
    const baseCharacter: Character = {
        id: "id-id-id-id-id",
        name: "Test Character",
        modelProvider: ModelProviderName.OPENAI,
        clients: [],
        plugins: [],
        system: "Original System",
        bio: ["Original Bio"],
        lore: ["Original Lore"],
        knowledge: ["Original Knowledge"],
        messageExamples: [
            [
                { user: "user", content: { text: "Original Example" } },
                { user: "character", content: { text: "Original Example" } },
            ],
        ],
        postExamples: ["Original Post"],
        topics: ["Original Topic"],
        adjectives: ["Original Adjective"],
        style: {
            all: ["Original Style"],
            chat: ["Original Chat Style"],
            post: ["Original Post Style"],
        },
        templates: {
            goalsTemplate: "Existing Template",
            factsTemplate: "Existing Facts Template",
        },
    };

    const dbTraits: CharacterDBTraits = {
        id: "1",
        agent_id: "id-id-id-id-id",
        system_prompt: "DB System Prompt",
        bio: ["DB Bio"],
        lore: ["DB Lore"],
        knowledge: ["DB Knowledge"],
        messageExamples: [
            [
                { user: "user", content: { text: "DB Example" } },
                { user: "character", content: { text: "DB Example" } },
            ],
        ],
        postExamples: ["DB Post"],
        topics: ["DB Topic"],
        adjectives: ["DB Adjective"],
        style: {
            all: ["DB Style"],
            chat: ["DB Chat Style"],
            post: ["DB Post Style"],
        },
        templates: {
            goalsTemplate: "DB Goals Template",
        },
        env_twitter_target_users: ["user1", "user2"],
        env_twitter_knowledge_users: ["knowledge1", "knowledge2"],
    };

    it("should handle system prompt override", () => {
        const result = mergeCharacterTraits(baseCharacter, dbTraits);
        expect(result.system).toBe("DB System Prompt");
    });

    it("should merge and deduplicate array fields", () => {
        const result = mergeCharacterTraits(baseCharacter, dbTraits);

        expect(result.bio).toEqual(["Original Bio", "DB Bio"]);
        expect(result.lore).toEqual(["Original Lore", "DB Lore"]);
        expect(result.knowledge).toEqual([
            "Original Knowledge",
            "DB Knowledge",
        ]);
        expect(result.postExamples).toEqual(["Original Post", "DB Post"]);
        expect(result.topics).toEqual(["Original Topic", "DB Topic"]);
        expect(result.adjectives).toEqual([
            "Original Adjective",
            "DB Adjective",
        ]);
    });

    it("should handle message examples correctly", () => {
        const result = mergeCharacterTraits(baseCharacter, dbTraits);

        expect(result.messageExamples).toEqual([
            [
                { user: "user", content: { text: "Original Example" } },
                { user: "character", content: { text: "Original Example" } },
            ],
            [
                { user: "user", content: { text: "DB Example" } },
                { user: "character", content: { text: "DB Example" } },
            ],
        ]);
    });

    it("should merge style objects correctly", () => {
        const result = mergeCharacterTraits(baseCharacter, dbTraits);

        expect(result.style.all).toEqual(["Original Style", "DB Style"]);
        expect(result.style.chat).toEqual([
            "Original Chat Style",
            "DB Chat Style",
        ]);
        expect(result.style.post).toEqual([
            "Original Post Style",
            "DB Post Style",
        ]);
    });

    it("should merge templates correctly", () => {
        const result = mergeCharacterTraits(baseCharacter, dbTraits);

        expect(result.templates).toEqual({
            goalsTemplate: "DB Goals Template",
            factsTemplate: "Existing Facts Template",
        });
    });

    it("should merge templates if they were not present in the base character", () => {
        const baseCharacterWithoutTemplates: Character = {
            ...baseCharacter,
            templates: undefined,
        };
        const result = mergeCharacterTraits(
            baseCharacterWithoutTemplates,
            dbTraits
        );

        expect(result.templates).toEqual({
            goalsTemplate: "DB Goals Template",
        });
    });

    it("should handle Twitter environment variables", () => {
        const result = mergeCharacterTraits(baseCharacter, dbTraits);

        expect(result.settings?.secrets?.TWITTER_TARGET_USERS).toBe(
            "user1,user2"
        );
        expect(result.settings?.secrets?.TWITTER_KNOWLEDGE_USERS).toBe(
            "knowledge1,knowledge2"
        );
    });

    it("should handle partial DB traits", () => {
        const partialDbTraits: CharacterDBTraits = {
            id: "1",
            agent_id: "test-id",
            bio: ["DB Bio"],
        };

        const result = mergeCharacterTraits(baseCharacter, partialDbTraits);

        expect(result.bio).toEqual(["Original Bio", "DB Bio"]);
        expect(result.lore).toEqual(["Original Lore"]); // Unchanged
        expect(result.style).toEqual(baseCharacter.style); // Unchanged
    });

    it("should handle empty arrays in DB traits", () => {
        const emptyArraysDbTraits: CharacterDBTraits = {
            id: "1",
            agent_id: "test-id",
            bio: [],
            lore: [],
            topics: [],
        };

        const result = mergeCharacterTraits(baseCharacter, emptyArraysDbTraits);

        expect(result.bio).toEqual(["Original Bio"]);
        expect(result.lore).toEqual(["Original Lore"]);
        expect(result.topics).toEqual(["Original Topic"]);
    });

    it("should preserve character fields not present in DB traits", () => {
        const result = mergeCharacterTraits(baseCharacter, dbTraits);

        expect(result.name).toBe(baseCharacter.name);
        expect(result.modelProvider).toBe(baseCharacter.modelProvider);
    });
});

describe("Character Trait Error Handling", () => {
    const baseCharacter: Character = {
        id: "id-id-id-id-id",
        name: "Test Character",
        modelProvider: ModelProviderName.OPENAI,
        clients: [],
        plugins: [],
        system: "Original System",
        bio: ["Original Bio"],
        lore: ["Original Lore"],
        knowledge: ["Original Knowledge"],
        messageExamples: [
            [
                { user: "user", content: { text: "Original Example" } },
                { user: "character", content: { text: "Original Example" } },
            ],
        ],
        postExamples: ["Original Post"],
        topics: ["Original Topic"],
        adjectives: ["Original Adjective"],
        style: {
            all: ["Original Style"],
            chat: ["Original Chat Style"],
            post: ["Original Post Style"],
        },
        templates: {
            goalsTemplate: "Existing Template",
            factsTemplate: "Existing Facts Template",
        },
    };

    it("should handle invalid style key names", () => {
        const invalidStyleDbTraits: CharacterDBTraits = {
            id: "1",
            agent_id: "test-id",
            style: {
                // @ts-expect-error: invalid style key names
                alk: ["Should be 'all'"],
                chart: ["Should be 'chat'"],
                posting: ["Should be 'post'"],
            },
        };

        const result = mergeCharacterTraits(
            baseCharacter,
            invalidStyleDbTraits
        );

        // Should either correct the keys or maintain valid structure
        expect(result.style).toHaveProperty("all");
        expect(result.style.all).toEqual(["Original Style"]);
        expect(result.style).toHaveProperty("chat");
        expect(result.style.chat).toEqual(["Original Chat Style"]);
        expect(result.style).toHaveProperty("post");
        expect(result.style.post).toEqual(["Original Post Style"]);
    });

    it("should handle invalid style value types", () => {
        const invalidStyleDbTraits: CharacterDBTraits = {
            id: "1",
            agent_id: "test-id",
            style: {
                all: "not an array", // Should be array
                chat: [123, true, {}], // Should be string array
                post: null, // Should be array
            } as any,
        };

        const result = mergeCharacterTraits(
            baseCharacter,
            invalidStyleDbTraits
        );

        // Should maintain array structure with valid strings only
        expect(Array.isArray(result.style.all)).toBe(true);
        expect(result.style.all).toEqual(["Original Style"]);
        expect(Array.isArray(result.style.chat)).toBe(true);
        expect(result.style.chat).toEqual(["Original Chat Style"]);
        expect(Array.isArray(result.style.post)).toBe(true);
        expect(result.style.post).toEqual(["Original Post Style"]);
    });

    it("should handle malformed message examples", () => {
        const invalidMessageExamples: CharacterDBTraits = {
            id: "1",
            agent_id: "test-id",
            messageExamples: [
                null,
                [{ invalid: "structure" }],
                [
                    {
                        user: "user",
                        content: "string instead of object",
                    },
                ],
                [
                    {
                        user: "character",
                        content: { invalid: "no text field" },
                    },
                ],
            ] as any,
        };

        const result = mergeCharacterTraits(
            baseCharacter,
            invalidMessageExamples
        );

        // Should filter out invalid examples and maintain correct structure
        expect(
            result.messageExamples.every(
                (example) =>
                    Array.isArray(example) &&
                    example.every(
                        (msg) =>
                            msg.user &&
                            msg.content &&
                            typeof msg.content.text === "string"
                    )
            )
        ).toBe(true);
    });

    it("should handle invalid array values in string arrays", () => {
        const invalidArrayDbTraits: CharacterDBTraits = {
            id: "1",
            agent_id: "test-id",
            bio: [123, null, undefined, {}, [], true, "valid"] as any,
            lore: [null] as any,
            topics: ["valid", undefined, null] as any,
        };

        const result = mergeCharacterTraits(
            baseCharacter,
            invalidArrayDbTraits
        );

        // Should filter out non-string values
        expect(
            (result.bio as string[]).every((item) => typeof item === "string")
        ).toBe(true);
        expect(result.bio).toContain("valid");
        expect(result.lore).toEqual(baseCharacter.lore);
        expect(result.topics.every((item) => typeof item === "string")).toBe(
            true
        );
    });

    it("should handle completely invalid style object", () => {
        const invalidStyleDbTraits: CharacterDBTraits = {
            id: "1",
            agent_id: "test-id",
            // @ts-expect-error: invalid style object
            style: null,
        };

        const result = mergeCharacterTraits(
            baseCharacter,
            invalidStyleDbTraits
        );

        // Should maintain original style structure
        expect(result.style).toEqual(baseCharacter.style);
    });

    it("should handle invalid template values", () => {
        const invalidTemplateDbTraits: CharacterDBTraits = {
            id: "1",
            agent_id: "test-id",
            templates: {
                goalsTemplate: 123,
                factsTemplate: null,
                messageHandlerTemplate: {},
            } as any,
        };

        const result = mergeCharacterTraits(
            baseCharacter,
            invalidTemplateDbTraits
        );

        // Should only keep valid string templates
        expect(
            Object.values(result.templates || {}).every(
                (v) => typeof v === "string"
            )
        ).toBe(true);
        expect(result.templates).not.toHaveProperty("invalidTemplate");
    });

    it("should handle invalid twitter user arrays", () => {
        const invalidTwitterDbTraits: CharacterDBTraits = {
            id: "1",
            agent_id: "test-id",
            env_twitter_target_users: [123, null, "valid", {}] as any,
            env_twitter_knowledge_users: null as any,
        };

        const result = mergeCharacterTraits(
            baseCharacter,
            invalidTwitterDbTraits
        );

        // Should only include valid usernames in comma-separated string
        expect(result.settings?.secrets?.TWITTER_TARGET_USERS).toBe("valid");
        expect(
            result.settings?.secrets?.TWITTER_KNOWLEDGE_USERS
        ).toBeUndefined();
    });
});
