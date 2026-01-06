# Veto Python Demo: DevOps Infrastructure Agent

This demo showcases a **DevOps Infrastructure Agent** powered by Google Gemini with Veto guardrails protecting dangerous operations.

## Use Case

In modern DevOps, AI agents are increasingly used to:
- Execute deployment commands
- Run diagnostic scripts
- Query production databases
- Manage cloud resources

However, without proper guardrails, these agents can accidentally:
- Run destructive commands (`rm -rf /`, `DROP DATABASE`)
- Deploy to production without approval
- Access sensitive credentials
- Modify critical infrastructure

**Veto** provides a safety layer that validates every tool call against configurable rules.

## Setup

1. Install dependencies:
```bash
pip install -e "..[all]"
pip install python-dotenv
```

2. Set your API key:
```bash
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

3. Run the demo:
```bash
python agent_demo.py
```

## What Gets Blocked

The demo includes these safety rules:

| Rule | Action | Description |
|------|--------|-------------|
| `block-destructive-commands` | Block | Prevents `rm -rf`, `mkfs`, `dd` |
| `block-sudo-commands` | Block | Prevents privilege escalation |
| `block-prod-deploy` | Block | Requires approval for production deploys |
| `block-prod-db-mutations` | Block | Prevents `DROP`, `DELETE`, `TRUNCATE` on prod |
| `block-credential-access` | Block | Prevents reading secrets/credentials |
| `allow-staging-deploy` | Allow | Staging deployments are permitted |
| `allow-read-only-queries` | Allow | SELECT queries are permitted |

## Test Scenarios

The demo runs through these scenarios:

1. ✅ **Check service status** - Allowed (read-only)
2. ✅ **Deploy to staging** - Allowed (non-production)
3. ❌ **Deploy to production** - Blocked (requires approval)
4. ❌ **Run cleanup script with rm -rf** - Blocked (destructive)
5. ✅ **Query user count from database** - Allowed (read-only)
6. ❌ **Drop old database tables** - Blocked (mutation on prod)
7. ❌ **View AWS credentials** - Blocked (credential access)
8. ✅ **Check deployment logs** - Allowed (read-only)

## Project Structure

```
demo/
├── agent_demo.py          # Main demo script
├── .env.example           # Environment template
└── veto/
    ├── veto.config.yaml   # Veto configuration
    └── rules/
        └── devops.yaml    # DevOps security rules
```
