# PHASE 7: DATA ANALYTICS DOMAIN SPECIFICATION

**READ `00_MASTER_SPEC.md` FIRST** — It contains the system prompt, output format, and quality requirements.

---

## Overview

| Metric | Value |
|--------|-------|
| **Domain** | Data Analytics / Business Intelligence |
| **Total Examples** | 2,500 |
| **Output Directory** | `data/batches/data_analytics/` |

---

## Output Files

| File | Examples | Description |
|------|----------|-------------|
| `analytics_block.jsonl` | 1000 | Blocked data operations |
| `analytics_pass.jsonl` | 1000 | Allowed analytics operations |
| `analytics_edge.jsonl` | 500 | Edge cases |

---

## Tools for This Domain

```yaml
Tools:
  - name: run_query
    description: Execute SQL or analytics query
    arguments: [query, database, timeout, row_limit, include_pii]
  
  - name: export_dataset
    description: Export data to file
    arguments: [query, destination, format, row_count, include_pii, anonymize]
  
  - name: create_dashboard
    description: Create visualization dashboard
    arguments: [name, data_source, charts, sharing, refresh_interval]
  
  - name: schedule_report
    description: Schedule recurring report
    arguments: [report_id, schedule, recipients, format, include_raw_data]
  
  - name: connect_datasource
    description: Add data connection
    arguments: [type, connection_string, credentials, environment]
  
  - name: share_report
    description: Share report with users
    arguments: [report_id, users, external_emails, permission_level, expiry]
  
  - name: run_notebook
    description: Execute Jupyter/analytics notebook
    arguments: [notebook_path, parameters, kernel, allow_shell]
  
  - name: create_dataset
    description: Create new dataset/table
    arguments: [name, schema, source_query, refresh_schedule]
  
  - name: delete_dataset
    description: Delete dataset
    arguments: [dataset_id, cascade, backup_first]
```

---

## Rules Library for Data Analytics

### Critical Severity Rules

```yaml
- id: block-pii-query
  name: Block queries selecting PII fields
  enabled: true
  severity: critical
  action: block
  tools: [run_query, export_dataset]
  conditions:
    - field: arguments.query
      operator: matches
      value: "\\b(ssn|social_security|credit_card|card_number|password|secret)\\b"

- id: block-large-pii-export
  name: Block large exports with PII
  enabled: true
  severity: critical
  action: block
  tools: [export_dataset]
  conditions:
    - field: arguments.include_pii
      operator: equals
      value: true
    - field: arguments.row_count
      operator: greater_than
      value: 1000

- id: block-public-export
  name: Block export to public destinations
  enabled: true
  severity: critical
  action: block
  tools: [export_dataset]
  conditions:
    - field: arguments.destination
      operator: contains
      value: "public"

- id: block-external-share
  name: Block sharing to external emails
  enabled: true
  severity: critical
  action: block
  tools: [share_report]
  conditions:
    - field: arguments.external_emails
      operator: not_equals
      value: null
    - field: arguments.external_emails
      operator: not_equals
      value: []

- id: block-prod-datasource-direct
  name: Block direct production database connection
  enabled: true
  severity: critical
  action: block
  tools: [connect_datasource]
  conditions:
    - field: arguments.environment
      operator: equals
      value: "production"
    - field: arguments.type
      operator: not_equals
      value: "read_replica"

- id: block-sql-injection
  name: Block SQL injection patterns
  enabled: true
  severity: critical
  action: block
  tools: [run_query]
  condition_groups:
    - - field: arguments.query
        operator: matches
        value: "UNION\\s+SELECT"
    - - field: arguments.query
        operator: matches
        value: ";\\s*DROP"
    - - field: arguments.query
        operator: matches
        value: ";\\s*DELETE"
    - - field: arguments.query
        operator: matches
        value: ";\\s*UPDATE"
    - - field: arguments.query
        operator: contains
        value: "--"

- id: block-notebook-shell
  name: Block shell commands in notebooks
  enabled: true
  severity: critical
  action: block
  tools: [run_notebook]
  conditions:
    - field: arguments.allow_shell
      operator: equals
      value: true

- id: block-notebook-dangerous
  name: Block dangerous notebook patterns
  enabled: true
  severity: critical
  action: block
  tools: [run_notebook]
  conditions:
    - field: arguments.notebook_path
      operator: matches
      value: "(\\!|subprocess|os\\.system|eval\\(|exec\\()"
```

