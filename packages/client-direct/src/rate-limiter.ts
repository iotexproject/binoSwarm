import { Request, Response, NextFunction } from "express";
import { getEnvVariable } from "@elizaos/core";

interface RateLimitOptions {
    windowMs: number;
    maxRequests: number;
    message: string;
}

interface RateLimitStore {
    [key: string]: {
        count: number;
        resetTime: number;
    };
}

/**
 * A memory-based rate limiter implementation for Express
 * Identifies clients by IP address
 */
export function createRateLimiter(options: RateLimitOptions) {
    const store: RateLimitStore = {};
    const windowMs = options.windowMs || 60 * 1000; // default 1 minute
    const maxRequests = options.maxRequests || 10; // default 10 requests per window
    const message =
        options.message || "Too many requests, please try again later.";

    // Clean up expired entries every 5 minutes
    setInterval(
        () => {
            const now = Date.now();
            for (const key in store) {
                if (store[key].resetTime < now) {
                    delete store[key];
                }
            }
        },
        5 * 60 * 1000
    );

    return function rateLimiter(
        req: Request,
        res: Response,
        next: NextFunction
    ): void {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const now = Date.now();

        // Initialize or reset expired entry
        if (!store[ip] || store[ip].resetTime < now) {
            store[ip] = {
                count: 1,
                resetTime: now + windowMs,
            };
            next();
            return;
        }

        // Increment existing entry
        store[ip].count += 1;

        // Check if limit exceeded
        if (store[ip].count > maxRequests) {
            // Calculate retry-after in seconds
            const retryAfter = Math.ceil((store[ip].resetTime - now) / 1000);

            // Set headers
            res.set("Retry-After", String(retryAfter));
            res.set("X-RateLimit-Limit", String(maxRequests));
            res.set("X-RateLimit-Remaining", "0");
            res.set(
                "X-RateLimit-Reset",
                String(Math.ceil(store[ip].resetTime / 1000))
            );

            res.status(429).json({
                error: message,
                retryAfter: retryAfter,
            });
            return;
        }

        // Set rate limit headers
        res.set("X-RateLimit-Limit", String(maxRequests));
        res.set("X-RateLimit-Remaining", String(maxRequests - store[ip].count));
        res.set(
            "X-RateLimit-Reset",
            String(Math.ceil(store[ip].resetTime / 1000))
        );

        next();
    };
}

/**
 * Creates a global rate limiter that restricts total requests across all clients
 * Protects the server from overall high load regardless of client identity
 */
export function createGlobalRateLimiter(options: RateLimitOptions) {
    const windowMs = options.windowMs || 60 * 1000;
    const maxRequests = options.maxRequests || 100;
    const message =
        options.message ||
        "Server is experiencing high load. Please try again later.";

    // Simple counter instead of IP-based store
    let requestCount = 0;
    let resetTime = Date.now() + windowMs;

    // Reset counter on interval
    setInterval(() => {
        requestCount = 0;
        resetTime = Date.now() + windowMs;
    }, windowMs);

    return function globalRateLimiter(
        req: Request,
        res: Response,
        next: NextFunction
    ): void {
        const now = Date.now();

        // Reset if window expired
        if (now > resetTime) {
            requestCount = 0;
            resetTime = now + windowMs;
        }

        // Increment counter
        requestCount++;

        // Check global limit
        if (requestCount > maxRequests) {
            const retryAfter = Math.ceil((resetTime - now) / 1000);

            res.set("Retry-After", String(retryAfter));
            res.set("X-RateLimit-Global-Limit", String(maxRequests));
            res.set("X-RateLimit-Global-Remaining", "0");
            res.set(
                "X-RateLimit-Global-Reset",
                String(Math.ceil(resetTime / 1000))
            );

            res.status(429).json({
                error: message,
                retryAfter: retryAfter,
                global: true,
            });
            return;
        }

        // Set global rate limit headers
        res.set("X-RateLimit-Global-Limit", String(maxRequests));
        res.set(
            "X-RateLimit-Global-Remaining",
            String(maxRequests - requestCount)
        );
        res.set(
            "X-RateLimit-Global-Reset",
            String(Math.ceil(resetTime / 1000))
        );

        next();
    };
}

const DEFAULT_MESSAGE_RATE_LIMIT_WINDOW_MS = "60000";
const DEFAULT_MESSAGE_RATE_LIMIT_MAX = "5";
const DEFAULT_STREAM_RATE_LIMIT_WINDOW_MS = "60000";
const DEFAULT_STREAM_RATE_LIMIT_MAX = "3";
const DEFAULT_GLOBAL_RATE_LIMIT_WINDOW_MS = "60000";
const DEFAULT_GLOBAL_RATE_LIMIT_MAX = "200";

// Create standard rate limiters with configurable settings
export const messageRateLimiter = createRateLimiter({
    windowMs: parseInt(
        getEnvVariable("RATE_LIMIT_MESSAGE_WINDOW_MS") ||
            DEFAULT_MESSAGE_RATE_LIMIT_WINDOW_MS
    ),
    maxRequests: parseInt(
        getEnvVariable("RATE_LIMIT_MESSAGE_MAX") ||
            DEFAULT_MESSAGE_RATE_LIMIT_MAX
    ),
    message:
        "Rate limit exceeded for message endpoint. Please try again later.",
});

export const streamRateLimiter = createRateLimiter({
    windowMs: parseInt(
        getEnvVariable("RATE_LIMIT_STREAM_WINDOW_MS") ||
            DEFAULT_STREAM_RATE_LIMIT_WINDOW_MS
    ),
    maxRequests: parseInt(
        getEnvVariable("RATE_LIMIT_STREAM_MAX") || DEFAULT_STREAM_RATE_LIMIT_MAX
    ),
    message:
        "Rate limit exceeded for message-stream endpoint. Please try again later.",
});

// Create a global rate limiter for overall server protection
export const globalRateLimiter = createGlobalRateLimiter({
    windowMs: parseInt(
        getEnvVariable("RATE_LIMIT_GLOBAL_WINDOW_MS") ||
            DEFAULT_GLOBAL_RATE_LIMIT_WINDOW_MS
    ),
    maxRequests: parseInt(
        getEnvVariable("RATE_LIMIT_GLOBAL_MAX") || DEFAULT_GLOBAL_RATE_LIMIT_MAX
    ),
    message: "Server is experiencing high load. Please try again later.",
});
