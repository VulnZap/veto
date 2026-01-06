# Sales Dispute Agent Example

Automated refund and dispute handling system with Veto guardrails for conditional business rules.

## Use Case

E-commerce companies use AI agents to handle customer disputes. Without guardrails, agents could:
- Process refunds exceeding order values
- Approve refunds outside eligible time windows
- Skip fraud checks on suspicious requests

Veto enforces business policies while allowing legitimate refunds.

## Features Demonstrated

- **Strict mode** — Blocks policy-violating refunds
- **Conditional rules** — Amount limits, time windows
- **Escalation** — Routes edge cases to humans

## Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your GEMINI_API_KEY
```

4. Run the agent:
```bash
python sales_dispute_agent.py
```

## Veto Rules

See `veto/rules/refunds.yaml` for the guardrail rules:
- Blocks refunds exceeding order value
- Blocks refunds after 30-day window
- Escalates high-value disputes automatically
