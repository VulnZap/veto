# AGENTS.md

## Commands
```bash
pnpm install                                  # Install dependencies
pnpm build                                    # Build SDK + CLI
pnpm test                                     # Run all tests
pnpm --filter veto-sdk test                   # Test SDK only
pnpm --filter veto-cli test                   # Test CLI only
pnpm --filter veto-sdk test -- -t "pattern"   # Run single test by name
pnpm --filter veto-cli test -- test/matcher   # Run tests in specific file
pnpm dev:sdk                                  # Watch SDK
pnpm dev:cli                                  # Watch CLI
pnpm dev:web                                  # Start web dev server
```

## Structure
```
veto/
├── packages/
│   ├── sdk/          # veto-sdk: Core guardrail SDK (npm: veto-sdk@1.0.0)
│   │   ├── src/core/       # Veto class, validator, interceptor
│   │   ├── src/kernel/     # Local LLM inference via Ollama
│   │   ├── src/providers/  # OpenAI/Anthropic/Google adapters
│   │   └── src/rules/      # YAML rule loading and validation
│   └── cli/          # veto-cli: CLI + TUI (npm: veto-cli@3.1.0)
│       ├── src/native/     # Agent integrations (Claude, Cursor, etc.)
│       ├── src/compiler/   # Policy compilation + builtins
│       ├── src/ast/        # Tree-sitter code analysis
│       └── go/             # Native TUI binary (Go)
├── apps/web/         # Landing page (veto.run)
└── docs/             # Rule reference documentation
```

## Code Style
- **TypeScript ESM**: Use `.js` extensions in imports (`import { x } from './foo.js'`)
- **Types**: Explicit param/return types; use `type` imports for type-only
- **Naming**: camelCase (functions/vars), PascalCase (types/classes), UPPER_SNAKE (constants)
- **Errors**: Throw typed errors (`throw new ToolCallDeniedError(...)`)
- **Tests**: Vitest with `describe`/`it`/`expect`, no globals, pattern `test/*.test.ts`
- **Formatting**: 2-space indent, single quotes, semicolons optional (be consistent per file)

## Branching & CI
- **Branches**: `feat/sdk/*`, `feat/cli/*`, `fix/sdk/*`, `fix/cli/*`, `chore/infra/*`
- **CI**: Path-filtered (only affected packages test on PR)
- **Release**: Tag-based (`git tag sdk@1.1.0 && git push origin sdk@1.1.0`)

## Key Files
| File | Purpose |
|------|---------|
| `packages/sdk/src/core/veto.ts` | Main Veto class - entry point for SDK |
| `packages/cli/src/cli.ts` | CLI entry point |
| `packages/cli/src/native/*.ts` | Agent-specific integrations |
| `packages/cli/src/compiler/builtins.ts` | Built-in security policies |
| `.veto` | Project policy file (deny/allow/ask rules) |
