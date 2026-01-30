# plugin-twitter Package Notes

Twitter/X integration plugin for BinoSwarm. Package-specific patterns and gotchas.

## Commands

- Test: `cd packages/plugin-twitter && pnpm test`
- Lint: `pnpm lint`
- Build: `pnpm build`

## Critical Gotchas

### Twitter Client Structure

The Twitter client has a **nested `v2` property** - this is the most common source of bugs:

```typescript
// CORRECT
const twitterClient = runtime.clients["twitter"] as { v2: { getTweet: ... } };
await twitterClient.v2.getTweet(tweetId);

// WRONG - will fail
await twitterClient.getTweet(tweetId);
```

### Mock Pattern

Tests must match the exact client structure:

```typescript
// CORRECT
const mockTwitterClient = {
    v2: { getTweet: vi.fn().mockResolvedValue(mockData) }
};

// WRONG - missing v2 property
{ getTweet: vi.fn() }
```

### Handler Testing

Handlers return `Promise<boolean>`, not promises that reject. Test callbacks, not throws:

```typescript
// CORRECT
const callback = vi.fn();
await handler(runtime, message, state, {}, callback);
expect(callback).toHaveBeenCalledWith({ text: "..." });

// WRONG - handlers don't throw
await expect(handler(...)).rejects.toThrow();
```

## Type Safety

### Type Guards for API Errors

```typescript
function isTwitterApiError(error: unknown): error is { code?: number; status?: number } {
    return typeof error === "object" && error !== null && ("code" in error || "status" in error);
}
```

### Null Safety in Formatting

```typescript
// GOOD
const name = tweet.name ?? "Unknown";
const text = tweet.text ?? "";

// BAD - shows "null" in output
const formatted = `By ${tweet.name}`;
```

## Code Patterns

### Extract Constants

```typescript
const INVALID_URL_MESSAGE = "I couldn't read that URL...";
const TWITTER_URL_PATTERN = /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)/i;
```

### Helper Functions

Break into small, testable functions:
- `extractTwitterUrl(text: string): string | null`
- `extractTweetId(url: string): string`
- `formatTweet(tweet: Tweet): string`

### Error Handling

```typescript
try {
    // action logic
    callback({ text: "Success" });
    return true;
} catch (error) {
    elizaLogger.error("Action failed:", error);
    callback({ text: "User-friendly error" });
    return false;
}
```

## File Structure

```
src/
├── actions/       # Action handlers (READ_TWEET, etc.)
├── utils/         # Utilities (extractTweetId, formatTweet)
├── test/          # Co-located tests
└── index.ts       # Plugin export with actions array
```

## Common Pitfalls

1. Forgetting `v2` property in client access/mocks
2. Throwing from handlers instead of using callbacks
3. Missing action name in similes array (must be first element)
4. Unsafe type assertions on external data
5. Not handling null/undefined in formatting utilities
