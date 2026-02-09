# Veto Investor Demo

Scripted demo scenarios showing Veto intercepting AI agent tool calls in real time.
All outputs are deterministic -- no external APIs, no LLM calls, no network dependencies.

## Quick Start

```bash
cd demo
pnpm install
pnpm demo
```

## Scenarios

### 01 - Email Guard

An AI agent sends emails on behalf of a user. Veto enforces:

- **Domain allowlist**: only `@acme-corp.com` and `@acme-corp.internal` recipients
- **Content scanning**: blocks emails containing passwords, SSNs, credentials

The agent attempts 5 calls. 2 are blocked (external recipient, sensitive content), 3 pass.

```bash
pnpm demo:email
```

### 02 - Browser Guard

A browser automation agent navigates the web. Veto enforces:

- **URL allowlist**: only approved domains (acme-corp.com, google.com, github.com)
- **Scheme blocking**: blocks `javascript:`, `file://`, `data:` URLs
- **XSS prevention**: blocks form fills containing `<script>`, `onerror=`, etc.
- **Capability fence**: browser agent cannot run shell commands

The agent attempts 8 calls. 4 are blocked (phishing site, JS injection, XSS, shell escape), 4 pass.

```bash
pnpm demo:browser
```

### 03 - Multi-Agent Coordination

Three specialized agents operate with different permission scopes:

| Agent         | Allowed Tools                          | Blocked Example |
| ------------- | -------------------------------------- | --------------- |
| ResearchAgent | search_web, write_file, read_file      | send_email      |
| FinanceAgent  | submit_payment, read_file, send_email  | execute_command |
| DevOpsAgent   | read_file, write_file, execute_command | submit_payment  |

Additional policies:

- **Payment limit**: transactions above $500 require approval
- **Protected paths**: writes to `/etc/`, `/usr/`, `/sys/`, `/root/` are blocked

11 total calls across 3 agents. 4 are blocked, 7 pass.

```bash
pnpm demo:multi-agent
```

## How It Works

Each scenario:

1. Creates a `Veto` instance with programmatic validators (no external API needed)
2. Wraps mock tools using `veto.wrap(tools)` -- the same API used in production
3. Runs a simulated agent that makes a series of tool calls
4. Veto intercepts each call, evaluates policies, and allows or denies
5. Results are compared against `expected.json` for deterministic validation

The validators are pure functions -- same input always produces the same output.

## File Structure

```
demo/
  src/
    run-all.ts                           # Runs all scenarios
    lib/
      mock-agent.ts                      # Simulated AI agent
      mock-tools.ts                      # Simulated tools (email, browser, file, etc.)
      reporter.ts                        # Colored terminal output
    scenarios/
      01-email-guard/
        run.ts                           # Scenario script
        expected.json                    # Expected outputs
        veto/veto.config.yaml            # Veto config
      02-browser-guard/
        run.ts
        expected.json
        veto/veto.config.yaml
      03-multi-agent/
        run.ts
        expected.json
        veto/veto.config.yaml
  package.json
  tsconfig.json
  runbook.md                             # Video recording guide
```
