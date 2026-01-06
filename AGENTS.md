# AGENTS.md

> **For strategy, positioning, and business context, see [VISION.md](./VISION.md).**

## Monorepo Navigation

| Package | Purpose | Guide |
|---------|---------|-------|
| [`packages/sdk`](./packages/sdk) | Core guardrail SDK for agentic apps | [SDK AGENTS.md](./packages/sdk/AGENTS.md) |
| [`packages/cli`](./packages/cli) | CLI + TUI for AI coding assistants | [CLI AGENTS.md](./packages/cli/AGENTS.md) |
| [`apps/web`](./apps/web) | Landing page (veto.run) | [Web AGENTS.md](./apps/web/AGENTS.md) |

## Quick Commands

```bash
pnpm install                 # Install all dependencies
pnpm build                   # Build SDK + CLI
pnpm test                    # Test SDK + CLI
pnpm dev:sdk                 # Watch SDK
pnpm dev:cli                 # Watch CLI
pnpm dev:web                 # Start landing page dev server
```

## Code Style (All Packages)

- **TypeScript ESM**: Use `.js` extensions in imports (`import { x } from './foo.js'`)
- **Types**: Explicit param/return types; use `type` imports for type-only
- **Naming**: camelCase (functions/vars), PascalCase (types/classes), UPPER_SNAKE (constants)
- **Errors**: Throw typed errors, never `process.exit()` in libraries
  - SDK: `ToolCallDeniedError`, `RuleSchemaError`
  - CLI: `CLIError`, `ConfigError`, `ValidationError`, `AgentError`, `NetworkError`
- **Tests**: Vitest with `describe`/`it`/`expect`, pattern `test/*.test.ts` or `tests/*.test.ts`

## Branching & CI

- **Branches**: `feat/sdk/*`, `feat/cli/*`, `fix/sdk/*`, `fix/cli/*`, `chore/infra/*`
- **CI**: Path-filtered (only affected packages test on PR)
- **Release**: Tag-based (`git tag sdk@1.1.0 && git push origin sdk@1.1.0`)

## Links

- **Repo**: https://github.com/VulnZap/veto
- **npm SDK**: https://npmjs.com/package/veto-sdk
- **npm CLI**: https://npmjs.com/package/veto-cli
- **Landing**: https://veto.run
