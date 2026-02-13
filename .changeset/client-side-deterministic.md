---
"veto-sdk": minor
---

Add client-side deterministic validation with cloud policy sync

**Local deterministic validation** -- SDK now evaluates deterministic constraints locally before falling back to the server, eliminating network round-trips for simple checks (number ranges, string enums, regex patterns, required fields).

**Policy cache with stale-while-revalidate** -- Policies fetched from the cloud are cached locally with configurable freshness and max-age windows. Stale policies serve immediately while a background refresh runs, ensuring zero-latency validation on cache hits.

**Client-side decision logging** -- Validation decisions made locally are logged back to the server via fire-and-forget POST to `/v1/decisions`, keeping the dashboard audit trail complete without blocking the agent.

**Python SDK parity** -- All features above are implemented identically in the Python SDK (`veto` on PyPI), including `PolicyCache` with background refresh, `VetoCloudClient.log_decision()`, and `VetoCloudClient.fetch_policy()`.
