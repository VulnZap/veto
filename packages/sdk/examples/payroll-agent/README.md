# Payroll Agent Example

Automated employee payout system with Veto guardrails protecting against unauthorized payments.

## Use Case

HR/Finance teams use AI agents to automate payroll operations. Without guardrails, these agents could:
- Process payments exceeding authorized limits
- Approve bonuses without manager authorization
- Pay terminated or inactive employees

Veto validates every payment against configurable rules before execution.

## Features Demonstrated

- **Strict mode** — Blocks unauthorized payments
- **Payment limits** — Enforces maximum amounts per payment type
- **Employee verification** — Checks status before processing

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your GEMINI_API_KEY
```

3. Run the agent:
```bash
npm start
```

## Veto Rules

See `veto/rules/payroll.yaml` for the guardrail rules:
- Blocks salary payments over $15,000
- Blocks bonuses over $5,000 without manager approval
- Blocks payments to terminated employees
