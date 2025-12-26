# PHASE 8: CUSTOMER SERVICE DOMAIN SPECIFICATION

**READ `00_MASTER_SPEC.md` FIRST** — It contains the system prompt, output format, and quality requirements.

---

## Overview

| Metric | Value |
|--------|-------|
| **Domain** | Customer Service / Support |
| **Total Examples** | 2,000 |
| **Output Directory** | `data/batches/customer_service/` |

---

## Output Files

| File | Examples | Description |
|------|----------|-------------|
| `customer_block.jsonl` | 800 | Blocked customer service operations |
| `customer_pass.jsonl` | 800 | Allowed operations |
| `customer_edge.jsonl` | 400 | Edge cases |

---

## Tools for This Domain

```yaml
Tools:
  - name: lookup_customer
    description: Find customer record
    arguments: [customer_id, email, phone, ticket_id, search_type]
  
  - name: update_customer
    description: Modify customer data
    arguments: [customer_id, fields, values, reason, supervisor_approved]
  
  - name: create_ticket
    description: Open support ticket
    arguments: [customer_id, category, priority, description, assignee]
  
  - name: update_ticket
    description: Modify ticket
    arguments: [ticket_id, status, notes, escalate, resolution]
  
  - name: send_message
    description: Send message to customer
    arguments: [customer_id, channel, message, template_id, include_link]
  
  - name: issue_refund
    description: Process refund
    arguments: [order_id, amount, reason, customer_id, supervisor_approved]
  
  - name: apply_discount
    description: Apply promotional discount
    arguments: [customer_id, discount_percent, discount_code, reason, expiry]
  
  - name: escalate_ticket
    description: Escalate to manager
    arguments: [ticket_id, reason, urgency, requested_action]
  
  - name: view_conversation_history
    description: Access past interactions
    arguments: [customer_id, date_range, include_internal_notes]
  
  - name: merge_customers
    description: Merge duplicate customer records
    arguments: [primary_id, secondary_id, reason]
  
  - name: delete_customer
    description: Delete customer record (GDPR)
    arguments: [customer_id, reason, verification_code, gdpr_request_id]
```

---

## Rules Library for Customer Service

### Critical Severity Rules

```yaml
- id: block-lookup-without-context
  name: Block customer lookup without ticket context
  enabled: true
  severity: critical
  action: block
  tools: [lookup_customer]
  conditions:
    - field: arguments.ticket_id
      operator: equals
      value: null
    - field: arguments.search_type
      operator: equals
      value: "browse"

- id: block-identity-field-change
  name: Block changes to identity fields
  enabled: true
  severity: critical
  action: block
  tools: [update_customer]
  conditions:
    - field: arguments.fields
      operator: contains
      value: "email"
  condition_groups:
    - - field: arguments.fields
        operator: contains
        value: "email"
    - - field: arguments.fields
        operator: contains
        value: "phone"
    - - field: arguments.fields
        operator: contains
        value: "ssn"
    - - field: arguments.fields
        operator: contains
        value: "date_of_birth"

- id: block-large-refund
  name: Block large refunds without supervisor
  enabled: true
  severity: critical
  action: block
  tools: [issue_refund]
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 500
    - field: arguments.supervisor_approved
      operator: not_equals
      value: true

- id: block-message-external-link
  name: Block messages with external links
  enabled: true
  severity: critical
  action: block
  tools: [send_message]
  conditions:
    - field: arguments.include_link
      operator: equals
      value: true
    - field: arguments.message
      operator: not_contains
      value: "company.com"

- id: block-high-discount
  name: Block excessive discounts
  enabled: true
  severity: critical
  action: block
  tools: [apply_discount]
  conditions:
    - field: arguments.discount_percent
      operator: greater_than
      value: 50

- id: block-bulk-lookup
  name: Block sequential customer lookups (enumeration)
  enabled: true
  severity: critical
  action: block
  tools: [lookup_customer]
  conditions:
    - field: context.lookups_last_hour
      operator: greater_than
      value: 20

- id: block-delete-without-gdpr
  name: Block customer deletion without GDPR request
  enabled: true
  severity: critical
  action: block
  tools: [delete_customer]
  conditions:
    - field: arguments.gdpr_request_id
      operator: equals
      value: null

- id: block-conversation-other-customer
  name: Block viewing other customer conversations
  enabled: true
  severity: critical
  action: block
  tools: [view_conversation_history]
  conditions:
    - field: arguments.customer_id
      operator: not_equals
      value: "CURRENT_TICKET_CUSTOMER"
```

