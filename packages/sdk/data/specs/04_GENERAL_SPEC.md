# PHASE 4: GENERAL & OPERATOR COVERAGE SPECIFICATION

**READ `00_MASTER_SPEC.md` FIRST** — It contains the system prompt, output format, and quality requirements.

---

## Overview

| Metric | Value |
|--------|-------|
| **Domain** | General / Cross-Domain / Operator Coverage |
| **Total Examples** | 5,000 |
| **Output Directory** | `data/batches/general/` |

**Purpose:** Ensure comprehensive coverage of all operators, edge cases with disabled rules, empty rulesets, and cross-domain obfuscation patterns.

---

## Output Files

| File | Examples | Description |
|------|----------|-------------|
| `operator_coverage.jsonl` | 2,500 | All 11 operators with varied examples |
| `condition_groups.jsonl` | 1,000 | OR logic with condition_groups |
| `disabled_empty_rules.jsonl` | 500 | Disabled rules, empty rulesets |
| `obfuscation_attacks.jsonl` | 1,000 | Path traversal, encoding bypasses |

---

## 1. OPERATOR COVERAGE (`operator_coverage.jsonl`)

### Requirements Per Operator

Each operator needs **at least 220 examples** with:
- Mix of BLOCK and PASS outcomes
- Different field types (strings, numbers, arrays, booleans)
- Various tools and domains
- Edge cases near boundaries

---

### EQUALS Operator (230 examples)

```yaml
# String equality
- id: block-admin-role
  conditions:
    - field: arguments.role
      operator: equals
      value: "admin"

# Boolean equality
- id: block-force-flag
  conditions:
    - field: arguments.force
      operator: equals
      value: true

# Numeric equality
- id: block-specific-port
  conditions:
    - field: arguments.port
      operator: equals
      value: 22

# Null equality
- id: block-missing-approval
  conditions:
    - field: arguments.approved_by
      operator: equals
      value: null
```

**Example BLOCK:**
```
TOOL CALL:
tool: create_user
arguments:
  username: hacker
  role: admin
  department: IT

RULES:
- id: block-admin-creation
  name: Block admin user creation
  enabled: true
  severity: critical
  action: block
  tools: [create_user]
  conditions:
    - field: arguments.role
      operator: equals
      value: "admin"
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Role 'admin' equals blocked value. Admin creation requires elevated privileges.", "matched_rules": ["block-admin-creation"]}
```

**Example PASS:**
```
TOOL CALL:
tool: create_user
arguments:
  username: newuser
  role: viewer
  department: Marketing

RULES:
- id: block-admin-creation
  name: Block admin user creation
  enabled: true
  severity: critical
  action: block
  tools: [create_user]
  conditions:
    - field: arguments.role
      operator: equals
      value: "admin"
```

**Output:**
```json
{"pass_weight": 0.95, "block_weight": 0.05, "decision": "pass", "reasoning": "Role 'viewer' does not equal 'admin', user creation allowed"}
```

---

### NOT_EQUALS Operator (230 examples)

```yaml
# Require approval
- id: require-approval
  conditions:
    - field: arguments.approved
      operator: not_equals
      value: true

# Require specific status
- id: require-active-status
  conditions:
    - field: arguments.status
      operator: not_equals
      value: "active"
```

**Example BLOCK:**
```
TOOL CALL:
tool: deploy_service
arguments:
  service: payment-api
  environment: production
  approved: false

RULES:
- id: require-production-approval
  name: Require approval for production
  enabled: true
  severity: critical
  action: block
  tools: [deploy_service]
  conditions:
    - field: arguments.environment
      operator: equals
      value: "production"
    - field: arguments.approved
      operator: not_equals
      value: true
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Production deployment with approved=false. Approval required (not_equals true triggered).", "matched_rules": ["require-production-approval"]}
```

---

### CONTAINS Operator (230 examples)

```yaml
# Substring in path
- id: block-ssh-access
  conditions:
    - field: arguments.path
      operator: contains
      value: ".ssh"

# Substring in command
- id: block-rm-command
  conditions:
    - field: arguments.command
      operator: contains
      value: "rm -rf"

# Substring in array (checks if string is in array)
- id: block-sensitive-fields
  conditions:
    - field: arguments.fields
      operator: contains
      value: "ssn"
```

