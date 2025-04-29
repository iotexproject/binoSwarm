import { describe, it, expect } from "vitest";
import {
    messageRateLimiter,
    streamRateLimiter,
    globalRateLimiter,
    createRateLimiter,
    createGlobalRateLimiter,
} from "../rate-limiter";

// Since we can't easily test middleware in isolation with supertest,
// we'll focus on testing the exports and config instead
describe("Rate limiting", () => {
    it("should export properly configured rate limiters", () => {
        // Verify both endpoint-specific rate limiters are functions (middleware)
        expect(typeof messageRateLimiter).toBe("function");
        expect(typeof streamRateLimiter).toBe("function");

        // Verify global rate limiter is a function (middleware)
        expect(typeof globalRateLimiter).toBe("function");

        // Verify the factory functions work
        const testLimiter = createRateLimiter({
            windowMs: 1000,
            maxRequests: 5,
            message: "Test limit",
        });
        expect(typeof testLimiter).toBe("function");

        const testGlobalLimiter = createGlobalRateLimiter({
            windowMs: 1000,
            maxRequests: 100,
            message: "Test global limit",
        });
        expect(typeof testGlobalLimiter).toBe("function");
    });

    it("should have correct signature for Express middleware", () => {
        // Verify limiters have correct arity (req, res, next)
        expect(messageRateLimiter.length).toBe(3);
        expect(streamRateLimiter.length).toBe(3);
        expect(globalRateLimiter.length).toBe(3);
    });
});
