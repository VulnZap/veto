# AGENTS.md

## Vision

**Veto is the permission layer for AI agents.** As AI agents become more capable and autonomous, they gain the power to execute code, modify files, access networks, and interact with production systems. This creates a fundamental trust problem: how do you let AI agents be useful while preventing them from doing harm?

Veto solves this by intercepting agent actions before they execute, validating them against human-defined rules, and blocking or prompting for dangerous operations. Think of it as a firewall for AI agents.

## Mission

1. **Make AI agents safe by default** - Zero-config policies that prevent common dangerous patterns
2. **Give humans control without friction** - Simple deny/allow/ask rules, real-time monitoring
3. **Work everywhere** - SDK for developers building agents, CLI for teams using AI coding assistants
4. **Stay local-first** - No cloud required, sub-millisecond overhead, privacy-preserving

## The Problem We're Solving

AI agents (Claude, GPT-4, etc.) can:
- Execute `rm -rf /` or `sudo` commands
- Modify `.env` files and leak secrets
- Push to production branches
- Make network requests to exfiltrate data
- Run indefinitely without human oversight

Without guardrails, you're trusting the model to always do the right thing. That's not acceptable for production systems.

## Products

### 1. veto-sdk (npm: `veto-sdk`)
**For developers building agentic applications.**

Wrap your tools with Veto. When the AI calls a tool, Veto validates it against YAML rules before execution. The AI never sees the guardrail - tool schemas are unchanged.

```typescript
const veto = await Veto.init();
const { definitions, implementations } = veto.wrapTools(myTools);
// definitions -> pass to AI model
// implementations -> execute with automatic validation
```

### 2. veto-cli (npm: `veto-cli`)
**For teams using AI coding assistants.**

Control what Claude Code, Cursor, Windsurf, and other AI tools can do in your codebase. Simple `.veto` file with deny/allow/ask rules.

```
deny write .env* credentials* *.key
allow read **
ask exec rm* git push* git reset*
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User/Team                               │
│  Defines rules in .veto (CLI) or veto/rules/*.yaml (SDK)       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Veto Layer                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Validator  │  │ Interceptor │  │  Kernel (local LLM)     │ │
│  │  (rules)    │  │  (hooks)    │  │  (semantic validation)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI Agent / LLM                             │
│  Claude, GPT-4, Gemini, local models, etc.                     │
│  (unaware of guardrail - sees normal tool schemas)             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Tools / System                              │
│  File system, shell, network, databases, APIs                  │
└─────────────────────────────────────────────────────────────────┘
```

## Repository Structure

```
veto/
├── packages/
│   ├── sdk/                    # veto-sdk: Core guardrail SDK
│   │   ├── src/core/           #   Veto class, validator, interceptor
│   │   ├── src/kernel/         #   Local LLM inference via Ollama
│   │   ├── src/providers/      #   OpenAI/Anthropic/Google adapters
│   │   ├── src/rules/          #   YAML rule loading and validation
│   │   └── data/               #   30k training examples for kernel
│   │
│   └── cli/                    # veto-cli: CLI + TUI for AI assistants
│       ├── src/native/         #   Agent integrations (Claude, Cursor, etc.)
│       ├── src/compiler/       #   Policy compilation + builtins
│       ├── src/ast/            #   Tree-sitter code analysis
│       ├── src/watchdog/       #   File system monitoring
│       └── go/                 #   Native TUI binary (Go)
│
├── apps/web/                   # Landing page (veto.run)
├── docs/                       # Rule reference documentation
└── .github/workflows/          # CI (path-filtered) + Release (tag-based)
```

## Commands

```bash
# Setup
pnpm install                                  # Install dependencies

# Build
pnpm build                                    # Build SDK + CLI
pnpm build:sdk                                # Build SDK only
pnpm build:cli                                # Build CLI only

# Test
pnpm test                                     # Run all tests
pnpm --filter veto-sdk test                   # Test SDK only
pnpm --filter veto-cli test                   # Test CLI only
pnpm --filter veto-sdk test -- -t "pattern"   # Run single test by name
pnpm --filter veto-cli test -- test/matcher   # Run tests in specific file

# Development
pnpm dev:sdk                                  # Watch SDK
pnpm dev:cli                                  # Watch CLI
pnpm dev:web                                  # Start web dev server

# Go TUI (optional native binary)
cd packages/cli/go && make build              # Build for current platform
cd packages/cli/go && make build-all          # Cross-compile all platforms
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
- **CI**: Path-filtered - only affected packages test on PR
- **Release**: Tag-based - `git tag sdk@1.1.0 && git push origin sdk@1.1.0` triggers npm publish

## Key Entry Points

| File | Purpose |
|------|---------|
| `packages/sdk/src/core/veto.ts` | Main Veto class - SDK entry point |
| `packages/sdk/src/core/interceptor.ts` | Tool call interception logic |
| `packages/sdk/src/core/validator.ts` | Rule evaluation engine |
| `packages/sdk/src/kernel/client.ts` | Local LLM validation via Ollama |
| `packages/cli/src/cli.ts` | CLI entry point |
| `packages/cli/src/native/*.ts` | Agent-specific integrations |
| `packages/cli/src/compiler/builtins.ts` | Built-in security policies |
| `packages/cli/src/config/veto-parser.ts` | .veto file parser |
| `packages/cli/go/cmd/veto/main.go` | Go TUI entry point |

## Key Concepts

1. **Tool Wrapping**: `veto.wrapTools()` returns `definitions` (schemas for AI) and `implementations` (wrapped handlers with validation)

2. **Rules**: YAML files with conditions (field, operator, value) that match against tool call arguments

3. **Actions**: `block` (deny), `allow` (permit), `ask` (prompt user), `warn` (log only)

4. **Kernel**: Optional local LLM (via Ollama) for semantic validation beyond pattern matching

5. **Native Integrations**: Hooks into Claude Code, Cursor, Windsurf, OpenCode, Aider via their config files

## What's Next (Roadmap Ideas)

- **Veto Cloud**: Team policy sync, audit logs, analytics dashboard
- **More agents**: GitHub Copilot, Cody, Continue, Amazon Q
- **Policy marketplace**: Community-contributed rule sets
- **IDE extensions**: VS Code, JetBrains integration
- **Kernel improvements**: Fine-tuned models for better semantic understanding

## npm Packages

| Package | Version | Install |
|---------|---------|---------|
| `veto-sdk` | 1.0.0 | `npm install veto-sdk` |
| `veto-cli` | 3.1.0 | `npm install -g veto-cli` |

## Links

- **Repo**: https://github.com/VulnZap/veto
- **Landing**: https://veto.run
- **npm SDK**: https://npmjs.com/package/veto-sdk
- **npm CLI**: https://npmjs.com/package/veto-cli
