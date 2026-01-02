# veto-leash

**sudo for AI agents**

Your AI agent has root access to your codebase. You have... vibes.

```bash
leash cc "don't delete test files"
```

Now every destructive action requires explicit policy. No regex. No config files. Just English.

## The Problem

AI coding agents can delete your test files, wipe your .env, run arbitrary migrations. Current permission systems require you to write regex patterns and understand glob syntax. You want to say "protect my tests" and be done.

## The Solution

veto-leash compiles natural language restrictions into precise policies **once**, then enforces them at runtime with zero LLM latency.

```
"don't delete test files"
        │
        ▼
┌─────────────────────────────────────┐
│  Semantic Compilation (100ms)       │
│  • Understands "test files" = test  │
│    source code, not test-results.xml│
│  • Gemini 2.0 Flash + JSON Schema   │
│  • Cached for instant reuse         │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Policy                             │
│  action: delete                     │
│  include: *.test.*, *.spec.*,       │
│           __tests__/**, test/**     │
│  exclude: test-results.*, coverage/ │
└─────────────────────────────────────┘
        │
        ▼
    Enforcement (0ms per check)
```

## Quick Start

```bash
# Install
npm install -g veto-leash

# Get free Gemini API key (optional - builtins work without it)
# https://aistudio.google.com/apikey
export GEMINI_API_KEY="your-key"

# Use it
leash cc "don't delete test files"
```

That's it. Your Claude Code session now blocks test file deletions.

## How It Works

### Three Enforcement Modes

| Mode | Use Case | How |
|------|----------|-----|
| **Wrapper** | Any agent | PATH hijacking, TCP daemon |
| **Native** | Claude Code, Windsurf, OpenCode | Hooks directly into agent |
| **Watchdog** | Background protection | File system monitoring, auto-restore |

### Native Integrations

```bash
# Claude Code - PreToolUse hooks
leash add "don't delete test files"
leash install cc

# Windsurf - Cascade hooks  
leash add "protect .env"
leash install windsurf

# OpenCode - permission.bash rules
leash add "no migrations"
leash install oc
```

### Wrapper Mode (Works with anything)

```bash
# Works with ANY CLI agent
leash cc "don't delete test files"
leash opencode "protect .env"
leash cursor "no database migrations"
leash aider "read-only src/core"
leash my-custom-agent "protect config"
```

### Watchdog Mode (Catches everything)

```bash
# Background file protection - catches programmatic changes too
leash watch "protect test files"
```

## Supported Agents

| Agent | Native | Wrapper | Notes |
|-------|--------|---------|-------|
| Claude Code | PreToolUse hooks | PATH shims | Best support |
| Windsurf | Cascade hooks | PATH shims | Full support |
| OpenCode | permission.bash | PATH shims | Full support |
| Cursor | .cursorrules | PATH shims | Guidance only |
| Aider | .aider.conf.yml | PATH shims | Read-only files |
| Codex CLI | - | Watchdog | OS sandbox |
| GitHub Copilot | - | Wrapper | No hooks |
| Any CLI tool | - | PATH shims | Universal |

## Project Configuration

Create a `.leash` file for team-wide policies:

```yaml
# .leash
version: 1

policies:
  - "don't delete test files"
  - "protect .env"
  - "no database migrations"

settings:
  fail_closed: true
  audit_log: true
```

Then sync to your agents:

```bash
leash sync cc
leash sync windsurf
```

## Commands

```
leash <agent> "<restriction>"     Wrap agent with policy
leash watch "<restriction>"       Background file protection
leash explain "<restriction>"     Preview policy without installing
leash add "<restriction>"         Save policy for native install
leash init                        Create .leash config file
leash sync [agent]                Apply .leash policies
leash install <agent>             Install native hooks
leash uninstall <agent>           Remove native hooks
leash list                        Show saved policies
leash audit [--tail] [--clear]    View audit log
leash login                       Leash Cloud (coming soon)
leash status                      Show active sessions
leash clear                       Clear compilation cache
```

## Built-in Patterns

These work instantly without an API key:

| Phrase | What It Protects |
|--------|-----------------|
| `test files` | `*.test.*`, `*.spec.*`, `__tests__/**` |
| `.env` | `.env`, `.env.*`, excluding `.env.example` |
| `migrations` | `**/migrations/**`, `prisma/migrations/**` |
| `config` | `*.config.*`, `tsconfig*`, `.eslintrc*` |
| `lock files` | `package-lock.json`, `yarn.lock`, etc. |

## Examples

```bash
# Preview what a policy protects
leash explain "don't delete test files"

# Wrapper mode - intercepts shell commands
leash cc "don't delete test files"

# Native mode - integrates with agent's permission system
leash add "don't delete test files"
leash add "protect .env"
leash install cc

# Watchdog mode - file system monitoring
leash watch "protect test files"

# Team config
leash init              # Creates .leash
leash sync windsurf     # Applies to agent
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Required for custom restrictions (not builtins) |
| `LEASH_CLOUD_URL` | Leash Cloud API endpoint (coming soon) |
| `LEASH_API_KEY` | Leash Cloud API key (coming soon) |

## Leash Cloud (Coming Soon)

- Team-wide policy sync
- Centralized audit logs
- LLM credits for compilation
- Policy analytics

Join the waitlist: https://leash.cloud

## Philosophy

1. **Semantic over syntactic** - "test files" means test source code, not files with "test" in the name
2. **Compile once, enforce always** - LLM runs once at startup, enforcement is instant
3. **Fail closed** - If the daemon is unreachable, commands are blocked
4. **Defense in depth** - Native hooks + wrapper mode + watchdog = comprehensive protection
5. **No config tax** - Natural language in, protection out

## How veto-leash Protects Files

When you run `leash cc "don't delete test files"`:

1. **Compile**: Natural language → glob patterns (via Gemini 2.0 Flash)
2. **Start daemon**: TCP server on localhost (random port)
3. **Create shims**: Shell wrappers for `rm`, `git rm`, etc.
4. **Launch agent**: With modified PATH
5. **Intercept**: Every shell command checks daemon first
6. **Block or allow**: Based on policy

The agent never knows veto-leash is there - it just sees commands failing with clear error messages.

## Security Model

- Localhost only (`127.0.0.1`)
- Random port each session
- Temp directory cleaned on exit
- No eval - patterns validated with micromatch
- Fail closed by default
- API key from environment only

## Platform Support

- macOS
- Linux
- Windows (PowerShell shims)
- WSL

## License

MIT

## Credits

Built by [Plaw, Inc.](https://plaw.io) for the [Veto](https://veto.dev) product line.

---

Ship faster. Sleep better.
