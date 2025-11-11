import { describe, expect, it } from "vitest";

import {
    formatRateLimitInfo,
    getErrorCode,
    hasInvalidSinceId,
} from "../src/twitterApiErrors";

describe("twitterApiErrors", () => {
    describe("getErrorCode", () => {
        it("returns numeric error code when present", () => {
            const error = { code: 429 };
            expect(getErrorCode(error)).toBe(429);
        });

        it("returns undefined when code is missing or invalid", () => {
            expect(getErrorCode({ code: "429" })).toBeUndefined();
            expect(getErrorCode({})).toBeUndefined();
            expect(getErrorCode(null)).toBeUndefined();
        });
    });

    describe("formatRateLimitInfo", () => {
        it("formats limit, remaining, and reset values when available", () => {
            const error = {
                rateLimit: { limit: 400, remaining: 0, reset: 1234567890 },
            };
            expect(formatRateLimitInfo(error)).toBe(
                "limit=400, remaining=0, reset=1234567890"
            );
        });

        it("omits missing fields and returns null when rate limit info absent", () => {
            expect(formatRateLimitInfo({ rateLimit: { limit: 100 } })).toBe(
                "limit=100"
            );
            expect(formatRateLimitInfo({})).toBeNull();
            expect(formatRateLimitInfo(null)).toBeNull();
        });
    });

    describe("hasInvalidSinceId", () => {
        it("detects invalid since_id when present in parameters", () => {
            const error = {
                data: {
                    errors: [{ parameters: { since_id: "123" } }],
                },
            };
            expect(hasInvalidSinceId(error)).toBe(true);
        });

        it("detects invalid since_id when referenced in error message", () => {
            const error = {
                data: {
                    errors: [{ message: "Invalid since_id supplied" }],
                },
            };
            expect(hasInvalidSinceId(error)).toBe(true);
        });

        it("returns false when since_id is not referenced", () => {
            const error = {
                data: {
                    errors: [{ parameters: { other: "value" } }],
                },
            };
            expect(hasInvalidSinceId(error)).toBe(false);
        });
    });
});
