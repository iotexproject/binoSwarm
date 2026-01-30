# BinoSwarm Development Guide

Monorepo using pnpm workspaces with `@elizaos/core` framework and plugin architecture.

## Build & Test

- Build all: `pnpm build`
- Test all: `pnpm test`
- Test single package: `cd packages/<name> && pnpm test`
- Lint: `pnpm lint`
- Clean: `pnpm clean`

## Project Layout

```
packages/
├── core/              # Core framework (@elizaos/core)
├── plugin-twitter/    # Twitter/X plugin
└── plugin-depin/      # DePIN integration
```

- Core in `packages/core/src/` - Action interfaces, runtime, providers
- Plugins in `packages/plugin-*/src/` - Feature-specific integrations
- Tests co-located with source: `src/**/*.test.ts`

## Architecture

### Plugin Pattern

```typescript
export const pluginName: Plugin = {
    name: "plugin-name",
    description: "...",
    providers: [],
    evaluators: [],
    services: [],
    actions: [action1, action2, ...],
};
```

### Action Interface

```typescript
export const actionName: Action = {
    name: "ACTION_NAME",
    similes: ["ACTION_NAME", "ALIAS1", "ALIAS2"], // MUST include name as first element
    description: "Clear description for LLM",
    suppressInitialMessage: true,
    validate: async (runtime, message) => true,
    handler: async (runtime, message, state, options, callback) => {
        callback({ text: "Response" });
        return true; // or false on failure
    },
    examples: [[/* conversation examples */]],
};
```

### Runtime Clients

```typescript
const client = runtime.clients["serviceName"];
```

**Critical**: Client structures vary - check actual implementation. E.g., Twitter client has nested `v2` property.

## Conventions

- **TypeScript**: strict mode, single quotes, trailing commas, 2-space indent
- **Testing**: Vitest, co-located tests, mock exact client structure
- **Type guards**: Required for external data validation
- **Error handling**: Never throw from handlers - use callbacks, return boolean

## Git Workflow

- Branch from `main`: `feat/feature-name` or `bugfix/bug-name`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`
- Force pushes: `--force-with-lease` on feature branches only

## Gotchas

- **Handler return**: `Promise<boolean>`, not `Promise<void>` - test callbacks, not promise rejections
- **Monorepo**: Use `pnpm`, work from package directory for testing
- **Vitest**: Discovers `**/*.test.ts` and `**/*.spec.ts` automatically

## Security

- API keys in `.env` at repo root only
- Never commit `.env`, cookies, auth tokens
- Log sensitive data at error level only

## PR Checklist

- All tests pass (`pnpm test`)
- Lint passes (`pnpm lint`)
- Build succeeds (`pnpm build`)
- Tests added for new features
- Conventional commit message
