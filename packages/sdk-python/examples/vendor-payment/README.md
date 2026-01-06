# Vendor Payment Agent Example

Automated vendor invoice processing with Veto guardrails enforcing approval workflows.

## Use Case

Accounts Payable teams use AI agents to process vendor payments. Without guardrails, agents could:
- Pay unverified or suspended vendors
- Process duplicate payments
- Exceed spending authority limits

Veto validates every payment against approval workflows and vendor status.

## Features Demonstrated

- **Approval workflows** — Multi-tier approval based on amount
- **Vendor verification** — Blocks payments to unverified vendors
- **Spend authority** — Enforces per-user payment limits

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add your GEMINI_API_KEY
python vendor_payment_agent.py
```

## Veto Rules

See `veto/rules/vendors.yaml`:
- Blocks payments >$25,000 without director approval
- Blocks payments to suspended vendors
- Requires three-way matching for large payments
