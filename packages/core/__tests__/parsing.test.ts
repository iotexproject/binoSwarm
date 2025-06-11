import { describe, it, expect } from "vitest";

import { parseBooleanFromText, parseJsonArrayFromText } from "../src/parsing";

describe("Parsing Module", () => {
    describe("parseBooleanFromText", () => {
        it("should parse exact YES/NO matches", () => {
            expect(parseBooleanFromText("YES")).toBe(true);
            expect(parseBooleanFromText("NO")).toBe(false);
        });

        it("should handle case insensitive input", () => {
            expect(parseBooleanFromText("yes")).toBe(true);
            expect(parseBooleanFromText("no")).toBe(false);
        });

        it("should return null for invalid input", () => {
            expect(parseBooleanFromText("")).toBe(null);
            expect(parseBooleanFromText("maybe")).toBe(null);
            expect(parseBooleanFromText("1")).toBe(null);
        });
    });

    describe("parseJsonArrayFromText", () => {
        it("should parse JSON array from code block", () => {
            const input = '```json\n["item1", "item2", "item3"]\n```';
            expect(parseJsonArrayFromText(input)).toEqual([
                "item1",
                "item2",
                "item3",
            ]);
        });

        it("should handle empty arrays", () => {
            expect(parseJsonArrayFromText("```json\n[]\n```")).toEqual([]);
            expect(parseJsonArrayFromText("[]")).toEqual([]);
        });

        it("should return null for invalid JSON", () => {
            expect(parseJsonArrayFromText("invalid")).toBe(null);
            expect(parseJsonArrayFromText("[invalid]")).toBe(null);
            expect(parseJsonArrayFromText("```json\n[invalid]\n```")).toBe(
                null
            );
        });
    });
});
