#!/usr/bin/env bash
set -euo pipefail

# Collect launch readiness metrics from the veto-sdk monorepo.
# Run from the repo root: bash scripts/launch-metrics.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK_DIR="$REPO_ROOT/packages/sdk"
PYTHON_DIR="$REPO_ROOT/packages/sdk-python"

echo "=== Veto Launch Metrics ($(date -u +%Y-%m-%dT%H:%M:%SZ)) ==="
echo ""

# --- TS SDK Tests ---
echo "--- TS SDK Tests ---"
cd "$REPO_ROOT"
TEST_OUTPUT=$(pnpm test 2>&1) || true
TESTS_PASSED=$(echo "$TEST_OUTPUT" | grep "^.*Tests " | grep -oE '[0-9]+ passed' || echo "0 passed")
TEST_FILES=$(echo "$TEST_OUTPUT" | grep "Test Files" | grep -oE '[0-9]+ passed' || echo "0 passed")
echo "Tests: $TESTS_PASSED | Files: $TEST_FILES"

# --- TS SDK Build Size ---
echo ""
echo "--- TS SDK Build Size ---"
if [ -d "$SDK_DIR/dist" ]; then
  BUILD_SIZE=$(du -sh "$SDK_DIR/dist" | cut -f1)
  FILE_COUNT=$(find "$SDK_DIR/dist" -type f | wc -l | tr -d ' ')
  echo "Build output: $BUILD_SIZE ($FILE_COUNT files)"
else
  echo "Build output: not built (run pnpm build first)"
fi

# --- TypeScript Strict Compliance ---
echo ""
echo "--- TypeScript Strict Compliance ---"
if [ -f "$SDK_DIR/tsconfig.json" ]; then
  STRICT=$(python3 - "$SDK_DIR/tsconfig.json" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
co = d.get("compilerOptions", {})
flags = ["strict", "noImplicitAny", "noImplicitReturns", "noUnusedLocals", "noUnusedParameters"]
for flag in flags:
    val = co.get(flag, "not set")
    print(f"  {flag}: {val}")
PYEOF
  )
  echo "$STRICT"
else
  echo "  tsconfig.json not found"
fi

# --- Dependency Count ---
echo ""
echo "--- Dependencies ---"
if [ -f "$SDK_DIR/package.json" ]; then
  python3 - "$SDK_DIR/package.json" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
deps = d.get("dependencies", {})
dev = d.get("devDependencies", {})
names = ", ".join(deps.keys()) if deps else "none"
print(f"TS SDK runtime: {len(deps)} ({names})")
print(f"TS SDK devDeps: {len(dev)}")
PYEOF
fi
if [ -f "$PYTHON_DIR/pyproject.toml" ]; then
  python3 - "$PYTHON_DIR/pyproject.toml" <<'PYEOF'
import tomllib, sys
with open(sys.argv[1], "rb") as f:
    d = tomllib.load(f)
deps = d.get("project", {}).get("dependencies", [])
names = ", ".join(deps)
print(f"Python SDK runtime: {len(deps)} ({names})")
PYEOF
fi

# --- Source Lines ---
echo ""
echo "--- Source Lines ---"
if [ -d "$SDK_DIR/src" ]; then
  TS_LINES=$(find "$SDK_DIR/src" -name "*.ts" -not -name "*.test.ts" -not -name "*.spec.ts" | xargs wc -l 2>/dev/null | tail -1 | tr -d ' ' | cut -d't' -f1)
  TS_FILES=$(find "$SDK_DIR/src" -name "*.ts" -not -name "*.test.ts" -not -name "*.spec.ts" | wc -l | tr -d ' ')
  echo "TS SDK: $TS_LINES lines across $TS_FILES files"
fi
if [ -d "$PYTHON_DIR/veto" ]; then
  PY_LINES=$(find "$PYTHON_DIR/veto" -name "*.py" | xargs wc -l 2>/dev/null | tail -1 | tr -d ' ' | cut -d't' -f1)
  PY_FILES=$(find "$PYTHON_DIR/veto" -name "*.py" | wc -l | tr -d ' ')
  echo "Python SDK: $PY_LINES lines across $PY_FILES files"
fi

# --- Open Issues by Priority ---
echo ""
echo "--- Open Issues by Priority ---"
if command -v gh &> /dev/null; then
  P0=$(gh issue list --repo VulnZap/veto --label P0 --state open --json number --jq 'length' 2>/dev/null || echo "?")
  P1=$(gh issue list --repo VulnZap/veto --label P1 --state open --json number --jq 'length' 2>/dev/null || echo "?")
  P2=$(gh issue list --repo VulnZap/veto --label P2 --state open --json number --jq 'length' 2>/dev/null || echo "?")
  TOTAL=$(gh issue list --repo VulnZap/veto --state open --json number --jq 'length' 2>/dev/null || echo "?")
  echo "P0: $P0 | P1: $P1 | P2: $P2 | Total open: $TOTAL"
else
  echo "gh CLI not available"
fi

echo ""
echo "=== End Metrics ==="
