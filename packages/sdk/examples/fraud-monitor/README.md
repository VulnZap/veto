# Fraud Monitor Example

Transaction monitoring system using Veto's **LOG mode** for audit trails without blocking.

## Use Case

Financial compliance teams need to monitor transactions for suspicious patterns. Rather than blocking (which could disrupt business), they want to:
- Log all transaction operations for audit
- Flag suspicious patterns for human review
- Generate reports on unusual activity

Veto's LOG mode provides visibility into every tool call without interrupting operations.

## Features Demonstrated

- **LOG mode** — Observes all calls without blocking
- **Audit trails** — Complete record of agent actions
- **Risk scoring** — Flags high-value or unusual patterns

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

## Veto Configuration

See `veto/veto.config.yaml` — note `mode: "log"` setting.

All tool calls are logged but never blocked, creating a complete audit trail for compliance review.
