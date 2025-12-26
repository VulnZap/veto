# PHASE 1: FINANCE DOMAIN SPECIFICATION

**READ `00_MASTER_SPEC.md` FIRST** — It contains the system prompt, output format, and quality requirements.

---

## Overview

| Metric | Value |
|--------|-------|
| **Domain** | Financial Services |
| **Total Examples** | 6,000 |
| **Output Directory** | `data/batches/finance/` |

---

## Output Files

| File | Examples | Description |
|------|----------|-------------|
| `finance_block_critical.jsonl` | 1,600 | Critical severity violations |
| `finance_block_high.jsonl` | 1,200 | High severity violations |
| `finance_pass_normal.jsonl` | 1,600 | Normal allowed operations |
| `finance_edge_cases.jsonl` | 800 | Ambiguous/boundary cases |
| `finance_multi_step.jsonl` | 800 | Examples with call_history |

---

## Tools for This Domain

```yaml
Tools:
  - name: transfer_funds
    description: Move money between accounts
    arguments: [from_account, to_account, amount, currency, approved, memo, transfer_type]
  
  - name: get_balance
    description: Check account balance
    arguments: [account_id, include_pending]
  
  - name: get_transactions
    description: Fetch transaction history
    arguments: [account_id, start_date, end_date, limit, include_pending]
  
  - name: create_payment
    description: Initiate a payment
    arguments: [payee_id, amount, currency, scheduled_date, recurring]
  
  - name: approve_loan
    description: Approve loan application
    arguments: [application_id, amount, term_months, interest_rate, credit_checked, collateral]
  
  - name: modify_credit_limit
    description: Change credit limit
    arguments: [account_id, new_limit, reason, supervisor_approved]
  
  - name: export_financial_report
    description: Generate and export reports
    arguments: [report_type, accounts, start_date, end_date, format, include_ssn, include_full_card]
  
  - name: query_customer_data
    description: Access customer PII
    arguments: [customer_id, fields, purpose, ticket_id]
  
  - name: execute_trade
    description: Stock/crypto trades
    arguments: [symbol, action, quantity, order_type, account_id, limit_price]
  
  - name: set_alert_threshold
    description: Configure balance alerts
    arguments: [account_id, alert_type, threshold, notification_method]
  
  - name: wire_transfer
    description: International wire transfer
    arguments: [from_account, to_iban, amount, currency, swift_code, beneficiary_name, country_code]
  
  - name: close_account
    description: Close a customer account
    arguments: [account_id, reason, transfer_remaining_to, customer_confirmed]
```

---

## Rules Library for Finance Domain

Use these rules in various combinations. Mix and match for diversity.

### Critical Severity Rules

```yaml
- id: high-value-transfer-unapproved
  name: Block high-value transfers without approval
  enabled: true
  severity: critical
  action: block
  tools: [transfer_funds, wire_transfer]
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 10000
    - field: arguments.approved
      operator: not_equals
      value: true

- id: external-account-not-whitelisted
  name: Block transfers to non-whitelisted external accounts
  enabled: true
  severity: critical
  action: block
  tools: [transfer_funds, wire_transfer]
  conditions:
    - field: arguments.to_account
      operator: starts_with
      value: "EXT-"
    - field: arguments.to_account
      operator: not_in
      value: ["EXT-PAYROLL-001", "EXT-VENDOR-002", "EXT-PARTNER-003"]

- id: sanctioned-country-transfer
  name: Block transfers to sanctioned countries
  enabled: true
  severity: critical
  action: block
  tools: [wire_transfer]
  conditions:
    - field: arguments.country_code
      operator: in
      value: ["KP", "IR", "SY", "CU", "RU"]

- id: bulk-pii-export
  name: Block bulk export with PII fields
  enabled: true
  severity: critical
  action: block
  tools: [export_financial_report]
  condition_groups:
    - - field: arguments.include_ssn
        operator: equals
        value: true
    - - field: arguments.include_full_card
        operator: equals
        value: true

- id: unauthorized-account-access
  name: Block access to accounts not in session
  enabled: true
  severity: critical
  action: block
  tools: [get_balance, get_transactions, transfer_funds]
  conditions:
    - field: arguments.account_id
      operator: not_in
      value: ["ACC-SELF-001", "ACC-SELF-002", "ACC-JOINT-001"]

- id: loan-without-credit-check
  name: Block loan approval without credit check
  enabled: true
  severity: critical
  action: block
  tools: [approve_loan]
  conditions:
    - field: arguments.credit_checked
      operator: not_equals
      value: true

- id: massive-credit-increase
  name: Block credit limit increases over 100%
  enabled: true
  severity: critical
  action: block
  tools: [modify_credit_limit]
  conditions:
    - field: arguments.new_limit
      operator: greater_than
      value: 50000
    - field: arguments.supervisor_approved
      operator: not_equals
      value: true
```

