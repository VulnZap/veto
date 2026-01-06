# DevOps Pipeline Agent Example

CI/CD pipeline automation agent with Veto guardrails protecting production deployments.

## Use Case

DevOps teams use AI agents to automate infrastructure operations. Without guardrails, agents could:
- Deploy to production without approval
- Run destructive commands on servers
- Access sensitive credentials

Veto validates every operation against security policies.

## Features Demonstrated

- **Strict mode** — Blocks production deployments
- **Environment protection** — Staging allowed, production blocked
- **Safe rollbacks** — Always permitted for incident response

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
python devops_pipeline_agent.py
```

## Veto Rules

See `veto/rules/deployments.yaml`:
- Blocks production deployments
- Allows staging deployments
- Always allows rollback and monitoring operations
