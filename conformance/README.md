# Conformance Suite

Shared test fixtures and runners that verify the TypeScript and Python SDKs produce identical validation decisions for the same inputs.

## Structure

```
conformance/
  fixtures/          # Language-agnostic YAML test cases
  schema/            # JSON Schema for fixture format
  runners/
    ts-runner.ts     # TypeScript runner (vitest)
    py_runner.py     # Python runner (standalone)
```

## Running

### TypeScript

```bash
cd packages/sdk
npx vitest run ../../conformance/runners/ts-runner.ts
```

### Python

```bash
cd packages/sdk-python
python ../../conformance/runners/py_runner.py
```

## Fixture Format

Each YAML file contains a `suite` name and array of `cases`. Each case defines:

- **validators**: Array of validator configs to add to the engine
- **input**: Tool name and arguments
- **expected**: Decision, optional reason substring, validator count

Validator types: `passthrough`, `blocklist`, `allowlist`, `custom_allow`, `custom_deny`, `custom_throw`.

See `schema/fixture.schema.json` for the full specification.

## Reason Normalization

Reason comparison uses normalization: collapse whitespace, trim, lowercase. The `reason_contains` field checks for substring presence after normalization, allowing minor phrasing differences between SDKs.

## Adding Fixtures

1. Create a new YAML file in `fixtures/`
2. Follow the schema in `schema/fixture.schema.json`
3. Run both TS and Python runners to verify

## Prerequisites

### TypeScript

Requires the SDK to be built:

```bash
pnpm build
```

### Python

Requires the `veto` package to be installed and accessible to `python3`:

```bash
# Option A: Install in virtualenv
cd packages/sdk-python
python3 -m venv .venv && source .venv/bin/activate
pip install -e .

# Option B: Install globally/user
pip install -e packages/sdk-python
```

Then run from repo root:

```bash
pnpm conformance:ts   # TypeScript only
pnpm conformance:py   # Python only
pnpm conformance      # Both
```
