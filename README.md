<p align="center">
  <h1 align="center">veto-leash</h1>
  <p align="center"><strong>Permission layer for AI coding agents</strong></p>
  <p align="center">
    <a href="https://www.npmjs.com/package/veto-leash"><img src="https://img.shields.io/npm/v/veto-leash?style=flat-square&color=f5a524" alt="npm version"></a>
    <a href="https://github.com/VulnZap/veto-leash/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/veto-leash?style=flat-square&color=000" alt="License"></a>
    <a href="https://www.npmjs.com/package/veto-leash"><img src="https://img.shields.io/npm/dm/veto-leash?style=flat-square&color=000" alt="Downloads"></a>
  </p>
</p>

<br>

## Overview

AI coding agents have unrestricted access to your codebase. veto-leash adds a permission layer with natural language policies enforced through AST-level validation.

```bash
npm install -g veto-leash
leash
```

Create policies in plain English. Block dangerous operations. Zero false positives.

<br>

## The Problem

Modern AI coding assistants can execute arbitrary commands and modify any file. While powerful, this creates risk:

- Installing unwanted dependencies (lodash when you prefer native)
- Using loose types (any instead of proper TypeScript)
- Executing dangerous commands (force push to main)
- Modifying protected files (.env, credentials)

Traditional regex-based blocking creates false positives. Comments mentioning "lodash" shouldn't trigger blocks.

<br>

## The Solution

veto-leash uses Abstract Syntax Tree parsing for surgical precision:

| Code                     | Regex Blocker | veto-leash            |
| ------------------------ | ------------- | --------------------- |
| `// import lodash`       | BLOCKED       | ALLOWED (comment)     |
| `"use any type"`         | BLOCKED       | ALLOWED (string)      |
| `const anyValue = 5`     | BLOCKED       | ALLOWED (variable)    |
| `import _ from 'lodash'` | BLOCKED       | BLOCKED (actual code) |

The difference is precision. AST parsing understands code structure, eliminating false positives entirely.

<br>

## Quick Start

### Installation

```bash
npm install -g veto-leash
```

### Create Policies

One policy per line in `.leash`:

```
no lodash
no any types
prefer pnpm over npm
protect .env files
```

### Launch Dashboard

```bash
leash
```

Interactive TUI for policy management, agent configuration, and monitoring.

### CLI Usage

```bash
leash init              # Auto-detect agents, install hooks
leash add "no axios"    # Add policy
leash sync              # Apply to all agents
leash status            # Show configuration
```

<br>

## Features

### Native Performance

- **6.8MB binary** - Go-based TUI, instant startup
- **Cross-platform** - macOS, Linux, Windows (ARM64 + AMD64)
- **Auto-update** - Built-in version checking and updates

### Smart Validation

- **50+ built-in patterns** - Common policies work instantly
- **AST parsing** - Tree-sitter for zero false positives
- **LLM compilation** - Custom policies use Gemini API
- **243 test suite** - Comprehensive validation coverage

### Agent Integration

Native support for major AI coding tools:

| Agent           | Integration Method          | Status |
| --------------- | --------------------------- | ------ |
| **Claude Code** | PreToolUse hooks            | Full   |
| **OpenCode**    | AGENTS.md injection         | Full   |
| **Cursor**      | rules/ directory            | Full   |
| **Windsurf**    | Cascade rules               | Full   |
| **Aider**       | .aider.conf.yml             | Full   |

<br>

## Built-in Policies

Instant validation without LLM calls:

| Policy                | Blocks                                     |
| --------------------- | ------------------------------------------ |
| `no lodash`           | ES imports, require(), dynamic import()    |
| `no any types`        | Type annotations, generics, as expressions |
| `no console.log`      | console.log(), console['log']()            |
| `no eval`             | eval(), new Function()                     |
| `no class components` | React.Component, PureComponent             |
| `no innerHTML`        | innerHTML, dangerouslySetInnerHTML         |
| `no debugger`         | debugger statements                        |
| `no var`              | var declarations                           |
| `prefer pnpm`         | npm/yarn package manager commands          |
| `protect .env`        | Modifications to environment files         |