**Example BLOCK:**
```
TOOL CALL:
tool: read_file
arguments:
  path: /home/user/.ssh/id_rsa

RULES:
- id: block-ssh-key-access
  name: Block SSH key access
  enabled: true
  severity: critical
  action: block
  tools: [read_file]
  conditions:
    - field: arguments.path
      operator: contains
      value: ".ssh"
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Path contains '.ssh' - SSH key access blocked to prevent credential exposure.", "matched_rules": ["block-ssh-key-access"]}
```

---

### NOT_CONTAINS Operator (220 examples)

```yaml
# Require specific substring
- id: require-https
  conditions:
    - field: arguments.url
      operator: not_contains
      value: "https://"

# Block if missing keyword
- id: require-dry-run-keyword
  conditions:
    - field: arguments.command
      operator: not_contains
      value: "--dry-run"
```

**Example BLOCK:**
```
TOOL CALL:
tool: fetch_url
arguments:
  url: http://api.example.com/data
  method: GET

RULES:
- id: require-https
  name: Require HTTPS for external requests
  enabled: true
  severity: high
  action: block
  tools: [fetch_url, http_request]
  conditions:
    - field: arguments.url
      operator: not_contains
      value: "https://"
```

**Output:**
```json
{"pass_weight": 0.08, "block_weight": 0.92, "decision": "block", "reasoning": "URL uses HTTP, not HTTPS. Secure connection required for external requests.", "matched_rules": ["require-https"]}
```

---

### STARTS_WITH Operator (240 examples)

```yaml
# Block system paths
- id: block-etc-paths
  conditions:
    - field: arguments.path
      operator: starts_with
      value: "/etc/"

# Block external accounts
- id: block-external-transfer
  conditions:
    - field: arguments.account
      operator: starts_with
      value: "EXT-"

# Block sudo commands
- id: block-sudo
  conditions:
    - field: arguments.command
      operator: starts_with
      value: "sudo "
```

**Example BLOCK:**
```
TOOL CALL:
tool: read_file
arguments:
  path: /etc/passwd

RULES:
- id: block-etc-access
  name: Block /etc/ access
  enabled: true
  severity: critical
  action: block
  tools: [read_file, write_file]
  conditions:
    - field: arguments.path
      operator: starts_with
      value: "/etc/"
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Path starts with /etc/ - system configuration access blocked.", "matched_rules": ["block-etc-access"]}
```

---

### ENDS_WITH Operator (220 examples)

```yaml
# Block sensitive file extensions
- id: block-env-files
  conditions:
    - field: arguments.path
      operator: ends_with
      value: ".env"

# Block private keys
- id: block-key-files
  conditions:
    - field: arguments.path
      operator: ends_with
      value: "_rsa"

# Block backup files
- id: block-backup-access
  conditions:
    - field: arguments.path
      operator: ends_with
      value: ".bak"
```

**Example BLOCK:**
```
TOOL CALL:
tool: read_file
arguments:
  path: /app/config/.env

RULES:
- id: block-env-file-access
  name: Block .env file access
  enabled: true
  severity: critical
  action: block
  tools: [read_file]
  conditions:
    - field: arguments.path
      operator: ends_with
      value: ".env"
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Path ends with .env - environment file may contain secrets.", "matched_rules": ["block-env-file-access"]}
```

---

### MATCHES Operator (260 examples - Regex)

```yaml
# Regex for dangerous commands
- id: block-chmod-world-writable
  conditions:
    - field: arguments.command
      operator: matches
      value: "chmod\\s+[0-7]*7[0-7]*"

# Regex for SQL injection patterns
- id: block-sql-injection
  conditions:
    - field: arguments.query
      operator: matches
      value: "(UNION\\s+SELECT|;\\s*DROP|--\\s*$)"

# Regex for IP addresses
- id: block-internal-ips
  conditions:
    - field: arguments.url
      operator: matches
      value: "192\\.168\\.[0-9]+\\.[0-9]+"

# Regex for secrets in content
- id: block-hardcoded-secrets
  conditions:
    - field: arguments.content
      operator: matches
      value: "(api[_-]?key|password|secret)\\s*[:=]\\s*['\"][^'\"]{8,}"
```

