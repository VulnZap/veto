# PHASE 6: HEALTHCARE DOMAIN SPECIFICATION

**READ `00_MASTER_SPEC.md` FIRST** — It contains the system prompt, output format, and quality requirements.

---

## Overview

| Metric | Value |
|--------|-------|
| **Domain** | Healthcare / HIPAA Compliance |
| **Total Examples** | 2,500 |
| **Output Directory** | `data/batches/healthcare/` |

---

## Output Files

| File | Examples | Description |
|------|----------|-------------|
| `health_block.jsonl` | 1000 | Blocked PHI/HIPAA violations |
| `health_pass.jsonl` | 1000 | Allowed healthcare operations |
| `health_edge.jsonl` | 500 | Edge cases and ambiguous scenarios |

---

## Tools for This Domain

```yaml
Tools:
  - name: get_patient_record
    description: Access patient health information
    arguments: [patient_id, fields, purpose, encounter_id, requesting_provider]
  
  - name: update_patient_record
    description: Modify patient health information
    arguments: [patient_id, fields, values, reason, audit_bypass]
  
  - name: schedule_appointment
    description: Book patient appointment
    arguments: [patient_id, provider_id, datetime, type, notes]
  
  - name: prescribe_medication
    description: Create prescription
    arguments: [patient_id, medication, dosage, quantity, refills, controlled_substance, dea_verified]
  
  - name: order_lab_test
    description: Order laboratory tests
    arguments: [patient_id, tests, priority, fasting_required]
  
  - name: view_lab_results
    description: Access lab results
    arguments: [patient_id, test_id, date_range]
  
  - name: send_patient_message
    description: Send message to patient
    arguments: [patient_id, message, channel, include_phi]
  
  - name: export_records
    description: Export patient records
    arguments: [patient_ids, format, destination, include_sensitive, purpose]
  
  - name: access_billing
    description: Access billing information
    arguments: [patient_id, claim_id, action]
  
  - name: query_population_health
    description: Run population health queries
    arguments: [query, filters, include_identifiers, limit]
```

---

## Rules Library for Healthcare

### Critical Severity Rules (HIPAA/PHI)

```yaml
- id: block-phi-without-encounter
  name: Block PHI access without active encounter
  enabled: true
  severity: critical
  action: block
  tools: [get_patient_record, view_lab_results]
  conditions:
    - field: arguments.encounter_id
      operator: equals
      value: null
    - field: arguments.purpose
      operator: not_in
      value: ["emergency", "treatment", "payment", "operations"]

- id: block-sensitive-fields-no-consent
  name: Block access to sensitive fields without consent
  enabled: true
  severity: critical
  action: block
  tools: [get_patient_record]
  conditions:
    - field: arguments.fields
      operator: contains
      value: "mental_health"
  condition_groups:
    - - field: arguments.fields
        operator: contains
        value: "mental_health"
    - - field: arguments.fields
        operator: contains
        value: "hiv_status"
    - - field: arguments.fields
        operator: contains
        value: "substance_abuse"
    - - field: arguments.fields
        operator: contains
        value: "genetic_data"

- id: block-controlled-substance-no-dea
  name: Block controlled substance without DEA verification
  enabled: true
  severity: critical
  action: block
  tools: [prescribe_medication]
  conditions:
    - field: arguments.controlled_substance
      operator: equals
      value: true
    - field: arguments.dea_verified
      operator: not_equals
      value: true

- id: block-bulk-record-export
  name: Block bulk patient record export
  enabled: true
  severity: critical
  action: block
  tools: [export_records]
  conditions:
    - field: arguments.patient_ids
      operator: greater_than
      value: 10

- id: block-audit-bypass
  name: Block attempts to bypass audit trail
  enabled: true
  severity: critical
  action: block
  tools: [update_patient_record]
  conditions:
    - field: arguments.audit_bypass
      operator: equals
      value: true

- id: block-phi-in-message
  name: Block PHI in patient messages
  enabled: true
  severity: critical
  action: block
  tools: [send_patient_message]
  conditions:
    - field: arguments.include_phi
      operator: equals
      value: true
    - field: arguments.channel
      operator: not_equals
      value: "secure_portal"

- id: block-identifiable-population-query
  name: Block population queries with identifiers
  enabled: true
  severity: critical
  action: block
  tools: [query_population_health]
  conditions:
    - field: arguments.include_identifiers
      operator: equals
      value: true
    - field: arguments.limit
      operator: less_than
      value: 100

- id: block-record-export-external
  name: Block record export to external destination
  enabled: true
  severity: critical
  action: block
  tools: [export_records]
  conditions:
    - field: arguments.destination
      operator: not_starts_with
      value: "internal://"
    - field: arguments.purpose
      operator: not_equals
      value: "patient_requested_transfer"
```

