import type { Tweet } from "../types";

const EMPTY_LINE = "";
const METRIC_SEPARATOR = " • ";
const JUST_NOW = "Just now";

/**
 * Formats engagement metrics into a string line.
 *
 * @param tweet - The tweet containing metrics
 * @returns A formatted metrics string or null if no metrics exist
 */
function formatMetrics(tweet: Tweet): string | null {
    const metrics: string[] = [];
    if (tweet.likes !== null && tweet.likes !== undefined) {
        metrics.push(`${tweet.likes} likes`);
    }
    if (tweet.retweets !== null && tweet.retweets !== undefined) {
        metrics.push(`${tweet.retweets} retweets`);
    }
    if (tweet.replies !== null && tweet.replies !== undefined) {
        metrics.push(`${tweet.replies} replies`);
    }
    if (tweet.views !== null && tweet.views !== undefined) {
        metrics.push(`${tweet.views} views`);
    }
    return metrics.length > 0 ? metrics.join(METRIC_SEPARATOR) : null;
}

/**
 * Formats media attachments into array of lines.
 *
 * @param tweet - The tweet containing media
 * @returns An array of formatted media lines
 */
function formatMedia(tweet: Tweet): string[] {
    const lines: string[] = [];
    const hasPhotos = tweet.photos && tweet.photos.length > 0;
    const hasVideos = tweet.videos && tweet.videos.length > 0;

    if (hasPhotos) {
        const photoCount = tweet.photos.length;
        lines.push(
            `${photoCount} photo${photoCount === 1 ? "" : "s"} attached`
        );
    }
    if (hasVideos) {
        const videoCount = tweet.videos.length;
        lines.push(
            `${videoCount} video${videoCount === 1 ? "" : "s"} attached`
        );
    }
    if (hasPhotos || hasVideos) {
        lines.push(EMPTY_LINE);
    }
    return lines;
}

/**
 * Formats mentions into array of lines.
 *
 * @param mentions - Array of mention objects or undefined
 * @returns An array of formatted mention lines
 */
function formatMentions(mentions?: Array<{ username?: string }>): string[] {
    if (!mentions || mentions.length === 0) return [];
    const mentionText = mentions.map((m) => `@${m.username}`).join(" ");
    return [`Mentions: ${mentionText}`, EMPTY_LINE];
}

/**
 * Formats hashtags into array of lines.
 *
 * @param hashtags - Array of hashtag strings or undefined
 * @returns An array of formatted hashtag lines
 */
function formatHashtags(hashtags?: string[]): string[] {
    if (!hashtags || hashtags.length === 0) return [];
    const hashtagText = hashtags.map((h) => `#${h}`).join(" ");
    return [`Hashtags: ${hashtagText}`, EMPTY_LINE];
}

/**
 * Formats URLs into array of lines.
 *
 * @param urls - Array of URL strings or undefined
 * @returns An array of formatted URL lines
 */
function formatUrls(urls?: string[]): string[] {
    if (!urls || urls.length === 0) return [];
    return [`URLs: ${urls.join(" ")}`, EMPTY_LINE];
}

/**
 * Converts a timestamp to relative time (e.g., "2 hours ago", "3 days ago").
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Relative time string
 */
function getRelativeTime(timestamp?: number): string {
    if (!timestamp) return JUST_NOW;

    const now = Date.now();
    const diff = now - timestamp * 1000;

    const HOUR_IN_MS = 3600000;
    const DAY_IN_MS = 86400000;

    const days = Math.round(diff / DAY_IN_MS);
    const hours = Math.floor(diff / HOUR_IN_MS);

    if (days >= 1) {
        return `${days} day${days === 1 ? "" : "s"} ago`;
    } else if (hours >= 1) {
        return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
    return JUST_NOW;
}

/**
 * Formats a Tweet object into a readable text string.
 *
 * @param tweet - The tweet to format
 * @returns A formatted string representation of the tweet
 */
export function formatTweet(tweet: Tweet): string {
    const lines: string[] = [];

    // Header: Author info with null safety
    const name = tweet.name ?? "Unknown";
    const username = tweet.username ?? "unknown";
    lines.push(`${name} (@${username})`);
    lines.push(EMPTY_LINE);

    // Tweet text with null safety
    const text = tweet.text ?? "";
    lines.push(text);
    lines.push(EMPTY_LINE);

    // Engagement metrics
    const metricsLine = formatMetrics(tweet);
    if (metricsLine) {
        lines.push(metricsLine);
        lines.push(EMPTY_LINE);
    }

    // Media
    const mediaLines = formatMedia(tweet);
    lines.push(...mediaLines);

    // Mentions, hashtags, URLs
    lines.push(...formatMentions(tweet.mentions));
    lines.push(...formatHashtags(tweet.hashtags));
    lines.push(...formatUrls(tweet.urls));

    // Timestamp
    const relativeTime = getRelativeTime(tweet.timestamp);
    lines.push(relativeTime);

    return lines.join("\n");
}
