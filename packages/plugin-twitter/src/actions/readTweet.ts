const INVALID_URL_ERROR = "Invalid Twitter URL format";
const VALID_DOMAINS = [
    "x.com",
    "twitter.com",
    "www.x.com",
    "www.twitter.com",
    "mobile.x.com",
    "mobile.twitter.com",
];
const EXPECTED_PATH_PARTS = 3;
const STATUS_SEGMENT_INDEX = 1;
const TWEET_ID_SEGMENT_INDEX = 2;
const STATUS_SEGMENT = "status";
const DIGITS_ONLY_REGEX = /^\d+$/;

/**
 * Extracts the tweet ID from a Twitter/X URL.
 *
 * @param url - The Twitter/X URL to parse
 * @returns The tweet ID
 * @throws Error if the URL format is invalid
 */
export function extractTweetId(url: string): string {
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;

        if (!VALID_DOMAINS.includes(hostname)) {
            throw new Error(INVALID_URL_ERROR);
        }

        const pathname = parsedUrl.pathname.replace(/^\/+|\/+$/g, "");
        const pathParts = pathname.split("/");

        if (pathParts.length !== EXPECTED_PATH_PARTS) {
            throw new Error(INVALID_URL_ERROR);
        }

        if (pathParts[STATUS_SEGMENT_INDEX] !== STATUS_SEGMENT) {
            throw new Error(INVALID_URL_ERROR);
        }

        const tweetId = pathParts[TWEET_ID_SEGMENT_INDEX];

        if (!tweetId || !DIGITS_ONLY_REGEX.test(tweetId)) {
            throw new Error(INVALID_URL_ERROR);
        }

        return tweetId;
    } catch (error) {
        if (error instanceof Error && error.message === INVALID_URL_ERROR) {
            throw error;
        }
        throw new Error(INVALID_URL_ERROR);
    }
}