Over 50 patterns available. See source for complete list.

<br>

## Architecture

```
┌──────────────────────────────────────────────┐
│           leash (Native Binary)              │
├──────────────────────────────────────────────┤
│  Interactive TUI    │  CLI Commands          │
│  • Policy editor    │  • add, list, sync     │
│  • Agent manager    │  • install, status     │
│  • Live updates     │  • Pattern matching    │
├─────────────────────┴──────────────────────┤
│         TypeScript Engine (as needed)        │
│  • LLM policy compilation (Gemini API)       │
│  • AST validation (Tree-sitter)              │
│  • Audit logging and reporting               │
└──────────────────────────────────────────────┘
```

Built-in policies execute in Go (instant). Custom policies compile via TypeScript engine with LLM.

<br>

## How It Works

**Step 1: Policy Compilation**

```
Input: "no lodash"
  ↓
Check built-in patterns → Match found
  ↓
Generate:
  - Regex pre-filter: /lodash/
  - AST query: (import_statement source: "lodash")
  - Suggested alternative: "Use native ES6+"
```

**Step 2: Runtime Enforcement**

```
Agent attempts: import _ from 'lodash'
  ↓
Regex pre-filter → Contains "lodash"
  ↓
Parse file with Tree-sitter (5ms)
  ↓
Query AST → Import statement found
  ↓
BLOCK with context and suggestion
```

<br>

## Configuration

### .leash Format

```
# Lines starting with # are comments
no lodash
no any types - enforces strict TypeScript
protect .env
prefer pnpm over npm
```

Policies support optional reasoning after `-`.

### Environment Variables

| Variable         | Purpose                         | Required |
| ---------------- | ------------------------------- | -------- |
| `GEMINI_API_KEY` | LLM compilation for custom rules | Optional |

Free API key: https://aistudio.google.com/apikey

Built-in policies work without API key.

<br>

## CLI Reference

```
USAGE
  leash                     Interactive dashboard
  leash init                Setup wizard
  leash add "policy"        Add enforcement rule
  leash list                Show active policies
  leash sync [agent]        Apply to agents
  leash install <agent>     Install agent hooks
  leash uninstall <agent>   Remove hooks
  leash status              Show configuration
  leash explain "policy"    Preview rule behavior
  leash audit [--tail]      View enforcement log
  leash update              Update to latest version

AGENTS
  cc, claude-code    Claude Code
  oc, opencode       OpenCode
  cursor             Cursor
  windsurf           Windsurf
  aider              Aider
```

<br>

## Development

### Build from Source

```bash
git clone https://github.com/VulnZap/veto-leash
cd veto-leash
pnpm install
pnpm build
cd go && make build-all
```

### Run Tests

```bash
pnpm test              # TypeScript test suite
pnpm typecheck         # Type validation
go test ./...          # Go tests
```

### Test Suite

- 243 tests passing
- 77 AST validation tests
- 93 content matching tests
- 41 command interception tests
- 17 pattern matcher tests
- 16 builtin rule tests
- 12 parser tests
- 9 session tests

<br>

## Design Principles

1. **Precision over approximation** - AST parsing eliminates false positives
2. **Speed over flexibility** - Native binary, instant feedback
3. **Clarity over cleverness** - Natural language policies
4. **Safety over convenience** - Explicit validation required

<br>

## Comparison

| Feature          | veto-leash   | git hooks | IDE linters |
| ---------------- | ------------ | --------- | ----------- |
| AST validation   | Yes          | No        | Limited     |
| Natural language | Yes          | No        | No          |
| Agent-aware      | Yes          | No        | No          |
| False positives  | Zero         | High      | Medium      |
| Runtime          | 5ms          | N/A       | Seconds     |
| Setup            | One command  | Manual    | Per-project |

<br>

## License

Apache-2.0

See [LICENSE](LICENSE) for details.

<br>

---

<p align="center">
  Built by <a href="https://plaw.io">Plaw, Inc.</a> for the <a href="https://veto.run">Veto</a> product line.
</p>