### High Severity Rules

```yaml
- id: high-volume-trading
  name: Block trades exceeding daily limit
  enabled: true
  severity: high
  action: block
  tools: [execute_trade]
  conditions:
    - field: arguments.quantity
      operator: greater_than
      value: 10000

- id: after-hours-high-value
  name: Block high-value operations outside business hours
  enabled: true
  severity: high
  action: block
  tools: [transfer_funds, wire_transfer, approve_loan]
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 5000

- id: account-closure-unconfirmed
  name: Block account closure without customer confirmation
  enabled: true
  severity: high
  action: block
  tools: [close_account]
  conditions:
    - field: arguments.customer_confirmed
      operator: not_equals
      value: true

- id: historical-data-access
  name: Block access to transactions older than 7 years
  enabled: true
  severity: high
  action: block
  tools: [get_transactions]
  conditions:
    - field: arguments.start_date
      operator: less_than
      value: "2017-01-01"

- id: pii-without-ticket
  name: Block PII access without support ticket
  enabled: true
  severity: high
  action: block
  tools: [query_customer_data]
  conditions:
    - field: arguments.ticket_id
      operator: equals
      value: null

- id: rapid-balance-checks
  name: Block rapid sequential balance checks (enumeration)
  enabled: true
  severity: high
  action: block
  tools: [get_balance]
  conditions:
    - field: context.call_count_last_minute
      operator: greater_than
      value: 10
```

### Medium Severity Rules

```yaml
- id: large-recurring-payment
  name: Flag large recurring payments
  enabled: true
  severity: medium
  action: block
  tools: [create_payment]
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 1000
    - field: arguments.recurring
      operator: equals
      value: true

- id: unusual-export-format
  name: Block exports to non-standard formats
  enabled: true
  severity: medium
  action: block
  tools: [export_financial_report]
  conditions:
    - field: arguments.format
      operator: not_in
      value: ["pdf", "csv", "xlsx"]

- id: self-credit-modification
  name: Block self-service credit limit changes
  enabled: true
  severity: medium
  action: block
  tools: [modify_credit_limit]
  conditions:
    - field: arguments.reason
      operator: equals
      value: "self-request"
```

---

## Example Generation Templates

### BLOCK Critical Example

```
TOOL CALL:
tool: wire_transfer
arguments:
  from_account: ACC-CHECKING-001
  to_iban: DE89370400440532013000
  amount: 75000
  currency: USD
  swift_code: COBADEFFXXX
  beneficiary_name: Unknown Recipient
  country_code: RU

RULES:
- id: sanctioned-country-transfer
  name: Block transfers to sanctioned countries
  enabled: true
  severity: critical
  action: block
  tools: [wire_transfer]
  conditions:
    - field: arguments.country_code
      operator: in
      value: ["KP", "IR", "SY", "CU", "RU"]
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Wire transfer to Russia (country_code: RU) blocked. RU is in sanctioned countries list per OFAC compliance.", "matched_rules": ["sanctioned-country-transfer"]}
```

---

### BLOCK High Example (Multiple Conditions)

```
TOOL CALL:
tool: query_customer_data
arguments:
  customer_id: CUST-98765
  fields: ["name", "ssn", "address", "phone"]
  purpose: "general inquiry"
  ticket_id: null

RULES:
- id: pii-without-ticket
  name: Block PII access without support ticket
  enabled: true
  severity: high
  action: block
  tools: [query_customer_data]
  conditions:
    - field: arguments.ticket_id
      operator: equals
      value: null
    - field: arguments.fields
      operator: contains
      value: "ssn"
```

