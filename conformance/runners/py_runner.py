"""
Conformance test runner for the Python SDK.

Loads shared YAML fixtures and validates that the Python ValidationEngine
produces identical decisions to the TypeScript SDK.
"""

import asyncio
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

# Add the Python SDK to path
SDK_ROOT = Path(__file__).resolve().parent.parent.parent / "packages" / "sdk-python"
sys.path.insert(0, str(SDK_ROOT))

from veto.core.validator import (
    ValidationEngine,
    ValidationEngineOptions,
    create_passthrough_validator,
    create_blocklist_validator,
    create_allowlist_validator,
)
from veto.types.config import (
    NamedValidator,
    ValidationContext,
    ValidationResult,
)
from veto.utils.logger import SilentLogger


FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def normalize_reason(reason: str) -> str:
    return re.sub(r"\s+", " ", reason).strip().lower()


def build_validator(config: dict[str, Any]) -> NamedValidator:
    vtype = config["type"]

    if vtype == "passthrough":
        v = create_passthrough_validator()
        if "priority" in config:
            v.priority = config["priority"]
        if "tool_filter" in config:
            v.tool_filter = config["tool_filter"]
        return v

    if vtype == "blocklist":
        v = create_blocklist_validator(
            config.get("tools", []),
            config.get("reason", "Tool is blocked"),
        )
        if "priority" in config:
            v.priority = config["priority"]
        return v

    if vtype == "allowlist":
        v = create_allowlist_validator(
            config.get("tools", []),
            config.get("reason", "Tool is not in allowlist"),
        )
        if "priority" in config:
            v.priority = config["priority"]
        return v

    if vtype == "custom_allow":
        reason = config.get("custom_reason", "Allowed")
        priority = config.get("priority", 100)
        return NamedValidator(
            name=f"custom_allow_{priority}",
            priority=priority,
            validate=lambda ctx, r=reason: ValidationResult(decision="allow", reason=r),
            tool_filter=config.get("tool_filter"),
        )

    if vtype == "custom_deny":
        reason = config.get("custom_reason", "Denied")
        priority = config.get("priority", 100)
        return NamedValidator(
            name=f"custom_deny_{priority}",
            priority=priority,
            validate=lambda ctx, r=reason: ValidationResult(decision="deny", reason=r),
            tool_filter=config.get("tool_filter"),
        )

    if vtype == "custom_throw":
        message = config.get("custom_reason", "Error")
        priority = config.get("priority", 100)

        def throw_validator(ctx: ValidationContext, msg: str = message) -> ValidationResult:
            raise Exception(msg)

        return NamedValidator(
            name=f"custom_throw_{priority}",
            priority=priority,
            validate=throw_validator,
            tool_filter=config.get("tool_filter"),
        )

    raise ValueError(f"Unknown validator type: {vtype}")


def build_context(input_data: dict[str, Any]) -> ValidationContext:
    return ValidationContext(
        tool_name=input_data["tool_name"],
        arguments=input_data.get("arguments") or {},
        call_id="conformance-test",
        timestamp=datetime.now(),
        call_history=[],
    )


async def run_case(case: dict[str, Any]) -> tuple[bool, str]:
    """Run a single test case. Returns (passed, message)."""
    engine = ValidationEngine(
        ValidationEngineOptions(
            logger=SilentLogger(),
            default_decision=case.get("default_decision", "allow"),
        )
    )

    for vc in case["validators"]:
        engine.add_validator(build_validator(vc))

    ctx = build_context(case["input"])
    result = await engine.validate(ctx)

    expected = case["expected"]
    errors: list[str] = []

    if result.final_result.decision != expected["decision"]:
        errors.append(
            f"decision: got {result.final_result.decision!r}, "
            f"expected {expected['decision']!r}"
        )

    if expected.get("reason_absent"):
        if result.final_result.reason is not None:
            errors.append(
                f"reason should be absent but got {result.final_result.reason!r}"
            )

    if "reason_contains" in expected:
        if result.final_result.reason is None:
            errors.append("reason is None but expected it to contain text")
        else:
            normalized = normalize_reason(result.final_result.reason)
            target = normalize_reason(expected["reason_contains"])
            if target not in normalized:
                errors.append(
                    f"reason {result.final_result.reason!r} does not contain "
                    f"{expected['reason_contains']!r}"
                )

    if "validator_count" in expected:
        actual_count = len(result.validator_results)
        if actual_count != expected["validator_count"]:
            errors.append(
                f"validator_count: got {actual_count}, "
                f"expected {expected['validator_count']}"
            )

    if errors:
        return False, "; ".join(errors)
    return True, "ok"


async def run_suite(filepath: Path) -> tuple[int, int, list[str]]:
    """Run all cases in a fixture file. Returns (passed, failed, failure_details)."""
    with open(filepath) as f:
        suite = yaml.safe_load(f)

    passed = 0
    failed = 0
    failures: list[str] = []

    for case in suite["cases"]:
        ok, msg = await run_case(case)
        if ok:
            passed += 1
        else:
            failed += 1
            failures.append(f"  FAIL {case['id']}: {msg}")

    return passed, failed, failures


async def main() -> int:
    fixture_files = sorted(FIXTURES_DIR.glob("*.yaml"))
    if not fixture_files:
        print(f"No fixture files found in {FIXTURES_DIR}")
        return 1

    total_passed = 0
    total_failed = 0
    all_failures: list[str] = []

    for filepath in fixture_files:
        passed, failed, failures = await run_suite(filepath)
        total_passed += passed
        total_failed += failed

        status = "PASS" if failed == 0 else "FAIL"
        print(f"  {status} {filepath.name} ({passed} passed, {failed} failed)")

        if failures:
            all_failures.extend(failures)

    print()
    print(f"Total: {total_passed} passed, {total_failed} failed")

    if all_failures:
        print()
        print("Failures:")
        for f in all_failures:
            print(f)
        return 1

    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
