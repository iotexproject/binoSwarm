import { z } from "zod";

import elizaLogger from "./logger";

const jsonBlockPattern = /```json\n([\s\S]*?)\n```/;

export const parseBooleanFromText = (text: string): boolean | null => {
    const match = text?.match(/\b(YES|NO|TRUE|FALSE|ON|OFF|ENABLE|DISABLE)\b/i);

    if (match) {
        const normalizedText = match[0].toUpperCase();
        const isTrue =
            normalizedText === "YES" ||
            normalizedText === "TRUE" ||
            normalizedText === "ON" ||
            normalizedText === "ENABLE";
        return isTrue;
    }
    return null;
};

export const stringArraySchema = z.object({
    values: z.array(z.string()),
});

export function parseJsonArrayFromText(text: string) {
    let jsonData = null;

    // First try to parse with the original JSON format
    const jsonBlockMatch = text?.match(jsonBlockPattern);

    if (jsonBlockMatch) {
        try {
            // Replace single quotes with double quotes before parsing
            const normalizedJson = jsonBlockMatch[1].replace(
                /(?<!\\)'([^']*)'(?=[,}\]])/g,
                '"$1"'
            );
            jsonData = JSON.parse(normalizedJson);
        } catch (e) {
            elizaLogger.error("Error parsing JSON:", e);
        }
    }

    // If that fails, try to find an array pattern
    if (!jsonData) {
        const arrayPattern = /\[\s*(['"])(.*?)\1\s*\]/;
        const arrayMatch = text?.match(arrayPattern);

        if (arrayMatch) {
            try {
                // Replace single quotes with double quotes before parsing
                const normalizedJson = arrayMatch[0].replace(
                    /(?<!\\)'([^']*)'(?=[,}\]])/g,
                    '"$1"'
                );
                jsonData = JSON.parse(normalizedJson);
            } catch (e) {
                elizaLogger.error("Error parsing JSON:", e);
            }
        }
    }

    if (!jsonData) {
        try {
            jsonData = JSON.parse(text);
        } catch (e) {
            elizaLogger.error("Error parsing JSON:", e);
        }
    }

    if (Array.isArray(jsonData)) {
        return jsonData;
    }

    return null;
}

export function truncateToCompleteSentence(
    text: string,
    maxLength: number
): string {
    if (text.length <= maxLength) {
        return text;
    }

    // Attempt to truncate at the last period within the limit
    const lastPeriodIndex = text.lastIndexOf(".", maxLength - 1);
    if (lastPeriodIndex !== -1) {
        const truncatedAtPeriod = text.slice(0, lastPeriodIndex + 1).trim();
        if (truncatedAtPeriod.length > 0) {
            return truncatedAtPeriod;
        }
    }

    // If no period, truncate to the nearest whitespace within the limit
    const lastSpaceIndex = text.lastIndexOf(" ", maxLength - 1);
    if (lastSpaceIndex !== -1) {
        const truncatedAtSpace = text.slice(0, lastSpaceIndex).trim();
        if (truncatedAtSpace.length > 0) {
            return truncatedAtSpace + "...";
        }
    }

    // Fallback: Hard truncate and add ellipsis
    const hardTruncated = text.slice(0, maxLength - 3).trim();
    return hardTruncated + "...";
}