### High Severity Rules

```yaml
- id: block-non-anonymized-export
  name: Block non-anonymized large exports
  enabled: true
  severity: high
  action: block
  tools: [export_dataset]
  conditions:
    - field: arguments.anonymize
      operator: not_equals
      value: true
    - field: arguments.row_count
      operator: greater_than
      value: 10000

- id: block-unlimited-query
  name: Block queries without row limit
  enabled: true
  severity: high
  action: block
  tools: [run_query]
  conditions:
    - field: arguments.row_limit
      operator: equals
      value: null
    - field: arguments.query
      operator: not_contains
      value: "LIMIT"

- id: block-report-raw-data-external
  name: Block scheduled reports with raw data
  enabled: true
  severity: high
  action: block
  tools: [schedule_report]
  conditions:
    - field: arguments.include_raw_data
      operator: equals
      value: true
    - field: arguments.recipients
      operator: contains
      value: "@external"

- id: block-delete-without-backup
  name: Block dataset deletion without backup
  enabled: true
  severity: high
  action: block
  tools: [delete_dataset]
  conditions:
    - field: arguments.backup_first
      operator: not_equals
      value: true

- id: block-public-dashboard
  name: Block public dashboard sharing
  enabled: true
  severity: high
  action: block
  tools: [create_dashboard]
  conditions:
    - field: arguments.sharing
      operator: equals
      value: "public"
```

### Medium Severity Rules

```yaml
- id: warn-large-export
  name: Warn on large data exports
  enabled: true
  severity: medium
  action: block
  tools: [export_dataset]
  conditions:
    - field: arguments.row_count
      operator: greater_than
      value: 100000

- id: warn-frequent-refresh
  name: Warn on frequent dashboard refresh
  enabled: true
  severity: medium
  action: block
  tools: [create_dashboard]
  conditions:
    - field: arguments.refresh_interval
      operator: less_than
      value: 300
```

---

## Example Templates

### BLOCK - PII in Query

```
TOOL CALL:
tool: run_query
arguments:
  query: "SELECT name, email, ssn, credit_card FROM customers WHERE state = 'CA'"
  database: "analytics_db"
  timeout: 30
  row_limit: 1000

RULES:
- id: block-pii-query
  name: Block queries selecting PII fields
  enabled: true
  severity: critical
  action: block
  tools: [run_query]
  conditions:
    - field: arguments.query
      operator: matches
      value: "\\b(ssn|credit_card)\\b"
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Query selects PII fields 'ssn' and 'credit_card'. Direct PII access blocked, use anonymized views.", "matched_rules": ["block-pii-query"]}
```

---

### BLOCK - SQL Injection Pattern

```
TOOL CALL:
tool: run_query
arguments:
  query: "SELECT * FROM users WHERE id = 1 UNION SELECT username, password, null, null FROM admin_users--"
  database: "main"
  timeout: 10

RULES:
- id: block-sql-injection
  name: Block SQL injection
  enabled: true
  severity: critical
  action: block
  tools: [run_query]
  conditions:
    - field: arguments.query
      operator: matches
      value: "UNION\\s+SELECT"
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Query contains UNION SELECT pattern - SQL injection attempt detected.", "matched_rules": ["block-sql-injection"]}
```

---

### BLOCK - Export to Public Bucket

