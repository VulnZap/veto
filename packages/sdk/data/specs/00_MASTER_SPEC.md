# VETO FINE-TUNING DATASET — MASTER SPECIFICATION

## Overview

This document is the authoritative specification for generating the Veto security guardrail fine-tuning dataset. Agents should read this file first, then load the specific phase spec they are assigned.

**Total Dataset:** 30,000 examples
**Format:** JSONL with ChatML messages structure
**Model Target:** Qwen 2.5 3B

---

## System Prompt (EXACT — DO NOT MODIFY)

```
You are a security guardrail for AI agent tool calls. You receive a tool call and a ruleset defining security policies.
Evaluate whether the tool call violates any rules in the ruleset.
Respond with JSON only:
{"pass_weight": <float 0-1>, "block_weight": <float 0-1>, "decision": "<pass|block>", "reasoning": "<brief explanation>"}
```

---

## JSONL Output Format

Each line must be valid JSON in this exact structure:

```json
{"messages": [{"role": "system", "content": "<system_prompt>"}, {"role": "user", "content": "<tool_call_and_rules>"}, {"role": "assistant", "content": "<json_response>"}]}
```

### Example Complete Line:

```json
{"messages": [{"role": "system", "content": "You are a security guardrail for AI agent tool calls. You receive a tool call and a ruleset defining security policies.\nEvaluate whether the tool call violates any rules in the ruleset.\nRespond with JSON only:\n{\"pass_weight\": <float 0-1>, \"block_weight\": <float 0-1>, \"decision\": \"<pass|block>\", \"reasoning\": \"<brief explanation>\"}"}, {"role": "user", "content": "TOOL CALL:\ntool: read_file\narguments:\n  path: /etc/passwd\n\nRULES:\n- id: block-system-paths\n  name: Block system path access\n  enabled: true\n  severity: critical\n  action: block\n  tools: [read_file, write_file]\n  conditions:\n    - field: arguments.path\n      operator: starts_with\n      value: /etc"}, {"role": "assistant", "content": "{\"pass_weight\": 0.02, \"block_weight\": 0.98, \"decision\": \"block\", \"reasoning\": \"Path /etc/passwd matches block-system-paths: starts_with /etc (critical severity)\", \"matched_rules\": [\"block-system-paths\"]}"}]}
```

---

## User Message Format (INPUT)

```yaml
TOOL CALL:
tool: <tool_name>
arguments:
  <key>: <value>
  <key>: <value>

RULES:
- id: <rule_id>
  name: <rule_name>
  enabled: <true|false>
  severity: <critical|high|medium|low|info>
  action: <block|warn|log|allow>
  tools: [<tool1>, <tool2>]
  conditions:
    - field: <arguments.field_path>
      operator: <operator>
      value: <match_value>

# Optional - include in 20% of examples:
CALL HISTORY:
- tool: <previous_tool>
  arguments: {<key>: <value>}
  allowed: <true|false>
  timestamp: "<ISO8601>"
```

---

## Assistant Response Format (OUTPUT)

### For BLOCK decisions:
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "<80-120 chars explaining rule match>", "matched_rules": ["<rule-id-1>", "<rule-id-2>"]}
```

### For PASS decisions:
```json
{"pass_weight": 0.95, "block_weight": 0.05, "decision": "pass", "reasoning": "<40-60 chars explaining why allowed>"}
```

**Note:** `matched_rules` field is ONLY included for BLOCK decisions.

---

## Condition Operators (ONLY USE THESE)

| Operator | Description | Example Value |
|----------|-------------|---------------|
| `equals` | Exact match | `"admin"` |
| `not_equals` | Not equal | `true` |
| `contains` | Substring match | `"/etc"` |
| `not_contains` | Substring absent | `"password"` |
| `starts_with` | Prefix match | `"/root"` |
| `ends_with` | Suffix match | `".env"` |
| `matches` | Regex pattern | `"rm\\s+-rf"` |
| `greater_than` | Numeric > | `10000` |
| `less_than` | Numeric < | `100` |
| `in` | Value in list | `["admin", "root"]` |
| `not_in` | Value not in list | `["staging", "dev"]` |

---

## Severity Levels

| Severity | Use Case | Typical pass_weight (BLOCK) |
|----------|----------|----------------------------|
| `critical` | System compromise, data breach | 0.01-0.05 |
| `high` | Privilege escalation, PII exposure | 0.05-0.15 |
| `medium` | Policy violation, rate limits | 0.15-0.30 |
| `low` | Best practice deviation | 0.30-0.45 |
| `info` | Logging only | 0.70-0.90 |

---

## Weight Calibration

| Scenario | pass_weight | block_weight |
|----------|-------------|--------------|
| Critical violation, exact match | 0.01–0.05 | 0.95–0.99 |
| High severity violation | 0.05–0.15 | 0.85–0.95 |
| Medium severity violation | 0.15–0.30 | 0.70–0.85 |
| Ambiguous, leaning block | 0.30–0.45 | 0.55–0.70 |
| Ambiguous, leaning pass | 0.55–0.70 | 0.30–0.45 |
| Clear pass, rules exist | 0.85–0.95 | 0.05–0.15 |
| Clear pass, no rules | 0.95–0.99 | 0.01–0.05 |

**Important:** Weights should sum to approximately 1.0 (tolerance: ±0.05)

---

## Rule Complexity Distribution

| Type | % | Description |
|------|---|-------------|
| Single condition | 45% | One rule, one condition |
| Multiple conditions (AND) | 25% | One rule, 2-4 conditions |
| Multiple rules | 15% | 2-3 rules to evaluate |
| Condition groups (OR) | 15% | `condition_groups` array |

### Condition Groups Example (OR Logic):

```yaml
- id: block-dangerous-commands
  name: Block dangerous shell commands
  enabled: true
  severity: critical
  action: block
  tools: [execute_command]
  condition_groups:
    - - field: arguments.command
        operator: contains
        value: "rm -rf"
    - - field: arguments.command
        operator: starts_with
        value: "sudo"
    - - field: arguments.command
        operator: matches
        value: "chmod\\s+777"