**Example BLOCK:**
```
TOOL CALL:
tool: execute_command
arguments:
  command: chmod 777 /app/data

RULES:
- id: block-world-writable
  name: Block world-writable permissions
  enabled: true
  severity: critical
  action: block
  tools: [execute_command]
  conditions:
    - field: arguments.command
      operator: matches
      value: "chmod\\s+[0-7]*7[0-7]*"
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Command sets world-writable permissions (777 matches pattern *7*). Security risk.", "matched_rules": ["block-world-writable"]}
```

**Common Regex Patterns to Use:**
- `\\s+` - whitespace
- `[0-9]+` - digits
- `[a-zA-Z_]+` - identifiers
- `\\.` - literal dot
- `(a|b|c)` - alternation
- `^` and `$` - anchors
- `[^/]+` - not slash
- `.*` - any characters

---

### GREATER_THAN Operator (230 examples)

```yaml
# Numeric limits
- id: block-high-amount
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 10000

# Count limits
- id: block-bulk-operations
  conditions:
    - field: arguments.count
      operator: greater_than
      value: 100

# Size limits
- id: block-large-upload
  conditions:
    - field: arguments.size_mb
      operator: greater_than
      value: 500
```

**Example BLOCK:**
```
TOOL CALL:
tool: transfer_funds
arguments:
  from: ACC-001
  to: ACC-002
  amount: 50000

RULES:
- id: block-large-transfer
  name: Block transfers over limit
  enabled: true
  severity: critical
  action: block
  tools: [transfer_funds]
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 10000
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Transfer amount 50000 exceeds limit of 10000. Large transfer requires approval.", "matched_rules": ["block-large-transfer"]}
```

---

### LESS_THAN Operator (220 examples)

```yaml
# Minimum requirements
- id: require-min-length
  conditions:
    - field: arguments.password_length
      operator: less_than
      value: 12

# Date restrictions
- id: block-old-data
  conditions:
    - field: arguments.year
      operator: less_than
      value: 2020
```

**Example BLOCK:**
```
TOOL CALL:
tool: set_password
arguments:
  user_id: 12345
  password_length: 6

RULES:
- id: enforce-password-length
  name: Enforce minimum password length
  enabled: true
  severity: high
  action: block
  tools: [set_password, create_user]
  conditions:
    - field: arguments.password_length
      operator: less_than
      value: 12
```

**Output:**
```json
{"pass_weight": 0.05, "block_weight": 0.95, "decision": "block", "reasoning": "Password length 6 is less than minimum 12. Security policy requires longer passwords.", "matched_rules": ["enforce-password-length"]}
```

---

### IN Operator (230 examples)

```yaml
# Whitelist check
- id: require-approved-env
  conditions:
    - field: arguments.environment
      operator: in
      value: ["staging", "development", "test"]

# Country restrictions
- id: block-sanctioned-countries
  conditions:
    - field: arguments.country
      operator: in
      value: ["KP", "IR", "SY", "CU"]

# Allowed formats
- id: allow-safe-formats
  conditions:
    - field: arguments.format
      operator: in
      value: ["pdf", "csv", "xlsx"]
```

**Example BLOCK:**
```
TOOL CALL:
tool: wire_transfer
arguments:
  amount: 5000
  country: IR

RULES:
- id: block-sanctioned
  name: Block sanctioned countries
  enabled: true
  severity: critical
  action: block
  tools: [wire_transfer]
  conditions:
    - field: arguments.country
      operator: in
      value: ["KP", "IR", "SY", "CU"]
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Country 'IR' is in sanctioned list. Transfer blocked per OFAC compliance.", "matched_rules": ["block-sanctioned"]}
```

---

### NOT_IN Operator (230 examples)

```yaml
# Blocklist check
- id: block-non-whitelisted
  conditions:
    - field: arguments.source_ip
      operator: not_in
      value: ["10.0.0.0/8", "192.168.0.0/16"]

# Account restrictions
- id: block-unauthorized-account
  conditions:
    - field: arguments.account_id
      operator: not_in
      value: ["ACC-001", "ACC-002", "ACC-003"]
```

