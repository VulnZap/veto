# Compliance Reporting Agent Example

Regulatory compliance reporting with Veto guardrails controlling data exports and sensitive operations.

## Use Case

Compliance teams use AI agents to generate regulatory reports. Without guardrails, agents could:
- Export PII data without authorization
- Generate reports with incomplete audit trails
- Access restricted data classifications

Veto validates every data access and export operation.

## Features Demonstrated

- **Data export controls** — Blocks unauthorized PII exports
- **Audit logging** — Tracks all compliance report generation
- **Classification enforcement** — Restricts access by data sensitivity

## Setup

```bash
npm install
cp .env.example .env  # Add your GEMINI_API_KEY
npm start
```

## Veto Rules

See `veto/rules/compliance.yaml`:
- Blocks PII exports without approval
- Requires audit trail for all reports
- Restricts access to classified data
