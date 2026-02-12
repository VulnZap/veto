# veto-sdk

## 1.3.0

### Minor Changes

- [#53](https://github.com/VulnZap/veto/pull/53) [`7dc81c5`](https://github.com/VulnZap/veto/commit/7dc81c54aa544582ced4add8d651c2ffea3a16d3) Thanks [@yazcaleb](https://github.com/yazcaleb)! - Add require_approval flow with human-in-the-loop approval for tool calls

  **Cloud validation mode** -- New `cloud` validation mode routes tool calls through the Veto Cloud API for policy-managed validation. Supports `allow`, `deny`, and `require_approval` decisions.

  **Approval polling** -- When the cloud returns `require_approval`, the SDK automatically polls `GET /v1/approvals/:id` until a human approves or denies the call (or timeout). Configurable poll interval and timeout via config YAML or init options.

  **Approval preference cache** -- `setApprovalPreference(toolName, 'approve_all' | 'deny_all')` lets integrators cache a per-tool preference that skips server polling on subsequent calls. Clear with `clearApprovalPreferences()`.

  **onApprovalRequired hook** -- Fires when a tool call needs human review, enabling integrators (e.g. Sidekick) to present approve/deny UI. Receives full `ValidationContext` and `approvalId`.

  **VetoCloudClient** -- New standalone client with `validate()`, `pollApproval()`, `registerTools()`, retry logic, and typed `ApprovalTimeoutError`.

  **Python SDK parity** -- All features above are implemented identically in the Python SDK (`veto` on PyPI), including typed `ApprovalData`, `ApprovalPollOptions`, `ApprovalTimeoutError`, and the same hook/preference APIs.

- [#7](https://github.com/VulnZap/veto/pull/7) [`c90063d`](https://github.com/VulnZap/veto/commit/c90063d23460cee131cf3e4a4c57b18bf644445a) Thanks [@anirudhp26](https://github.com/anirudhp26)! - added browser-use plugin
