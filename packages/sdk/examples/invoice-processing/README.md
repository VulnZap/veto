# Invoice Processing Agent Example

Automated invoice validation and payment scheduling with Veto guardrails enforcing spend limits.

## Use Case

Accounts Payable teams use AI agents to process vendor invoices. Without guardrails, agents could:
- Approve invoices exceeding budget limits
- Pay duplicate invoices
- Schedule payments to unverified vendors

Veto validates every invoice action against configurable policies.

## Features Demonstrated

- **Spend limits** — Blocks invoices over budget thresholds
- **Vendor verification** — Requires approved vendor status
- **Duplicate detection** — Prevents double payments

## Setup

```bash
npm install
cp .env.example .env  # Add your GEMINI_API_KEY
npm start
```

## Veto Rules

See `veto/rules/invoices.yaml`:
- Blocks invoices >$10,000 without manager approval
- Blocks payments to unverified vendors
- Requires PO matching for large invoices
