# Demo Video Recording Runbook

Step-by-step guide for recording the Veto investor demo walkthrough.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Terminal with dark background (the demo uses ANSI colors)
- Screen recording software (OBS, QuickTime, or similar)
- Terminal font: 14-16pt, monospace (JetBrains Mono recommended)

## Pre-recording Setup

1. **Verify the demo runs cleanly:**

   ```bash
   cd demo
   pnpm install
   pnpm demo
   ```

   Confirm output ends with "ALL SCENARIOS PASSED".

2. **Set terminal window size:**
   - Width: 120 columns minimum
   - Height: 40 rows minimum
   - This prevents line wrapping in the output

3. **Clear terminal history:**
   ```bash
   clear
   ```

## Recording Script

### Intro (show terminal, not code)

Start recording. Run:

```bash
pnpm demo
```

**Talking point:** "This is Veto -- the permission layer for AI agents. We sit between the agent and its tools, intercepting every call. The agent doesn't know we're here."

### Scenario 1: Email Guard (~30s)

The output will show EmailAgent making 5 calls:

- **Call 1** (ALLOWED): Internal email to team@acme-corp.com
- **Call 2** (DENIED): External email to vendor@external-supplier.com
- **Call 3** (DENIED): Email containing a password
- **Call 4** (ALLOWED): Web search (not email, so no email policy applies)
- **Call 5** (ALLOWED): Internal email to engineering@acme-corp.internal

**Talking points:**

- "The agent tries to email an external vendor. Veto blocks it -- only internal domains are allowed."
- "The agent tries to send credentials. Veto catches the sensitive content and blocks it."
- "Safe calls go through instantly. The agent doesn't experience any latency."

### Scenario 2: Browser Guard (~30s)

The output will show BrowserAgent making 8 calls:

- Navigations to approved sites: ALLOWED
- Navigation to phishing site: DENIED
- JavaScript URL injection: DENIED
- Normal form fill: ALLOWED
- XSS form injection: DENIED
- Shell command escape: DENIED
- Button click: ALLOWED

**Talking points:**

- "The browser agent gets redirected to a phishing site. Veto blocks it."
- "The page tries prompt injection -- telling the agent to execute JavaScript. Blocked."
- "The agent tries to break out of its sandbox by running a curl command. Blocked."

### Scenario 3: Multi-Agent (~45s)

Three agents run in sequence with different permission scopes:

- ResearchAgent: can search and write files, cannot email
- FinanceAgent: can pay and email, cannot deploy
- DevOpsAgent: can deploy and write files, cannot pay

**Talking points:**

- "Each agent has a different permission scope. The research agent can't send emails."
- "The finance agent tries a $12,000 payment. Veto blocks it -- our policy caps at $500."
- "The finance agent tries to run kubectl. That's a DevOps tool, not finance. Blocked."
- "The DevOps agent tries to write to /etc/. Veto protects system paths."

### Closing

Point to the summary: "ALL SCENARIOS PASSED"

**Talking point:** "Every run is deterministic. Same input, same output. 24 tool calls, 10 blocked, all matching expected results. This is Veto."

## Post-recording

1. Trim the video to remove setup/cleanup
2. Target length: 2-3 minutes total
3. Export at 1080p minimum

## Running Individual Scenarios

If you want to record scenarios separately:

```bash
pnpm demo:email        # Scenario 01 only
pnpm demo:browser      # Scenario 02 only
pnpm demo:multi-agent  # Scenario 03 only
```