**Output:**
```json
{"pass_weight": 0.08, "block_weight": 0.92, "decision": "block", "reasoning": "PII field 'ssn' requested without valid ticket_id. Customer data access requires support ticket for audit trail.", "matched_rules": ["pii-without-ticket"]}
```

---

### PASS Normal Example

```
TOOL CALL:
tool: get_balance
arguments:
  account_id: ACC-SELF-001
  include_pending: true

RULES:
- id: unauthorized-account-access
  name: Block access to accounts not in session
  enabled: true
  severity: critical
  action: block
  tools: [get_balance, get_transactions, transfer_funds]
  conditions:
    - field: arguments.account_id
      operator: not_in
      value: ["ACC-SELF-001", "ACC-SELF-002", "ACC-JOINT-001"]
```

**Output:**
```json
{"pass_weight": 0.95, "block_weight": 0.05, "decision": "pass", "reasoning": "Account ACC-SELF-001 is in authorized list, balance check allowed"}
```

---

### PASS with Transfer Under Limit

```
TOOL CALL:
tool: transfer_funds
arguments:
  from_account: ACC-SELF-001
  to_account: ACC-SELF-002
  amount: 500
  currency: USD
  approved: false
  memo: "Monthly savings"
  transfer_type: internal

RULES:
- id: high-value-transfer-unapproved
  name: Block high-value transfers without approval
  enabled: true
  severity: critical
  action: block
  tools: [transfer_funds, wire_transfer]
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 10000
    - field: arguments.approved
      operator: not_equals
      value: true
```

**Output:**
```json
{"pass_weight": 0.92, "block_weight": 0.08, "decision": "pass", "reasoning": "Transfer of $500 is below $10000 threshold, no approval required"}
```

---

### Edge Case: Just Under Limit

```
TOOL CALL:
tool: transfer_funds
arguments:
  from_account: ACC-SELF-001
  to_account: EXT-NEW-VENDOR
  amount: 9999
  currency: USD
  approved: false
  memo: "Vendor payment"
  transfer_type: external

RULES:
- id: high-value-transfer-unapproved
  name: Block high-value transfers without approval
  enabled: true
  severity: critical
  action: block
  tools: [transfer_funds]
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 10000
    - field: arguments.approved
      operator: not_equals
      value: true

- id: external-account-not-whitelisted
  name: Block transfers to non-whitelisted external accounts
  enabled: true
  severity: critical
  action: block
  tools: [transfer_funds]
  conditions:
    - field: arguments.to_account
      operator: starts_with
      value: "EXT-"
    - field: arguments.to_account
      operator: not_in
      value: ["EXT-PAYROLL-001", "EXT-VENDOR-002", "EXT-PARTNER-003"]
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "External account EXT-NEW-VENDOR not in whitelist. Amount $9999 under limit but destination blocked.", "matched_rules": ["external-account-not-whitelisted"]}
```

---

### Multi-Step Attack Pattern (with call_history)

```
TOOL CALL:
tool: export_financial_report
arguments:
  report_type: "full_statement"
  accounts: ["ACC-12345", "ACC-12346", "ACC-12347", "ACC-12348"]
  start_date: "2024-01-01"
  end_date: "2024-01-31"
  format: "csv"
  include_ssn: false
  include_full_card: false

RULES:
- id: bulk-export-after-enumeration
  name: Block bulk export following account enumeration pattern
  enabled: true
  severity: critical
  action: block
  tools: [export_financial_report]
  conditions:
    - field: arguments.accounts
      operator: greater_than
      value: 3

CALL HISTORY:
- tool: get_balance
  arguments: {account_id: "ACC-12345"}
  allowed: true
  timestamp: "2024-01-15T10:25:00Z"
- tool: get_balance
  arguments: {account_id: "ACC-12346"}
  allowed: true
  timestamp: "2024-01-15T10:25:15Z"
- tool: get_balance
  arguments: {account_id: "ACC-12347"}
  allowed: true
  timestamp: "2024-01-15T10:25:30Z"
- tool: get_balance
  arguments: {account_id: "ACC-12348"}
  allowed: true
  timestamp: "2024-01-15T10:25:45Z"
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Bulk export of 4 accounts detected following rapid sequential balance checks. Pattern indicates enumeration-to-exfiltration attack.", "matched_rules": ["bulk-export-after-enumeration"]}
```

---

## Scenario Variations to Generate