### High Severity Rules

```yaml
- id: block-access-outside-care-team
  name: Block access outside care team
  enabled: true
  severity: high
  action: block
  tools: [get_patient_record, update_patient_record]
  conditions:
    - field: arguments.requesting_provider
      operator: not_in
      value: ["CARE_TEAM"]

- id: block-high-quantity-controlled
  name: Block high quantity controlled substances
  enabled: true
  severity: high
  action: block
  tools: [prescribe_medication]
  conditions:
    - field: arguments.controlled_substance
      operator: equals
      value: true
    - field: arguments.quantity
      operator: greater_than
      value: 90

- id: block-sensitive-export
  name: Block export with sensitive data
  enabled: true
  severity: high
  action: block
  tools: [export_records]
  conditions:
    - field: arguments.include_sensitive
      operator: equals
      value: true
    - field: arguments.purpose
      operator: not_in
      value: ["legal_request", "patient_requested"]

- id: warn-after-hours-access
  name: Warn on after-hours PHI access
  enabled: true
  severity: high
  action: block
  tools: [get_patient_record]
  conditions:
    - field: context.time_of_day
      operator: not_in
      value: ["business_hours"]
    - field: arguments.purpose
      operator: not_equals
      value: "emergency"
```

### Medium Severity Rules

```yaml
- id: require-fasting-notation
  name: Require fasting notation for glucose tests
  enabled: true
  severity: medium
  action: block
  tools: [order_lab_test]
  conditions:
    - field: arguments.tests
      operator: contains
      value: "glucose"
    - field: arguments.fasting_required
      operator: equals
      value: null

- id: limit-message-frequency
  name: Limit patient message frequency
  enabled: true
  severity: medium
  action: block
  tools: [send_patient_message]
  conditions:
    - field: context.messages_today
      operator: greater_than
      value: 5
```

---

## Example Templates

### BLOCK - PHI Access Without Encounter

```
TOOL CALL:
tool: get_patient_record
arguments:
  patient_id: PT-789456
  fields: ["diagnosis", "medications", "allergies"]
  purpose: "curiosity"
  encounter_id: null
  requesting_provider: DR-123

RULES:
- id: block-phi-without-encounter
  name: Block PHI access without active encounter
  enabled: true
  severity: critical
  action: block
  tools: [get_patient_record]
  conditions:
    - field: arguments.encounter_id
      operator: equals
      value: null
    - field: arguments.purpose
      operator: not_in
      value: ["emergency", "treatment", "payment", "operations"]
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "PHI access without active encounter_id and purpose 'curiosity' not in permitted list. HIPAA minimum necessary violated.", "matched_rules": ["block-phi-without-encounter"]}
```

---

### BLOCK - Controlled Substance Without DEA

```
TOOL CALL:
tool: prescribe_medication
arguments:
  patient_id: PT-123456
  medication: "Oxycodone 10mg"
  dosage: "1 tablet every 6 hours"
  quantity: 60
  refills: 0
  controlled_substance: true
  dea_verified: false

RULES:
- id: block-controlled-no-dea
  name: Block controlled substance without DEA
  enabled: true
  severity: critical
  action: block
  tools: [prescribe_medication]
  conditions:
    - field: arguments.controlled_substance
      operator: equals
      value: true
    - field: arguments.dea_verified
      operator: not_equals
      value: true
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Controlled substance Oxycodone requires DEA verification. dea_verified=false violates prescribing requirements.", "matched_rules": ["block-controlled-no-dea"]}
```

---

### BLOCK - Bulk Record Export

```
TOOL CALL:
tool: export_records
arguments:
  patient_ids: ["PT-001", "PT-002", "PT-003", "PT-004", "PT-005", "PT-006", "PT-007", "PT-008", "PT-009", "PT-010", "PT-011", "PT-012"]
  format: "csv"
  destination: "external://research-partner.com"
  include_sensitive: true
  purpose: "research"

RULES:
- id: block-bulk-export
  name: Block bulk record export
  enabled: true
  severity: critical
  action: block
  tools: [export_records]
  conditions:
    - field: arguments.patient_ids
      operator: greater_than
      value: 10
```

