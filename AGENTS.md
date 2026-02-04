# Repository Guidelines

## Project Structure & Module Organization

Monorepo using pnpm workspaces with `@elizaos/core` framework.

```
packages/
├── core/                 # Core framework (@elizaos/core)
├── client-*/            # Platform clients (discord, telegram, twitter)
├── plugin-*/            # Feature plugins (bootstrap, depin, evm, twitter, etc.)
├── adapter-*/           # Database adapters (postgres, redis)
└── client-direct/       # Direct client implementation
```

- Source code in `packages/*/src/`
- Tests co-located: `packages/*/test/` or `packages/*/src/test/`
- Plugin actions in `packages/plugin-*/src/actions/`

## Build, Test, and Development Commands

- **Build all**: `pnpm build`
- **Test all**: `pnpm test`
- **Test single package**: `cd packages/<name> && pnpm test`
- **Lint**: `pnpm lint`
- **Clean**: `pnpm clean`

## Coding Style & Naming Conventions

- **TypeScript**: Strict mode, single quotes, trailing commas, 2-space indent
- **Files**: `camelCase.ts` for utilities, `PascalCase.ts` for components/classes
- **Action naming**: `UPPER_SNAKE_CASE` for action names
- **Linting**: ESLint with TypeScript rules

## Testing Guidelines

- **Framework**: Vitest (discovers `**/*.test.ts` and `**/*.spec.ts`)
- **Coverage**: Aim for >90% coverage on new code
- **Test structure**: Given/When/Then pattern, descriptive test names
- **Mocking**: Mock exact client structures (e.g., Twitter client's `v2` property)

## Commit & Pull Request Guidelines

- **Branch from**: `main` using `feat/feature-name` or `bugfix/bug-name`
- **Commit format**: Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`)
- **Force pushes**: Use `--force-with-lease` on feature branches only
- **PR requirements**: All tests pass, lint clean, build succeeds

## Critical Patterns

### Action Interface

```typescript
export const actionName: Action = {
    name: "ACTION_NAME",
    similes: ["ACTION_NAME", "ALIAS1", "ALIAS2"], // MUST include name first
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

### Handler Returns

Handlers return `Promise<boolean>`, not `Promise<void>`. Test callbacks, not promise rejections.

### Runtime Clients

Client structures vary - check actual implementation before accessing:
```typescript
const client = runtime.clients["serviceName"];
// Example: Twitter client has nested v2 property
await (client as { v2: { getTweet: ... } }).v2.getTweet(id);
```