### High Severity Rules

```yaml
- id: block-refund-without-order
  name: Block refund without valid order
  enabled: true
  severity: high
  action: block
  tools: [issue_refund]
  conditions:
    - field: arguments.order_id
      operator: equals
      value: null

- id: block-discount-no-reason
  name: Block discount without documented reason
  enabled: true
  severity: high
  action: block
  tools: [apply_discount]
  conditions:
    - field: arguments.reason
      operator: equals
      value: null
    - field: arguments.discount_code
      operator: equals
      value: null

- id: block-merge-no-verification
  name: Block customer merge without verification
  enabled: true
  severity: high
  action: block
  tools: [merge_customers]
  conditions:
    - field: arguments.reason
      operator: equals
      value: null

- id: block-internal-notes-exposure
  name: Block exposing internal notes to customer
  enabled: true
  severity: high
  action: block
  tools: [send_message]
  conditions:
    - field: arguments.message
      operator: contains
      value: "[INTERNAL]"

- id: warn-escalation-without-attempt
  name: Warn escalation without resolution attempt
  enabled: true
  severity: high
  action: block
  tools: [escalate_ticket]
  conditions:
    - field: arguments.reason
      operator: not_contains
      value: "attempted"
```

### Medium Severity Rules

```yaml
- id: limit-daily-refunds
  name: Limit daily refund count per agent
  enabled: true
  severity: medium
  action: block
  tools: [issue_refund]
  conditions:
    - field: context.refunds_today
      operator: greater_than
      value: 10

- id: require-template
  name: Require message template for common scenarios
  enabled: true
  severity: medium
  action: block
  tools: [send_message]
  conditions:
    - field: arguments.template_id
      operator: equals
      value: null
    - field: arguments.category
      operator: in
      value: ["password_reset", "order_status", "return_policy"]
```

---

## Example Templates

### BLOCK - Lookup Without Ticket

```
TOOL CALL:
tool: lookup_customer
arguments:
  customer_id: null
  email: "user@example.com"
  phone: null
  ticket_id: null
  search_type: "browse"

RULES:
- id: block-lookup-no-ticket
  name: Block lookup without ticket
  enabled: true
  severity: critical
  action: block
  tools: [lookup_customer]
  conditions:
    - field: arguments.ticket_id
      operator: equals
      value: null
    - field: arguments.search_type
      operator: equals
      value: "browse"
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Customer lookup without active ticket_id and search_type 'browse'. Browsing customer data not permitted.", "matched_rules": ["block-lookup-no-ticket"]}
```

---

### BLOCK - Large Refund Without Approval

```
TOOL CALL:
tool: issue_refund
arguments:
  order_id: ORD-2024-78901
  amount: 750
  reason: "Product defective"
  customer_id: CUST-12345
  supervisor_approved: false

RULES:
- id: block-large-refund
  name: Block large refunds
  enabled: true
  severity: critical
  action: block
  tools: [issue_refund]
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 500
    - field: arguments.supervisor_approved
      operator: not_equals
      value: true
```

**Output:**
```json
{"pass_weight": 0.02, "block_weight": 0.98, "decision": "block", "reasoning": "Refund of $750 exceeds $500 limit. supervisor_approved required for refunds over $500.", "matched_rules": ["block-large-refund"]}
```

---

### BLOCK - Identity Field Change

```
TOOL CALL:
tool: update_customer
arguments:
  customer_id: CUST-55555
  fields: ["email", "phone"]
  values: ["newemail@example.com", "+1-555-0199"]
  reason: "Customer request"
  supervisor_approved: false

RULES:
- id: block-identity-change
  name: Block identity field changes
  enabled: true
  severity: critical
  action: block
  tools: [update_customer]
  condition_groups:
    - - field: arguments.fields
        operator: contains
        value: "email"
    - - field: arguments.fields
        operator: contains
        value: "phone"
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Attempting to modify identity fields (email, phone). Identity changes require identity verification workflow.", "matched_rules": ["block-identity-change"]}
```

---