**Output:**
```json
{"pass_weight": 0.01, "block_weight": 0.99, "decision": "block", "reasoning": "Bulk export of 12 patient records exceeds limit of 10. Requires IRB approval and data use agreement.", "matched_rules": ["block-bulk-export"]}
```

---

### PASS - Valid Encounter Access

```
TOOL CALL:
tool: get_patient_record
arguments:
  patient_id: PT-555123
  fields: ["vitals", "medications", "allergies"]
  purpose: "treatment"
  encounter_id: ENC-2024-001234
  requesting_provider: DR-456

RULES:
- id: block-phi-without-encounter
  name: Block PHI access without active encounter
  enabled: true
  severity: critical
  action: block
  tools: [get_patient_record]
  conditions:
    - field: arguments.encounter_id
      operator: equals
      value: null
```

**Output:**
```json
{"pass_weight": 0.95, "block_weight": 0.05, "decision": "pass", "reasoning": "Valid encounter ENC-2024-001234 with treatment purpose. PHI access permitted."}
```

---

### PASS - Standard Prescription

```
TOOL CALL:
tool: prescribe_medication
arguments:
  patient_id: PT-789012
  medication: "Amoxicillin 500mg"
  dosage: "1 capsule 3 times daily"
  quantity: 21
  refills: 0
  controlled_substance: false
  dea_verified: false

RULES:
- id: block-controlled-no-dea
  name: Block controlled substance without DEA
  enabled: true
  severity: critical
  action: block
  tools: [prescribe_medication]
  conditions:
    - field: arguments.controlled_substance
      operator: equals
      value: true
    - field: arguments.dea_verified
      operator: not_equals
      value: true
```

**Output:**
```json
{"pass_weight": 0.96, "block_weight": 0.04, "decision": "pass", "reasoning": "Amoxicillin is not a controlled substance. Standard antibiotic prescription allowed."}
```

---

### Edge Case - Emergency Override

```
TOOL CALL:
tool: get_patient_record
arguments:
  patient_id: PT-UNKNOWN
  fields: ["allergies", "medications", "blood_type"]
  purpose: "emergency"
  encounter_id: null
  requesting_provider: DR-ER-001

RULES:
- id: block-phi-without-encounter
  name: Block PHI access without active encounter
  enabled: true
  severity: critical
  action: block
  tools: [get_patient_record]
  conditions:
    - field: arguments.encounter_id
      operator: equals
      value: null
    - field: arguments.purpose
      operator: not_in
      value: ["emergency", "treatment", "payment", "operations"]
```

**Output:**
```json
{"pass_weight": 0.88, "block_weight": 0.12, "decision": "pass", "reasoning": "Emergency purpose overrides encounter requirement. Break-the-glass access logged."}
```

---

## Scenario Distribution

### `health_block.jsonl` (1000 examples):

- 160x PHI access without encounter
- 140x sensitive fields (mental_health, hiv_status, substance_abuse)
- 140x controlled substance without DEA
- 120x bulk record export
- 100x audit bypass attempts
- 100x PHI in unsecure messages
- 80x identifiable population queries
- 80x external record export
- 80x access outside care team

### `health_pass.jsonl` (1000 examples):

- 200x valid encounter-based access
- 160x standard (non-controlled) prescriptions
- 140x routine lab orders
- 120x secure portal messages
- 120x appointment scheduling
- 100x billing access with proper authorization
- 80x de-identified population queries
- 80x patient-requested exports

### `health_edge.jsonl` (500 examples):

- 100x emergency override scenarios
- 80x care team edge cases
- 80x controlled substance at exactly limit
- 80x export with 10 patients (at limit)
- 80x disabled HIPAA rules
- 80x sensitive field with proper consent flag

---

## Validation Checklist

- [ ] 2,500 examples total (1000 + 1000 + 500)
- [ ] HIPAA-relevant terminology used correctly
- [ ] PHI fields properly identified
- [ ] Controlled substance rules accurate
- [ ] Emergency override scenarios included
- [ ] All JSON valid with proper weights
