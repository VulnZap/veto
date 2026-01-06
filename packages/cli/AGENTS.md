# CLI AGENTS.md

> **veto-cli** controls what AI coding assistants (Claude, Cursor, Windsurf, etc.) can do. It parses `.veto` policy files and hooks into agent configs.

## Commands

```bash
pnpm build                          # Build TypeScript
pnpm build:go                       # Build Go TUI binary
pnpm test                           # Run all 258 tests
pnpm test -- test/matcher           # Run tests in specific file
pnpm test -- -t "policy"            # Run tests matching pattern
pnpm dev                            # Run CLI directly with tsx
```

## Architecture

```
src/
├── cli.ts                   # ENTRY POINT - command dispatch
├── errors.ts                # Structured error classes (CLIError, ConfigError, etc.)
├── config/                  # Configuration loading
│   ├── loader.ts            # Find and load .veto files
│   ├── veto-parser.ts       # Parse .veto policy syntax
│   └── schema.ts            # Config validation
├── compiler/                # Policy compilation
│   ├── builtins.ts          # Built-in security policies
│   ├── content.ts           # Content pattern detection
│   ├── commands.ts          # Command pattern matching
│   └── llm.ts               # LLM-assisted policy generation
├── native/                  # AGENT INTEGRATIONS
│   ├── index.ts             # installAgent(), uninstallAgent()
│   ├── claude-code.ts       # Claude Code hooks
│   ├── cursor.ts            # Cursor hooks
│   ├── windsurf.ts          # Windsurf hooks
│   ├── opencode.ts          # OpenCode plugin
│   └── aider.ts             # Aider config
├── ast/                     # Code analysis (tree-sitter)
│   ├── parser.ts            # Multi-language parsing
│   ├── checker.ts           # Security checks
│   └── builtins.ts          # AST-based built-in rules
├── matcher.ts               # Glob pattern matching for policies
├── wrapper/                 # Process wrapping
│   ├── daemon.ts            # Background validation daemon
│   ├── shims.ts             # Command shimming
│   └── sessions.ts          # Session tracking
├── watchdog/                # File system monitoring
│   ├── watcher.ts           # File change detection
│   └── snapshot.ts          # State snapshots
└── types.ts                 # Policy, Rule types
go/                          # NATIVE TUI (Go)
├── cmd/veto/main.go         # TUI entry point
├── internal/
│   ├── agent/               # Agent detection + install
│   ├── config/              # Config loading
│   ├── matcher/             # Policy matching
│   └── engine/              # Bridge to TS engine
└── Makefile                 # Build targets
```

## Policy Syntax

```bash
# .veto file format: <action> <operation> <pattern>
deny write .env* credentials* *.key    # Block writing secrets
allow read **                          # Allow reading anything
ask exec rm* git push* git reset*      # Require approval
deny exec curl* wget* nc*              # Block network tools
```

## Agent Integration Flow

1. User runs `veto init` or `veto install claude-code`
2. CLI writes hooks to agent config (e.g., `~/.claude/settings.json`)
3. When agent tries an action, hook calls Veto daemon
4. Daemon evaluates against `.veto` policies
5. Returns allow/deny/ask

## Key Files

| File | What It Does |
|------|--------------|
| `src/cli.ts` | Main entry, parses args, dispatches commands |
| `src/errors.ts` | Structured error classes with exit codes |
| `src/config/veto-parser.ts` | Parses `.veto` file format |
| `src/compiler/builtins.ts` | 20+ built-in security policies |
| `src/native/index.ts` | `installAgent()`, `detectInstalledAgents()` |
| `src/native/claude-code.ts` | Claude Code specific integration |
| `src/matcher.ts` | `isProtected()`, glob matching |

## Error Handling

CLI uses structured errors instead of `process.exit()` for testability:

```typescript
import { CLIError, ConfigError, ValidationError, AgentError } from './errors.js';

// Throw instead of process.exit(1)
if (!config) throw new ConfigError('Failed to load config');
if (!agent) throw new ValidationError('No agent specified');

// Main entry catches and exits with proper code
main().catch((err) => {
  console.error(err.message);
  process.exit(err instanceof CLIError ? err.exitCode : 1);
});
```

Error classes: `CLIError` (base), `ConfigError`, `NotFoundError`, `ValidationError`, `AgentError`, `NetworkError`

## Go TUI

```bash
cd go
make build              # Build for current platform
make build-all          # Cross-compile all platforms
make run                # Run locally
```

Binaries: `veto-darwin-arm64`, `veto-linux-amd64`, etc.

## Testing

```bash
# Test policy parser
pnpm test -- test/veto-parser.test.ts

# Test matcher logic
pnpm test -- test/matcher.test.ts

# Test built-in policies
pnpm test -- test/builtins.test.ts

# Test with pattern
pnpm test -- -t "should deny"
```

## Tree-Sitter Languages

`languages/` contains WASM files for AST parsing:
- TypeScript, JavaScript, TSX
- Python, Go, Rust, Java, C/C++
- Ruby, PHP, Kotlin, Bash
