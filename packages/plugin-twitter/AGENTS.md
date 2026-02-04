# plugin-twitter Package Guidelines

Twitter/X integration plugin using LLM-driven responses.

## Package Structure

```
src/
├── actions/
│   └── readTweet/          # Modular action components
│       ├── clientUtils.ts  # Client validation/helpers
│       ├── types.ts        # Action-specific types
│       └── utils.ts        # Tweet extraction & validation
├── client.ts               # Lightweight Twitter API v2 client
├── template.ts             # LLM response templates
├── index.ts                # Plugin export
└── utils/
    └── extractTweetId.ts   # Tweet ID extraction utility
test/                       # Co-located tests
```

## Development Commands

- **Test**: `cd packages/plugin-twitter && pnpm test`
- **Lint**: `pnpm lint`
- **Build**: `pnpm build`

## LLM-Driven Pattern

Actions fetch raw data from API, then pass to LLM for persona-aware responses:

```typescript
// 1. Fetch raw data
const tweetData = await twitterClient.v2.getTweet(tweetId);

// 2. Pass to LLM via template
state.tweetData = JSON.stringify(tweetData);
const context = composeContext({ state, template: tweetResponseTemplate });

// 3. Generate response
const response = await generateMessageResponse({ runtime, context, state });
callback(response);
```

**Benefits**: Works with only `TWITTER_BEARER_TOKEN`, LLM handles formatting/persona.

## Testing Guidelines

### Twitter Client Mock

Client has nested `v2` property - mocks must match:

```typescript
const mockClient = {
    v2: { getTweet: vi.fn().mockResolvedValue(mockData) }
};
```

### Handler Testing

Handlers return `Promise<boolean>` - test callbacks, not throws:

```typescript
const callback = vi.fn();
await handler(runtime, message, state, {}, callback);
expect(callback).toHaveBeenCalledWith({ text: "..." });
```

### LLM Mocking

Mock LLM functions in tests:

```typescript
vi.mock("@elizaos/core", () => ({
    ...vi.importActual("@elizaos/core"),
    generateMessageResponse: vi.fn().mockResolvedValue({ text: "Response" }),
    composeContext: vi.fn((args) => args.template),
}));
```

## Critical Gotchas

1. **Client `v2` property**: `twitterClient.v2.getTweet()`, not `twitterClient.getTweet()`
2. **Handler returns**: `Promise<boolean>`, not `Promise<void>` - never throw from handlers
3. **Type guards**: Required for external API errors - check `code`/`status` properties
4. **Action similes**: Must include action name as first element
5. **State initialization**: Check `typeof runtime.updateRecentMessageState === "function"` before calling
6. **Lightweight client**: Falls back to `TwitterReadClient` if runtime client unavailable

## Type Safety

Use local type definitions in `src/actions/readTweet/types.ts` to avoid `@elizaos/client-twitter` dependency. Always validate external data with type guards before use.
