# plugin-twitter Package Notes

Twitter/X integration plugin for BinoSwarm. Package-specific patterns and gotchas.

## Commands

- Test: `cd packages/plugin-twitter && pnpm test`
- Test with coverage: `pnpm test:coverage`
- Lint: `pnpm lint`
- Build: `pnpm build`

## Coverage

**Current Coverage**: 100% statements, 97.36% branches, 100% functions
- **Total Tests**: 112 (23 extractTweetId + 28 client + 61 readTweet)
- **Coverage Date**: 2026-02-03
- **TDD Context Archived**: `archive/tdd-context-readTweet-coverage-2026-02-03.md`

## Architecture

### LLM-Driven Pattern (Current)

The plugin follows the lightweight LLM-driven pattern used in `plugin-depin`:

```typescript
// 1. Fetch raw data from API
const tweetData = await twitterClient.v2.getTweet(tweetId);

// 2. Pass to LLM via template context
state.tweetData = JSON.stringify(tweetData);

// 3. Generate LLM response
const context = composeContext({ state, template: tweetResponseTemplate });
const response = await generateMessageResponse({ runtime, context, state });

// 4. Send LLM-generated response
callback(response);
```

**Benefits:**
- Works independently of loaded Twitter client (only needs TWITTER_BEARER_TOKEN)
- LLM generates persona-aware, contextual responses
- Simpler code - no heavy formatting logic
- Follows established patterns (ASK_SENTAI in plugin-depin)

### Lightweight Twitter Client

The `TwitterReadClient` in `src/client.ts` provides read-only access:

```typescript
import { createTwitterReadClient } from "../client";

// Creates client independently of runtime.clients.twitter
const readClient = await createTwitterReadClient(runtime);
const tweetData = await readClient.getTweet(tweetId);
```

**Key Features:**
- Returns raw Twitter API v2 responses (no transformation)
- Works with just TWITTER_BEARER_TOKEN environment variable
- Handles error extraction for rate limits (429), not found (404), forbidden (403)

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

### Lightweight Client Fallback

The handler automatically creates a lightweight client if runtime client not loaded:

```typescript
// Handler tries runtime client first, falls back to lightweight
if (!twitterClient || !twitterClient.v2) {
    const readClient = await createTwitterReadClient(runtime);
    if (!readClient) {
        // TWITTER_BEARER_TOKEN missing
        return false;
    }
    twitterClient = { v2: { getTweet: (id) => readClient.getTweet(id) } };
}
```

### Mock Pattern for Tests

Tests must match the exact client structure:

```typescript
// CORRECT - for runtime client tests
const mockTwitterClient = {
    v2: { getTweet: vi.fn().mockResolvedValue(mockData) }
};

// CORRECT - for lightweight client tests
vi.mock("../client", () => ({
    createTwitterReadClient: vi.fn(),
    TwitterReadClient: class {
        constructor(bearerToken: string) {}
        async getTweet(id: string) { return mockData; }
    }
}));
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

### LLM Function Mocking

When testing handlers that use `generateMessageResponse`:

```typescript
// Module-level mock
vi.mock("@elizaos/core", () => ({
    ...vi.importActual("@elizaos/core"),
    generateMessageResponse: vi.fn().mockResolvedValue({ text: "Response" }),
    composeContext: vi.fn((args) => args.template),
}));
```

## Type Safety

### Type Guards for API Errors

```typescript
function isTwitterApiError(error: unknown): error is { code?: number; status?: number } {
    return typeof error === "object" && error !== null && ("code" in error || "status" in error);
}
```

### Local Type Definitions

The plugin has its own type definitions in `src/types.ts` to avoid depending on client-twitter package:

```typescript
// Local types - not imported from @elizaos/client-twitter
export interface Tweet {
    id: string;
    text: string;
    // ... etc
}
```

## Code Patterns

### Extract Constants

```typescript
const INVALID_URL_MESSAGE = "I couldn't read that URL...";
const TWEET_NOT_AVAILABLE_MESSAGE = "This tweet is not available";
const TWITTER_URL_PATTERN = /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)/i;
```

### Helper Functions

Break into small, testable functions:
- `extractTwitterUrl(text: string): string | null`
- `extractTweetId(url: string): string`

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

### State Management

Handlers should initialize state if needed:

```typescript
if (!state) {
    state = (await runtime.composeState(message)) as State;
} else if (typeof runtime.updateRecentMessageState === "function") {
    state = await runtime.updateRecentMessageState(state);
}
```

## File Structure

```
src/
├── actions/       # Action handlers (READ_TWEET, etc.)
├── utils/         # Utilities (extractTweetId)
├── client.ts      # Lightweight Twitter API client
├── template.ts    # LLM response templates
├── types.ts       # Local type definitions
├── test/          # Co-located tests
└── index.ts       # Plugin export with actions array
archive/
└── tdd-context-*.md  # Archived TDD context files
```

## Common Pitfalls

1. Forgetting `v2` property in client access/mocks
2. Throwing from handlers instead of using callbacks
3. Missing action name in similes array (must be first element)
4. Unsafe type assertions on external data
5. Not mocking LLM functions (generateMessageResponse, composeContext) in tests
6. Assuming runtime.updateRecentMessageState exists (check with typeof)
7. Not handling case where createTwitterReadClient returns null (missing BEARER_TOKEN)

## Migration History

### 2026-02-03: LLM-Driven Refactoring

**Changes:**
- Removed `formatTweet` utility (162 lines deleted)
- Added lightweight `TwitterReadClient` (125 lines)
- Added `tweetResponseTemplate` for LLM responses
- Refactored `readTweet` handler to use LLM pattern
- Coverage improved from 57.65% to 100%

**Commits:**
- 315779c3: Fix type import error
- 8d4cd6a9: Add lightweight Twitter read client
- d0b05933: Add LLM response template
- ba79f141: Convert READ_TWEET to LLM-driven pattern
- 302bae9c: Remove deprecated formatTweet utility