**Example BLOCK:**
```
TOOL CALL:
tool: get_balance
arguments:
  account_id: ACC-999

RULES:
- id: restrict-account-access
  name: Restrict to authorized accounts
  enabled: true
  severity: critical
  action: block
  tools: [get_balance, get_transactions]
  conditions:
    - field: arguments.account_id
      operator: not_in
      value: ["ACC-001", "ACC-002", "ACC-003"]
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Account ACC-999 not in authorized list. Access restricted to own accounts.", "matched_rules": ["restrict-account-access"]}
```

---

## 2. CONDITION GROUPS (`condition_groups.jsonl`)

### OR Logic Examples (1000 examples)

Each example uses `condition_groups` array where ANY group matching triggers the rule.

```yaml
- id: block-dangerous-operations
  name: Block any dangerous operation
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
        value: "sudo "
    - - field: arguments.command
        operator: matches
        value: "chmod\\s+777"
    - - field: arguments.command
        operator: contains
        value: "> /dev/"
```

**Example matching first group:**
```
TOOL CALL:
tool: execute_command
arguments:
  command: rm -rf /tmp/cache

Output: BLOCK (matches group 1: contains "rm -rf")
```

**Example matching third group:**
```
TOOL CALL:
tool: execute_command
arguments:
  command: chmod 777 /app/uploads

Output: BLOCK (matches group 3: matches chmod 777 pattern)
```

**Example matching none:**
```
TOOL CALL:
tool: execute_command
arguments:
  command: ls -la /app

Output: PASS (no groups match)
```

---

## 3. DISABLED & EMPTY RULES (`disabled_empty_rules.jsonl`)

### Disabled Rule (PASS despite matching)

```
TOOL CALL:
tool: delete_file
arguments:
  path: /app/data/important.txt

RULES:
- id: block-all-deletes
  name: Block file deletion
  enabled: false
  severity: critical
  action: block
  tools: [delete_file]
  conditions:
    - field: arguments.path
      operator: matches
      value: ".*"
```

**Output:**
```json
{"pass_weight": 0.95, "block_weight": 0.05, "decision": "pass", "reasoning": "Rule block-all-deletes is disabled (enabled: false). Operation allowed."}
```

### Empty Rules Array (PASS)

```
TOOL CALL:
tool: send_notification
arguments:
  message: Hello world
  channel: general

RULES: []
```

**Output:**
```json
{"pass_weight": 0.99, "block_weight": 0.01, "decision": "pass", "reasoning": "No rules defined. Tool call allowed by default."}
```

### All Rules Disabled (PASS)

```
TOOL CALL:
tool: read_file
arguments:
  path: /etc/passwd

RULES:
- id: block-system-paths
  name: Block system paths
  enabled: false
  severity: critical
  action: block
  tools: [read_file]
  conditions:
    - field: arguments.path
      operator: starts_with
      value: "/etc/"

- id: block-sensitive-files
  name: Block sensitive files
  enabled: false
  severity: critical
  action: block
  tools: [read_file]
  conditions:
    - field: arguments.path
      operator: ends_with
      value: "passwd"
```

**Output:**
```json
{"pass_weight": 0.92, "block_weight": 0.08, "decision": "pass", "reasoning": "Both applicable rules are disabled. No active rules block this operation."}
```

---

## 4. OBFUSCATION ATTACKS (`obfuscation_attacks.jsonl`)

Cross-domain obfuscation patterns. See `03_ADVERSARIAL_SPEC.md` for detailed attack patterns.

Include 1000 examples covering:
- Path traversal (300): `../`, `..%2f`, `....//`
- Encoding tricks (200): URL encoding, double encoding
- Unicode (150): Cyrillic homoglyphs, normalization
- Command injection (200): `;`, `|`, `&&`, `$()`
- Null bytes (75): `%00`, `\x00`
- Whitespace tricks (75): Leading spaces, tabs, newlines

---

## Validation Checklist

- [ ] 5,000 examples total
- [ ] operator_coverage.jsonl has 220+ per operator
- [ ] condition_groups.jsonl has 1000 OR logic examples
- [ ] disabled_empty_rules.jsonl all result in PASS
- [ ] obfuscation_attacks.jsonl has diverse attack types
- [ ] Every operator represented with BLOCK and PASS outcomes
- [ ] Regex patterns are valid and escaped properly
- [ ] Weights are calibrated correctly per Master Spec
