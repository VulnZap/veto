<p align="center">
  <h1 align="center">veto-leash</h1>
  <p align="center"><strong>sudo for AI agents</strong></p>
  <p align="center">
    <a href="https://www.npmjs.com/package/veto-leash"><img src="https://img.shields.io/npm/v/veto-leash?style=flat-square&color=black" alt="npm version"></a>
    <a href="https://github.com/VulnZap/veto-leash/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/veto-leash?style=flat-square&color=black" alt="License"></a>
    <a href="https://www.npmjs.com/package/veto-leash"><img src="https://img.shields.io/npm/dm/veto-leash?style=flat-square&color=black" alt="Downloads"></a>
  </p>
</p>

Your AI agent has root access to your codebase. You have... vibes.

```bash
# One file. That's it.
echo "no lodash
no any types" > .leash

leash init  # Auto-detects agents, installs hooks
```

Now every action is validated with **AST-level precision**. Zero false positives. Zero config.

## What's New in 1.0

- **🎯 AST Validation** - Tree-sitter parsing means `// import lodash` in comments is ignored
- **📄 Simple `.leash` format** - One rule per line, no YAML boilerplate
- **🔍 Auto-detection** - `leash init` finds and configures all your AI agents
- **⚡ Instant** - 95%+ policies use built-in rules (no LLM call needed)

## The Problem

AI coding agents can `npm install lodash` when you want native methods. They'll sprinkle `any` types everywhere. They'll `git push --force` to main.

Regex-based blockers create false positives. A comment saying `// TODO: remove lodash` shouldn't trigger a block.

## The Solution

veto-leash uses **AST parsing** for surgical precision:

| Code                     | Regex Result | AST Result                 |
| ------------------------ | ------------ | -------------------------- |
| `// import lodash`       | ❌ BLOCKED   | ✅ ALLOWED (comment)       |
| `"use any type"`         | ❌ BLOCKED   | ✅ ALLOWED (string)        |
| `const anyValue = 5`     | ❌ BLOCKED   | ✅ ALLOWED (variable name) |
| `import _ from 'lodash'` | ✅ BLOCKED   | ✅ BLOCKED (correct)       |

**This precision is our moat.** No other tool achieves zero false positives.

## Quick Start

```bash
# Install globally
npm install -g veto-leash

# Create a simple .leash file
echo "no lodash
no any types
no console.log" > .leash

# One command setup
leash init
```

That's it. `leash init` will:

1. Detect installed agents (Claude Code, Cursor, OpenCode, Windsurf)
2. Install native hooks for each
3. Your policies are now enforced

## Simple `.leash` Format

```
# .leash - One rule per line
no lodash
no any types - enforces strict TypeScript
no console.log
prefer pnpm over npm
```

Lines starting with `#` are comments. Optional reasons after `-`.

## Built-in AST Rules

These work **instantly** with zero LLM calls:

| Rule                  | What It Catches                            |
| --------------------- | ------------------------------------------ |
| `no lodash`           | ES imports, require(), dynamic import()    |
| `no any types`        | Type annotations, generics, as expressions |
| `no console.log`      | console.log(), console['log']()            |
| `no eval`             | eval(), new Function()                     |
| `no class components` | React.Component, PureComponent             |
| `no innerhtml`        | innerHTML, dangerouslySetInnerHTML         |
| `no debugger`         | debugger statements                        |
| `no var`              | var declarations                           |

## Native Agent Support

| Agent           | How It Works                         | Status       |
| --------------- | ------------------------------------ | ------------ |
| **Claude Code** | PreToolUse hooks with AST validation | ✅ Full      |
| **Cursor**      | hooks.json + beforeShellExecution    | ✅ Full      |
| **OpenCode**    | permission.bash deny rules           | ✅ Full      |
| **Windsurf**    | Cascade pre_write_code hooks         | ✅ Full      |
| **Aider**       | .aider.conf.yml read-only            | ✅ Partial   |
| **Any CLI**     | Wrapper mode (PATH hijacking)        | ✅ Universal |

## Commands

```
leash init                        Auto-detect agents, install hooks
leash sync [agent]                Apply .leash policies to agents
leash add "<rule>"                Add a policy
leash install <agent>             Install hooks for specific agent
leash explain "<rule>"            Preview what a rule catches
leash watch "<rule>"              Background file protection
leash audit [--tail]              View enforcement log
leash status                      Show active sessions
```

## How It Works

```
User: "no lodash"
         ↓
┌─────────────────────────────────────────┐
│  1. Check builtins (instant, no LLM)    │
│     → Found: "no lodash" builtin        │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│  2. Runtime: Write/Edit intercepted     │
│     → Regex pre-filter: contains        │
│       "lodash"? Yes → continue          │
│     → AST parse (5ms, cached)           │
│     → Query: import_statement with      │
│       source matching "lodash"          │
│     → BLOCKED with line/column          │
└─────────────────────────────────────────┘
```

**Key insight**: Regex pre-filter skips 95%+ of files instantly. AST parsing only runs when needed.

## Environment Variables

| Variable         | Description                                 |
| ---------------- | ------------------------------------------- |
| `GEMINI_API_KEY` | Only needed for custom rules (not builtins) |

Get a free API key: https://aistudio.google.com/apikey

## Philosophy

1. **Surgeon-level precision** - AST parsing = zero false positives
2. **Invisible until needed** - Auto-detection, background enforcement
3. **Steroid, not weight** - Makes AI agents _better_, not slower
4. **Natural language policies** - `no lodash` not `{ "rule": "no-import", "pattern": "^lodash" }`

## Test Suite

```
229 tests passing
├── 41 AST validation tests
├── 93 content matching tests
├── 41 command interception tests
├── 17 pattern matcher tests
├── 16 builtin rules tests
├── 12 parser tests
└── 9 session tests
```

## License

Apache-2.0

---

<p align="center">
  Built by <a href="https://plaw.io">Plaw, Inc.</a> for the <a href="https://veto.dev">Veto</a> product line.
  <br><br>
  <strong>Ship faster. Sleep better.</strong>
</p>