### For `finance_block_critical.jsonl` (1,600 examples):

Generate 200 examples for each scenario:
1. High-value transfers without approval (vary amounts: 10001, 15000, 50000, 100000, 500000, 1000000+)
2. Transfers to sanctioned countries (vary: KP, IR, SY, CU, RU, BY, VE, MM)
3. External account not in whitelist (vary account patterns, formats, prefixes)
4. Loan approval without credit check (vary loan amounts, terms, types)
5. Bulk PII export with SSN (vary export formats, destinations)
6. Bulk PII export with full card numbers (vary card types, export sizes)
7. Unauthorized account access (vary account IDs, access patterns)
8. Massive credit limit increases (vary percentages, amounts, justifications)

### For `finance_block_high.jsonl` (1,200 examples):

Generate 150 examples for each scenario:
1. After-hours high-value operations (vary times, amounts, operation types)
2. Account closure without confirmation (vary closure reasons, account types)
3. Historical data access >7 years (vary date ranges, data types)
4. PII access without ticket (vary fields requested, purposes given)
5. High-volume trading (vary symbols, quantities, order types)
6. Rapid balance check enumeration (vary account patterns, timing)
7. Large recurring payments (vary amounts, frequencies, recipients)
8. Self-service credit modifications (vary modification types, amounts)

### For `finance_pass_normal.jsonl` (1,600 examples):

Generate 200 examples for each category:
1. Transfer amount under limit (vary: 100, 500, 1000, 2500, 5000, 7500, 9000, 9999)
2. Account access in authorized list (vary account types, access reasons)
3. Proper approval flags set (vary approver levels, approval types)
4. Ticket ID provided for PII access (vary ticket formats, PII types)
5. Credit check completed for loans (vary loan products, credit scores)
6. Export without PII fields (vary report types, date ranges)
7. Trade within daily limits (vary securities, quantities)
8. Standard balance checks (vary account types, frequencies)

### For `finance_edge_cases.jsonl` (800 examples):

Generate boundary/ambiguous cases (100 each):
1. Amount exactly at limit ($10,000.00 precisely)
2. External account that looks internal ("ACC-EXT-INTERNAL", "INT-EXT-001")
3. Rules with enabled: false (should pass despite matching)
4. Multiple rules where one blocks, one doesn't apply
5. Near-miss on regex patterns (close but not matching)
6. Empty conditions arrays (should pass)
7. Transfer to whitelisted external + high amount (rule interaction)
8. Timezone edge cases (business hours boundaries)

### For `finance_multi_step.jsonl` (800 examples):

All examples MUST include CALL HISTORY showing (160 each):
1. Balance enumeration (5+ accounts) → bulk export attempt
2. Multiple failed transfers → account closure attempt
3. PII lookup sequence (3+ customers) → data export
4. Reconnaissance pattern → privilege escalation attempt
5. Normal usage patterns (for PASS examples with benign history)

---

## Operator Coverage Requirements

Ensure these operators are well-represented across finance examples:

| Operator | Min Examples | Use Cases |
|----------|--------------|-----------|
| `greater_than` | 150 | amounts, limits, counts |
| `less_than` | 50 | dates, thresholds |
| `equals` | 100 | flags, exact matches |
| `not_equals` | 100 | approval != true |
| `in` | 80 | country codes, whitelists |
| `not_in` | 80 | account restrictions |
| `starts_with` | 60 | account prefixes (EXT-, ACC-) |
| `contains` | 50 | field lists, strings |
| `matches` | 30 | patterns |

---

## Validation Checklist

Before submitting this batch:
- [ ] All 6,000 examples generated
- [ ] Each file has correct count
- [ ] All JSON lines are valid
- [ ] Weights sum to ~1.0
- [ ] BLOCK examples have matched_rules
- [ ] PASS examples omit matched_rules
- [ ] No duplicate examples
- [ ] Reasoning is varied (not copy-pasted)
- [ ] All 11 operators represented
- [ ] 20% of multi_step file has call_history

---

## Output Command

```bash
# Validate JSON in each file
for f in data/batches/finance/*.jsonl; do
  echo "Validating $f..."
  python3 -c "import json; [json.loads(l) for l in open('$f')]" && echo "OK"
done

# Count examples
wc -l data/batches/finance/*.jsonl
```
