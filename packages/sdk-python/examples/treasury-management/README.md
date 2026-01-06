# Treasury Management Agent Example

Cash flow monitoring agent with Veto guardrails alerting on unusual movements.

## Use Case

Finance teams use AI agents to monitor treasury operations. Without guardrails, agents could:
- Move funds without proper authorization
- Miss alerts on suspicious large transfers
- Access restricted financial accounts

Veto validates every treasury action and ensures proper oversight.

## Features Demonstrated

- **Transfer limits** — Blocks large transfers without approval
- **Unusual activity alerts** — Flags anomalies for review
- **Account restrictions** — Enforces access controls per account type

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add your GEMINI_API_KEY
python treasury_agent.py
```

## Veto Rules

See `veto/rules/treasury.yaml`:
- Blocks transfers >$100,000 without CFO approval
- Flags unusual activity patterns
- Restricts access to reserve accounts
