import { describe, it, expect } from "vitest";
import { cosineSimilarity, splitMessage } from "../src/clientHelpers";

describe("Telegram Utils", () => {
    describe("cosineSimilarity", () => {
        it("should calculate similarity between two texts", () => {
            const text1 = "hello world";
            const text2 = "hello there";
            const similarity = cosineSimilarity(text1, text2);
            expect(similarity).toBeGreaterThan(0);
            expect(similarity).toBeLessThan(1);
        });

        it("should handle identical texts", () => {
            const text = "hello world test";
            expect(cosineSimilarity(text, text)).toBeCloseTo(1, 5);
        });

        it("should handle completely different texts", () => {
            const text1 = "hello world";
            const text2 = "goodbye universe";
            expect(cosineSimilarity(text1, text2)).toBe(0);
        });

        it("should handle three-way comparison", () => {
            const text1 = "hello world";
            const text2 = "hello there";
            const text3 = "hi world";
            const similarity = cosineSimilarity(text1, text2, text3);
            expect(similarity).toBeGreaterThan(0);
            expect(similarity).toBeLessThan(1);
        });
    });

    describe("splitMessage", () => {
        it("should not split message within limit", () => {
            const message = "Hello World";
            const chunks = splitMessage(message, 4096);
            expect(chunks).toEqual(["Hello World"]);
        });

        it("should handle empty string", () => {
            const chunks = splitMessage("", 4096);
            expect(chunks).toEqual([]);
        });

        it("should keep message intact if shorter than maxLength", () => {
            const message = "Hello World";
            const chunks = splitMessage(message, 11);
            expect(chunks).toEqual(["Hello World"]);
        });
    });
});
