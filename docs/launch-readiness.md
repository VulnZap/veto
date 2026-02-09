# YC Launch Readiness

Last updated: 2026-02-09

## Roadmap

| Issue | Title                                       | Priority | Status | Owner | PR  |
| ----- | ------------------------------------------- | -------- | ------ | ----- | --- |
| #21   | AST-based Policy Compiler                   | P0       | Open   | -     | -   |
| #22   | WASM Decision Engine                        | P0       | Open   | -     | -   |
| #23   | Browser-Native Prompt Injection Defense     | P0       | Open   | -     | -   |
| #31   | Browser Agent Partnership Bundle            | P0       | Open   | -     | -   |
| #11   | TS SDK cloud contract unification           | P0       | Open   | -     | -   |
| #12   | Policy IR v1 schema                         | P0       | Open   | -     | -   |
| #13   | Deterministic constraint engine v2          | P1       | Open   | -     | -   |
| #14   | Require approval workflow                   | P1       | Open   | -     | -   |
| #15   | Signed policy bundles                       | P1       | Open   | -     | -   |
| #24   | Natural Language Policy Generator           | P1       | Open   | -     | -   |
| #25   | Risk-Trailed Enforcement                    | P1       | Open   | -     | -   |
| #26   | Universal Controls (CLI/API/CI/CD)          | P1       | Open   | -     | -   |
| #27   | Decision Explainability Engine              | P1       | Open   | -     | -   |
| #28   | Policy Template Library                     | P1       | Open   | -     | -   |
| #30   | Multi-Tenant Policy Isolation               | P1       | Open   | -     | -   |
| #16   | Cross-language golden conformance suite     | P2       | Open   | -     | -   |
| #18   | Validation deadline budget, circuit breaker | P2       | Open   | -     | -   |
| #29   | Tamper-Proof Audit Export                   | P2       | Open   | -     | -   |
| #6    | Investor demo                               | -        | Open   | -     | -   |

## Metrics Dashboard

Run `scripts/launch-metrics.sh` to collect current values.

| Metric                        | Target  | Current (2026-02-09)                                            | Source                      |
| ----------------------------- | ------- | --------------------------------------------------------------- | --------------------------- |
| TS SDK tests                  | -       | 118 pass, 0 fail (8 files)                                      | `pnpm test`                 |
| TS SDK line coverage          | 90%     | 34.1%                                                           | `vitest --coverage`         |
| TS SDK build size             | -       | 940 KB (176 files)                                              | `du -sh packages/sdk/dist/` |
| TS strict mode                | Yes     | Yes (strict, noImplicitAny, noUnusedLocals, noUnusedParameters) | `tsconfig.json`             |
| Runtime dependencies (TS)     | Minimal | 1 (`yaml`)                                                      | `package.json`              |
| Runtime dependencies (Python) | Minimal | 2 (`pyyaml`, `aiohttp`)                                         | `pyproject.toml`            |
| Source lines (TS SDK)         | -       | 8,167                                                           | `wc -l src/**/*.ts`         |
| Decision latency              | <1ms    | ~50ms (no WASM yet)                                             | Issue #22 target            |
| Policy templates              | 50+     | 0                                                               | Issue #28                   |
| GitHub stars                  | 1,000+  | ~50                                                             | GitHub                      |
| NPM downloads/week            | 500+    | 0                                                               | npm                         |

## Demo Readiness Checklist

- [ ] AST compiler passes all 118 existing tests (Issue #21)
- [ ] WASM engine achieves <1ms decision latency (Issue #22)
- [ ] Browser prompt injection defense blocks known attack vectors (Issue #23)
- [ ] Live demo script tested end-to-end: agent visits malicious site, Veto blocks
- [ ] Live demo script tested end-to-end: agent attempts $1M transfer, Veto requires approval
- [ ] Natural language policy generation works in <3s (Issue #24)
- [ ] 50+ policy templates available (Issue #28)
- [ ] browser-use integration working (Issue #31)
- [ ] Demo Day deck finalized (2-minute narrative)
- [ ] 3+ case studies with paying customers

## Weekly Status Template

```
## Week of YYYY-MM-DD

### Completed
- (list merged PRs and closed issues)

### In Progress
- (list active PRs and issues with owners)

### Blockers
- (list blocking issues with mitigation plan)

### Metrics
Run `scripts/launch-metrics.sh` and paste output.
```