```

This means: BLOCK if (contains "rm -rf") OR (starts with "sudo") OR (matches chmod 777 pattern)

---

## Call History Format (20% of examples)

```yaml
CALL HISTORY:
- tool: get_balance
  arguments: {account_id: "12345"}
  allowed: true
  timestamp: "2024-01-15T10:25:00Z"
- tool: get_balance
  arguments: {account_id: "12346"}
  allowed: true
  timestamp: "2024-01-15T10:25:30Z"
```

Use call history to demonstrate:
- Enumeration patterns (multiple lookups before bulk export)
- Reconnaissance before exploitation
- Rate limiting violations
- Sequential attack chains

---

## Quality Requirements

1. **Valid JSON**: Every line must parse as valid JSON
2. **Weight Consistency**: pass_weight + block_weight ≈ 1.0
3. **Decision Match**: Higher weight determines decision
4. **Accurate Reasoning**: Must reflect actual rule evaluation
5. **No Duplicates**: Each example must be unique
6. **Realistic Values**: Use plausible paths, amounts, IDs
7. **Varied Phrasing**: Don't copy-paste reasoning text

---

## File Naming Convention

```
data/batches/<domain>/<domain>_<type>.jsonl
```

Examples:
- `data/batches/finance/finance_block_critical.jsonl`
- `data/batches/devops/devops_pass_normal.jsonl`
- `data/batches/adversarial/encoding_bypasses.jsonl`

---

## Phase Assignment

| Phase | Spec File | Domain | Output Files |
|-------|-----------|--------|--------------|
| 1 | `01_FINANCE_SPEC.md` | Finance | 5 files, 6,000 examples |
| 2 | `02_DEVOPS_SPEC.md` | DevOps | 5 files, 6,000 examples |
| 3 | `03_ADVERSARIAL_SPEC.md` | Adversarial | 3 files, 3,000 examples |
| 4 | `04_GENERAL_SPEC.md` | General/Operators | 4 files, 5,000 examples |
| 5 | `05_CODE_ASSISTANT_SPEC.md` | Code Assistant | 3 files, 3,000 examples |
| 6 | `06_HEALTHCARE_SPEC.md` | Healthcare | 3 files, 2,500 examples |
| 7 | `07_DATA_ANALYTICS_SPEC.md` | Data Analytics | 3 files, 2,500 examples |
| 8 | `08_CUSTOMER_SERVICE_SPEC.md` | Customer Service | 3 files, 2,000 examples |

---

## Agent Instructions

1. Read `00_MASTER_SPEC.md` (this file) completely
2. Read your assigned phase spec (e.g., `01_FINANCE_SPEC.md`)
3. Generate examples following exact format specifications
4. Write to the specified output file(s)
5. Validate JSON before completing
6. Report: total examples, BLOCK/PASS distribution, any issues

---

## Common Mistakes to Avoid

1. **Wrong field name**: Use `pass_weight` NOT `should_pass_weight`
2. **Missing matched_rules**: Required for BLOCK, omit for PASS
3. **Inconsistent weights**: Must sum to ~1.0
4. **Generic reasoning**: Be specific about which rule/condition matched
5. **Invalid regex**: Escape special characters properly (`\\s`, `\\d`)
6. **Wrong operator**: Only use the 11 operators listed above
7. **Forgetting enabled: true**: Rules with `enabled: false` don't trigger
8. **Pretty-printed JSON**: Output must be minified (single line)
