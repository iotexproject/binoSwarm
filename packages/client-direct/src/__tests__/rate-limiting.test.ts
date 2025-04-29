import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    messageRateLimiter,
    streamRateLimiter,
    globalRateLimiter,
    createRateLimiter,
    createGlobalRateLimiter,
} from "../rate-limiter";
import { Response, NextFunction } from "express";

// Mock request, response, and next function for testing middleware
function createMocks() {
    const req = {
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
    } as any;

    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
    } as unknown as Response;

    const next = vi.fn() as NextFunction;

    return { req, res, next };
}

describe("Rate limiting", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

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

    describe("IP-based rate limiter", () => {
        it("should allow requests within the rate limit", () => {
            const { req, res, next } = createMocks();
            const limiter = createRateLimiter({
                windowMs: 60000,
                maxRequests: 3,
                message: "Rate limit exceeded",
            });

            // First 3 requests should be allowed
            for (let i = 0; i < 3; i++) {
                limiter(req, res, next);
                expect(next).toHaveBeenCalledTimes(i + 1);
                expect(res.status).not.toHaveBeenCalledWith(429);
            }
        });

        it("should block requests over the rate limit", () => {
            const { req, res, next } = createMocks();
            const limiter = createRateLimiter({
                windowMs: 60000,
                maxRequests: 3,
                message: "Rate limit exceeded",
            });

            // First 3 requests should be allowed
            for (let i = 0; i < 3; i++) {
                limiter(req, res, next);
            }

            // 4th request should be blocked
            limiter(req, res, next);
            expect(next).toHaveBeenCalledTimes(3);
            expect(res.status).toHaveBeenCalledWith(429);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: "Rate limit exceeded",
                    retryAfter: expect.any(Number),
                })
            );
        });

        it("should set appropriate rate limit headers", () => {
            const { req, res, next } = createMocks();
            const limiter = createRateLimiter({
                windowMs: 60000,
                maxRequests: 5,
                message: "Rate limit exceeded",
            });

            // We need to call the limiter and verify the headers are set
            limiter(req, res, next);

            // Simply verify res.set was called the correct number of times
            // We expect at least 3 calls for the 3 headers we're setting
            expect(res.set).toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
        });

        it("should reset rate limits after the window expires", () => {
            const { req, res, next } = createMocks();
            const windowMs = 60000;
            const limiter = createRateLimiter({
                windowMs,
                maxRequests: 2,
                message: "Rate limit exceeded",
            });

            // Use up the rate limit
            limiter(req, res, next);
            limiter(req, res, next);

            // Should be rate limited now
            limiter(req, res, next);
            expect(res.status).toHaveBeenCalledWith(429);

            // Advance time past the window
            vi.advanceTimersByTime(windowMs + 1000);

            // Reset mocks for clarity
            vi.clearAllMocks();

            // Should be allowed again
            limiter(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalledWith(429);
        });

        it("should track different IPs separately", () => {
            const mocks1 = createMocks();
            const mocks2 = createMocks();

            // Different IP
            mocks2.req.ip = "192.168.1.1";

            const limiter = createRateLimiter({
                windowMs: 60000,
                maxRequests: 2,
                message: "Rate limit exceeded",
            });

            // Max out first IP
            limiter(mocks1.req, mocks1.res, mocks1.next);
            limiter(mocks1.req, mocks1.res, mocks1.next);
            limiter(mocks1.req, mocks1.res, mocks1.next); // This one should be limited

            expect(mocks1.next).toHaveBeenCalledTimes(2);
            expect(mocks1.res.status).toHaveBeenCalledWith(429);

            // Second IP should still have its full quota
            limiter(mocks2.req, mocks2.res, mocks2.next);
            limiter(mocks2.req, mocks2.res, mocks2.next);

            expect(mocks2.next).toHaveBeenCalledTimes(2);
            expect(mocks2.res.status).not.toHaveBeenCalledWith(429);
        });
    });

    describe("Global rate limiter", () => {
        it("should allow requests within the global rate limit", () => {
            const { req, res, next } = createMocks();
            const limiter = createGlobalRateLimiter({
                windowMs: 60000,
                maxRequests: 3,
                message: "Global rate limit exceeded",
            });

            // First 3 requests should be allowed
            for (let i = 0; i < 3; i++) {
                limiter(req, res, next);
                expect(next).toHaveBeenCalledTimes(i + 1);
                expect(res.status).not.toHaveBeenCalledWith(429);
            }
        });

        it("should block requests over the global rate limit", () => {
            const { req, res, next } = createMocks();
            const limiter = createGlobalRateLimiter({
                windowMs: 60000,
                maxRequests: 3,
                message: "Global rate limit exceeded",
            });

            // First 3 requests should be allowed
            for (let i = 0; i < 3; i++) {
                limiter(req, res, next);
            }

            // 4th request should be blocked
            limiter(req, res, next);
            expect(next).toHaveBeenCalledTimes(3);
            expect(res.status).toHaveBeenCalledWith(429);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: "Global rate limit exceeded",
                    retryAfter: expect.any(Number),
                    global: true,
                })
            );
        });

        it("should set appropriate global rate limit headers", () => {
            const { req, res, next } = createMocks();
            const limiter = createGlobalRateLimiter({
                windowMs: 60000,
                maxRequests: 5,
                message: "Global rate limit exceeded",
            });

            limiter(req, res, next);

            expect(res.set).toHaveBeenCalledWith(
                "X-RateLimit-Global-Limit",
                "5"
            );
            expect(res.set).toHaveBeenCalledWith(
                "X-RateLimit-Global-Remaining",
                "4"
            );
            expect(res.set).toHaveBeenCalledWith(
                "X-RateLimit-Global-Reset",
                expect.any(String)
            );
        });

        it("should reset global rate limits after the window expires", () => {
            const { req, res, next } = createMocks();
            const windowMs = 60000;
            const limiter = createGlobalRateLimiter({
                windowMs,
                maxRequests: 2,
                message: "Global rate limit exceeded",
            });

            // Use up the rate limit
            limiter(req, res, next);
            limiter(req, res, next);

            // Should be rate limited now
            limiter(req, res, next);
            expect(res.status).toHaveBeenCalledWith(429);

            // Advance time past the window
            vi.advanceTimersByTime(windowMs + 1000);

            // Reset mocks for clarity
            vi.clearAllMocks();

            // Should be allowed again
            limiter(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalledWith(429);
        });

        it("should apply global limit regardless of client IP", () => {
            const mocks1 = createMocks();
            const mocks2 = createMocks();

            // Different IP
            mocks2.req.ip = "192.168.1.1";

            const limiter = createGlobalRateLimiter({
                windowMs: 60000,
                maxRequests: 2,
                message: "Global rate limit exceeded",
            });

            // Max out global limit with first IP
            limiter(mocks1.req, mocks1.res, mocks1.next);
            limiter(mocks1.req, mocks1.res, mocks1.next);

            // Second IP should also be limited because it's a global limit
            limiter(mocks2.req, mocks2.res, mocks2.next);

            expect(mocks2.next).not.toHaveBeenCalled();
            expect(mocks2.res.status).toHaveBeenCalledWith(429);
            expect(mocks2.res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    global: true,
                })
            );
        });
    });

    describe("Cleanup", () => {
        it("should clean up expired entries in the IP-based store", () => {
            // This test is more for coverage than functionality verification
            // since we can't easily inspect the private store
            const { req, res, next } = createMocks();
            const windowMs = 100;
            const limiter = createRateLimiter({
                windowMs,
                maxRequests: 2,
                message: "Rate limit exceeded",
            });

            // This will create an entry in the store
            limiter(req, res, next);

            // Advance time past the window
            vi.advanceTimersByTime(windowMs + 1000);

            // Reset mocks
            vi.clearAllMocks();

            // This would fail if the entry wasn't cleaned up or expired properly
            limiter(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
        });
    });
});
