import { describe, it, expect } from "vitest";
import { escapeMarkdown } from "../src/utils";

describe("Telegram Utils", () => {
    describe("escapeMarkdown", () => {
        it("should escape markdown special characters", () => {
            const input = "*bold* _italic_ `code`";
            const escaped = escapeMarkdown(input);
            expect(escaped).toBe("\\*bold\\* \\_italic\\_ \\`code\\`");
        });

        it("should handle text without special characters", () => {
            const input = "Hello World 123";
            expect(escapeMarkdown(input)).toBe(input);
        });

        it("should handle empty string", () => {
            expect(escapeMarkdown("")).toBe("");
        });

        it("should not escape when the entire text is a fenced code block", () => {
            const input = "```\n*bold* _italic_ `code`\n```";
            expect(escapeMarkdown(input)).toBe(input);
        });

        it("should preserve embedded fenced code blocks and escape outside text", () => {
            const input =
                "Hello ```\n*bold* _italic_ `code`\n``` World *star* _under_ `code`";
            const expected =
                "Hello ```\n*bold* _italic_ `code`\n``` World \\*star\\* \\_under\\_ \\`code\\`";
            expect(escapeMarkdown(input)).toBe(expected);
        });
    });
});