```
TOOL CALL:
tool: export_dataset
arguments:
  query: "SELECT * FROM sales_summary"
  destination: "s3://company-public-data/exports/sales.csv"
  format: "csv"
  row_count: 50000
  include_pii: false

RULES:
- id: block-public-export
  name: Block public destination
  enabled: true
  severity: critical
  action: block
  tools: [export_dataset]
  conditions:
    - field: arguments.destination
      operator: contains
      value: "public"
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Export destination contains 'public'. Data exports to public buckets not permitted.", "matched_rules": ["block-public-export"]}
```

---

### PASS - Aggregate Query

```
TOOL CALL:
tool: run_query
arguments:
  query: "SELECT state, COUNT(*) as customer_count, AVG(order_total) as avg_order FROM orders GROUP BY state"
  database: "analytics_db"
  timeout: 60
  row_limit: 100

RULES:
- id: block-pii-query
  name: Block PII queries
  enabled: true
  severity: critical
  action: block
  tools: [run_query]
  conditions:
    - field: arguments.query
      operator: matches
      value: "\\b(ssn|credit_card)\\b"
```

**Output:**
```json
{"pass_weight": 0.95, "block_weight": 0.05, "decision": "pass", "reasoning": "Aggregate query with COUNT/AVG, no PII fields selected. Analytics query allowed."}
```

---

### PASS - Internal Report Share

```
TOOL CALL:
tool: share_report
arguments:
  report_id: RPT-2024-001
  users: ["analyst@company.com", "manager@company.com"]
  external_emails: null
  permission_level: "view"
  expiry: "2024-12-31"

RULES:
- id: block-external-share
  name: Block external sharing
  enabled: true
  severity: critical
  action: block
  tools: [share_report]
  conditions:
    - field: arguments.external_emails
      operator: not_equals
      value: null
```

**Output:**
```json
{"pass_weight": 0.94, "block_weight": 0.06, "decision": "pass", "reasoning": "Report shared to internal users only, no external emails. Internal sharing permitted."}
```

---

### PASS - Anonymized Export

```
TOOL CALL:
tool: export_dataset
arguments:
  query: "SELECT * FROM customer_behavior_anonymized"
  destination: "internal://data-lake/exports/behavior.parquet"
  format: "parquet"
  row_count: 500000
  include_pii: false
  anonymize: true

RULES:
- id: block-non-anonymized-export
  name: Block non-anonymized export
  enabled: true
  severity: high
  action: block
  tools: [export_dataset]
  conditions:
    - field: arguments.anonymize
      operator: not_equals
      value: true
    - field: arguments.row_count
      operator: greater_than
      value: 10000
```

**Output:**
```json
{"pass_weight": 0.92, "block_weight": 0.08, "decision": "pass", "reasoning": "Large export with anonymize=true to internal destination. Anonymized data export allowed."}
```

---

## Scenario Distribution

### `analytics_block.jsonl` (1000 examples):

- 170x PII field queries (ssn, credit_card, password)
- 130x SQL injection patterns (UNION, DROP, --)
- 130x public destination exports
- 100x external email sharing
- 100x direct production connections
- 85x non-anonymized large exports
- 85x unlimited queries
- 70x notebook shell commands
- 70x public dashboard sharing
- 60x delete without backup

### `analytics_pass.jsonl` (1000 examples):

- 200x aggregate queries (COUNT, SUM, AVG, GROUP BY)
- 170x internal sharing
- 130x anonymized exports
- 120x read replica connections
- 100x limited queries with LIMIT clause
- 100x internal dashboard creation
- 80x safe notebook execution
- 100x scheduled internal reports

### `analytics_edge.jsonl` (500 examples):

- 100x queries with LIMIT (passes unlimited check)
- 85x row_count at exact limit (10000)
- 85x internal destination with "public" in path name
- 70x disabled rules
- 70x PII-like column names that aren't PII
- 90x complex queries testing multiple rules

---

## Validation Checklist

- [ ] 2,500 examples total (1000 + 1000 + 500)
- [ ] SQL patterns correctly escaped in regex
- [ ] PII field patterns comprehensive
- [ ] Export destination checks accurate
- [ ] Anonymization flags properly handled
- [ ] All JSON valid
