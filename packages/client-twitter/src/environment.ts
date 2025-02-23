import {
    parseBooleanFromText,
    IAgentRuntime,
    ActionTimelineType,
} from "@elizaos/core";
import { z, ZodError } from "zod";

export const DEFAULT_MAX_TWEET_LENGTH = 280;
export const DEFAULT_POST_INTERVAL_MIN = 90;
export const DEFAULT_POST_INTERVAL_MAX = 180;
export const DEFAULT_TWITTER_RETRY_LIMIT = 3;
export const DEFAULT_TWITTER_POLL_INTERVAL = 120;
export const DEFAULT_ACTION_INTERVAL = 5;
export const DEFAULT_MAX_ACTIONS_PROCESSING = 1;

const twitterUsernameSchema = z
    .string()
    .min(1, "An X/Twitter Username must be at least 1 character long")
    .max(15, "An X/Twitter Username cannot exceed 15 characters")
    .refine((username) => {
        // Allow wildcard '*' as a special case
        if (username === "*") return true;

        // Twitter usernames can:
        // - Start with digits now
        // - Contain letters, numbers, underscores
        // - Must not be empty
        return /^[A-Za-z0-9_]+$/.test(username);
    }, "An X Username can only contain letters, numbers, and underscores");

export const twitterEnvSchema = z.object({
    TWITTER_USERNAME: twitterUsernameSchema,
    TWITTER_PASSWORD: z.string().min(1, "X/Twitter password is required"),
    TWITTER_EMAIL: z.string().email("Valid X/Twitter email is required"),
    MAX_TWEET_LENGTH: z.number().int().default(DEFAULT_MAX_TWEET_LENGTH),
    TWITTER_SEARCH_ENABLE: z.boolean().default(false),
    TWITTER_2FA_SECRET: z.string(),
    TWITTER_RETRY_LIMIT: z.number().int(),
    TWITTER_POLL_INTERVAL: z.number().int(),
    TWITTER_TARGET_USERS: z.array(twitterUsernameSchema).default([]),
    TWITTER_KNOWLEDGE_USERS: z.array(twitterUsernameSchema).default([]),
    POST_INTERVAL_MIN: z.number().int(),
    POST_INTERVAL_MAX: z.number().int(),
    ENABLE_ACTION_PROCESSING: z.boolean(),
    ACTION_INTERVAL: z.number().int(),
    POST_IMMEDIATELY: z.boolean(),
    TWITTER_SPACES_ENABLE: z.boolean().default(false),
    MAX_ACTIONS_PROCESSING: z.number().int(),
    ACTION_TIMELINE_TYPE: z
        .nativeEnum(ActionTimelineType)
        .default(ActionTimelineType.ForYou),
});

export type TwitterConfig = z.infer<typeof twitterEnvSchema>;

function parseTargetUsers(targetUsersStr?: string | null): string[] {
    if (!targetUsersStr?.trim()) {
        return [];
    }
    return targetUsersStr
        .split(",")
        .map((user) => user.trim())
        .filter(Boolean);
}

function safeParsePositiveInt(
    value: string | undefined | null,
    defaultValue: number
): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : Math.max(defaultValue, parsed);
}

/**
 * Validates or constructs a TwitterConfig object using zod,
 */
// This also is organized to serve as a point of documentation for the client
// most of the inputs from the framework (env/character)

// we also do a lot of typing/parsing here
// so we can do it once and only once per character
export async function validateTwitterConfig(
    runtime: IAgentRuntime
): Promise<TwitterConfig> {
    try {
        const twitterConfig = {
            TWITTER_USERNAME: runtime.getSetting("TWITTER_USERNAME"),

            TWITTER_PASSWORD: runtime.getSetting("TWITTER_PASSWORD"),

            TWITTER_EMAIL: runtime.getSetting("TWITTER_EMAIL"),

            // number as string?
            MAX_TWEET_LENGTH: safeParsePositiveInt(
                runtime.getSetting("MAX_TWEET_LENGTH"),
                DEFAULT_MAX_TWEET_LENGTH
            ),

            TWITTER_SEARCH_ENABLE:
                parseBooleanFromText(
                    runtime.getSetting("TWITTER_SEARCH_ENABLE")
                ) ?? false,

            // string passthru
            TWITTER_2FA_SECRET: runtime.getSetting("TWITTER_2FA_SECRET") || "",

            // int
            TWITTER_RETRY_LIMIT: safeParsePositiveInt(
                runtime.getSetting("TWITTER_RETRY_LIMIT"),
                DEFAULT_TWITTER_RETRY_LIMIT
            ),

            // int in seconds
            TWITTER_POLL_INTERVAL: safeParsePositiveInt(
                runtime.getSetting("TWITTER_POLL_INTERVAL"),
                DEFAULT_TWITTER_POLL_INTERVAL
            ),

            // comma separated string
            TWITTER_TARGET_USERS: parseTargetUsers(
                runtime.getSetting("TWITTER_TARGET_USERS")
            ),

            TWITTER_KNOWLEDGE_USERS: parseTargetUsers(
                runtime.getSetting("TWITTER_KNOWLEDGE_USERS")
            ),

            // int in minutes
            POST_INTERVAL_MIN: safeParsePositiveInt(
                runtime.getSetting("POST_INTERVAL_MIN"),
                DEFAULT_POST_INTERVAL_MIN
            ),

            // int in minutes
            POST_INTERVAL_MAX: safeParsePositiveInt(
                runtime.getSetting("POST_INTERVAL_MAX"),
                DEFAULT_POST_INTERVAL_MAX
            ),

            // bool
            ENABLE_ACTION_PROCESSING:
                parseBooleanFromText(
                    runtime.getSetting("ENABLE_ACTION_PROCESSING")
                ) ?? false,

            // init in minutes (min 1m)
            ACTION_INTERVAL: safeParsePositiveInt(
                runtime.getSetting("ACTION_INTERVAL"),
                DEFAULT_ACTION_INTERVAL
            ),

            // bool
            POST_IMMEDIATELY:
                parseBooleanFromText(runtime.getSetting("POST_IMMEDIATELY")) ??
                false,

            TWITTER_SPACES_ENABLE:
                parseBooleanFromText(
                    runtime.getSetting("TWITTER_SPACES_ENABLE")
                ) ?? false,

            MAX_ACTIONS_PROCESSING: safeParsePositiveInt(
                runtime.getSetting("MAX_ACTIONS_PROCESSING"),
                DEFAULT_MAX_ACTIONS_PROCESSING
            ),

            ACTION_TIMELINE_TYPE:
                runtime.getSetting("ACTION_TIMELINE_TYPE") || undefined,
        };

        return twitterEnvSchema.parse(twitterConfig);
    } catch (error) {
        if (error instanceof ZodError) {
            parseAndThrowZodError(error);
        }
        throw error;
    }
}

function parseAndThrowZodError(error: z.ZodError<any>) {
    const errorMessages = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
    throw new Error(
        `X/Twitter configuration validation failed:\n${errorMessages}`
    );
}
