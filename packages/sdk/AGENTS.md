# SDK AGENTS.md

> **veto-sdk** is the core guardrail system. It intercepts AI tool calls, validates them against YAML rules, and blocks dangerous operations. This is the heart of Veto.

## Commands

```bash
pnpm build                          # Build SDK
pnpm test                           # Run all 142 tests
pnpm test -- -t "validator"         # Run tests matching "validator"
pnpm test -- tests/core/veto        # Run tests in specific file
pnpm dev                            # Watch mode
pnpm benchmark:dev                  # Run kernel benchmark
```

## Architecture

```
src/
├── core/                    # THE CORE - start here
│   ├── veto.ts              # Main entry: Veto.init(), wrapTools()
│   ├── interceptor.ts       # Tool call interception + ToolCallDeniedError
│   ├── validator.ts         # Rule evaluation engine
│   └── history.ts           # Call history tracking
├── kernel/                  # Local LLM validation (Ollama)
│   ├── client.ts            # KernelClient for model inference
│   └── prompt.ts            # Prompt templates for validation
├── providers/               # AI provider adapters
│   └── adapters.ts          # toOpenAITools(), toAnthropicTools()
├── rules/                   # YAML rule system
│   ├── loader.ts            # Load rules from veto/rules/*.yaml
│   ├── types.ts             # Rule, RuleSet, Condition types
│   └── rule-validator.ts    # Validate rule syntax
├── types/                   # Shared types
│   ├── tool.ts              # ToolDefinition, ToolCall
│   └── config.ts            # VetoConfig, ValidationResult
└── utils/                   # Helpers
    ├── logger.ts            # Structured logging
    └── glob.ts              # Pattern matching
```

## Key Concepts

1. **wrapTools()** - Returns `{ definitions, implementations }`. Definitions go to AI, implementations have validation baked in.

2. **Rules** - YAML with conditions: `{ field, operator, value }`. Operators: `equals`, `contains`, `matches`, `starts_with`, `in`, etc.

3. **Actions** - `block` (deny), `allow` (permit), `ask` (prompt), `warn` (log only)

4. **Kernel** - Optional local LLM via Ollama for semantic validation beyond pattern matching

## Code Patterns

```typescript
// Imports: always .js extension, type imports separate
import { join } from 'node:path';
import type { ToolDefinition } from '../types/tool.js';

// Errors: typed, with context
throw new ToolCallDeniedError(toolName, 'Blocked by rule: ' + rule.id);

// Async: always async/await, never .then()
const result = await veto.validateToolCall(call);
```

## Testing

```bash
# Test a specific module
pnpm test -- tests/core/validator.test.ts

# Test with pattern
pnpm test -- -t "should block dangerous"

# Watch single file
pnpm test -- --watch tests/core/veto.test.ts
```

## Key Files to Understand

| File | What It Does |
|------|--------------|
| `src/core/veto.ts` | Entry point. `Veto.init()` loads config, `wrapTools()` wraps handlers |
| `src/core/interceptor.ts` | Intercepts calls, runs validation, throws `ToolCallDeniedError` |
| `src/core/validator.ts` | Evaluates rules against tool call arguments |
| `src/kernel/client.ts` | Calls local Ollama model for semantic validation |
| `src/providers/adapters.ts` | Converts tool definitions for OpenAI/Anthropic/Google |

## Data

`data/` contains 30k training examples for the kernel model:
- `data/veto_training_30k.jsonl` - Full training set
- `data/benchmark/holdout_test.jsonl` - 100 test examples
- `data/specs/*.md` - Domain specs (finance, devops, healthcare, etc.)