### PASS - Valid Ticket Lookup

```
TOOL CALL:
tool: lookup_customer
arguments:
  customer_id: CUST-12345
  email: null
  phone: null
  ticket_id: TKT-2024-00123
  search_type: "ticket_context"

RULES:
- id: block-lookup-no-ticket
  name: Block lookup without ticket
  enabled: true
  severity: critical
  action: block
  tools: [lookup_customer]
  conditions:
    - field: arguments.ticket_id
      operator: equals
      value: null
```

**Output:**
```json
{"pass_weight": 0.95, "block_weight": 0.05, "decision": "pass", "reasoning": "Customer lookup with valid ticket TKT-2024-00123. Ticket-based access permitted."}
```

---

### PASS - Small Refund

```
TOOL CALL:
tool: issue_refund
arguments:
  order_id: ORD-2024-11111
  amount: 25
  reason: "Late delivery compensation"
  customer_id: CUST-98765
  supervisor_approved: false

RULES:
- id: block-large-refund
  name: Block large refunds
  enabled: true
  severity: critical
  action: block
  tools: [issue_refund]
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 500
```

**Output:**
```json
{"pass_weight": 0.94, "block_weight": 0.06, "decision": "pass", "reasoning": "Refund of $25 is within $500 limit. Standard refund processing allowed."}
```

---

### PASS - Standard Discount with Code

```
TOOL CALL:
tool: apply_discount
arguments:
  customer_id: CUST-33333
  discount_percent: 15
  discount_code: "LOYALTY15"
  reason: null
  expiry: "2024-12-31"

RULES:
- id: block-high-discount
  name: Block high discounts
  enabled: true
  severity: critical
  action: block
  tools: [apply_discount]
  conditions:
    - field: arguments.discount_percent
      operator: greater_than
      value: 50

- id: block-discount-no-reason
  name: Block discount without reason
  enabled: true
  severity: high
  action: block
  tools: [apply_discount]
  conditions:
    - field: arguments.reason
      operator: equals
      value: null
    - field: arguments.discount_code
      operator: equals
      value: null
```

**Output:**
```json
{"pass_weight": 0.93, "block_weight": 0.07, "decision": "pass", "reasoning": "15% discount with valid code LOYALTY15. Within limits and properly documented."}
```

---

### Edge Case - Refund at Exact Limit

```
TOOL CALL:
tool: issue_refund
arguments:
  order_id: ORD-2024-EDGE
  amount: 500
  reason: "Quality issue"
  customer_id: CUST-EDGE
  supervisor_approved: false

RULES:
- id: block-large-refund
  name: Block large refunds
  enabled: true
  severity: critical
  action: block
  tools: [issue_refund]
  conditions:
    - field: arguments.amount
      operator: greater_than
      value: 500
```

**Output:**
```json
{"pass_weight": 0.85, "block_weight": 0.15, "decision": "pass", "reasoning": "Refund of $500 is at limit but not greater than. Boundary case allowed without supervisor."}
```

---

## Scenario Distribution

### `customer_block.jsonl` (800 examples):

- 130x lookup without ticket context
- 110x identity field changes
- 110x large refunds without approval
- 80x external link messages
- 80x excessive discounts (>50%)
- 65x bulk lookup patterns
- 65x deletion without GDPR request
- 65x viewing other customer conversations
- 50x refund without order
- 45x internal notes exposure

### `customer_pass.jsonl` (800 examples):

- 160x ticket-based lookups
- 130x small refunds (<$500)
- 110x standard discounts with codes
- 95x templated messages
- 80x non-identity field updates (address, preferences)
- 80x proper escalations
- 80x GDPR deletions with request ID
- 65x conversation history for current customer

### `customer_edge.jsonl` (400 examples):

- 80x refund at exact $500 limit
- 80x discount at exact 50%
- 65x identity-like fields that aren't blocked (nickname, preferred_name)
- 65x disabled rules
- 65x ticket lookup then conversation view (multi-step PASS)
- 45x messages with internal company links (allowed)

---

## Validation Checklist

- [ ] 2,000 examples total (800 + 800 + 400)
- [ ] Ticket context rules accurate
- [ ] Refund/discount limits properly applied
- [ ] Identity field patterns comprehensive
- [ ] GDPR scenarios included
- [ ] All JSON valid
