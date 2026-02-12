---
"veto-sdk": minor
---

Add require_approval flow with human-in-the-loop approval for tool calls

**Cloud validation mode** -- New `cloud` validation mode routes tool calls through the Veto Cloud API for policy-managed validation. Supports `allow`, `deny`, and `require_approval` decisions.

**Approval polling** -- When the cloud returns `require_approval`, the SDK automatically polls `GET /v1/approvals/:id` until a human approves or denies the call (or timeout). Configurable poll interval and timeout via config YAML or init options.

**Approval preference cache** -- `setApprovalPreference(toolName, 'approve_all' | 'deny_all')` lets integrators cache a per-tool preference that skips server polling on subsequent calls. Clear with `clearApprovalPreferences()`.

**onApprovalRequired hook** -- Fires when a tool call needs human review, enabling integrators (e.g. Sidekick) to present approve/deny UI. Receives full `ValidationContext` and `approvalId`.

**VetoCloudClient** -- New standalone client with `validate()`, `pollApproval()`, `registerTools()`, retry logic, and typed `ApprovalTimeoutError`.

**Python SDK parity** -- All features above are implemented identically in the Python SDK (`veto` on PyPI), including typed `ApprovalData`, `ApprovalPollOptions`, `ApprovalTimeoutError`, and the same hook/preference APIs.
