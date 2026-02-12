import re
import time
from typing import Any

from veto.deterministic.types import (
    ArgumentConstraint,
    ConstraintCheckResult,
    LocalValidationResult,
    ValidationEntry,
)
from veto.deterministic.regex_safety import is_safe_pattern


def validate_deterministic(
    tool_name: str,
    args: dict[str, Any],
    constraints: list[ArgumentConstraint],
) -> LocalValidationResult:
    start = time.monotonic()
    validations: list[ValidationEntry] = []

    for constraint in constraints:
        if not constraint.enabled:
            continue

        value = args.get(constraint.argument_name)

        if value is None:
            key_exists = constraint.argument_name in args

            if constraint.required and not key_exists:
                return LocalValidationResult(
                    decision="deny",
                    reason=f"Required argument '{constraint.argument_name}' is missing",
                    failed_argument=constraint.argument_name,
                    validations=validations,
                    latency_ms=_elapsed_ms(start),
                )
            if constraint.not_null and key_exists:
                return LocalValidationResult(
                    decision="deny",
                    reason=f"Argument '{constraint.argument_name}' cannot be null",
                    failed_argument=constraint.argument_name,
                    validations=validations,
                    latency_ms=_elapsed_ms(start),
                )
            continue

        result = _check_constraints(value, constraint)

        validations.append(
            ValidationEntry(
                argument=constraint.argument_name,
                status="pass" if result.passed else "fail",
                reason=result.reason,
            )
        )

        if not result.passed:
            return LocalValidationResult(
                decision="deny",
                reason=f"Argument '{constraint.argument_name}' failed: {result.reason}",
                failed_argument=constraint.argument_name,
                validations=validations,
                latency_ms=_elapsed_ms(start),
            )

    return LocalValidationResult(
        decision="allow",
        validations=validations,
        latency_ms=_elapsed_ms(start),
    )


def _elapsed_ms(start: float) -> float:
    return (time.monotonic() - start) * 1000


def _check_constraints(value: Any, constraint: ArgumentConstraint) -> ConstraintCheckResult:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return _check_number_constraints(value, constraint)
    if isinstance(value, str):
        return _check_string_constraints(value, constraint)
    if isinstance(value, list):
        return _check_array_constraints(value, constraint)
    return ConstraintCheckResult(passed=True)


def _check_number_constraints(
    value: float, constraint: ArgumentConstraint
) -> ConstraintCheckResult:
    import math

    if math.isnan(value):
        return ConstraintCheckResult(passed=False, reason="value is NaN")

    if math.isinf(value):
        return ConstraintCheckResult(
            passed=False, reason=f"value {value} is not finite"
        )

    if constraint.greater_than is not None and value <= constraint.greater_than:
        return ConstraintCheckResult(
            passed=False,
            reason=f"value {value} must be greater than {constraint.greater_than}",
        )
    if constraint.less_than is not None and value >= constraint.less_than:
        return ConstraintCheckResult(
            passed=False,
            reason=f"value {value} must be less than {constraint.less_than}",
        )
    if constraint.greater_than_or_equal is not None and value < constraint.greater_than_or_equal:
        return ConstraintCheckResult(
            passed=False,
            reason=f"value {value} must be >= {constraint.greater_than_or_equal}",
        )
    if constraint.less_than_or_equal is not None and value > constraint.less_than_or_equal:
        return ConstraintCheckResult(
            passed=False,
            reason=f"value {value} must be <= {constraint.less_than_or_equal}",
        )
    if constraint.minimum is not None and value < constraint.minimum:
        return ConstraintCheckResult(
            passed=False,
            reason=f"value {value} must be >= {constraint.minimum}",
        )
    if constraint.maximum is not None and value > constraint.maximum:
        return ConstraintCheckResult(
            passed=False,
            reason=f"value {value} must be <= {constraint.maximum}",
        )
    return ConstraintCheckResult(passed=True)


def _check_string_constraints(
    value: str, constraint: ArgumentConstraint
) -> ConstraintCheckResult:
    if constraint.min_length is not None and len(value) < constraint.min_length:
        return ConstraintCheckResult(
            passed=False,
            reason=f"length {len(value)} is less than minimum {constraint.min_length}",
        )
    if constraint.max_length is not None and len(value) > constraint.max_length:
        return ConstraintCheckResult(
            passed=False,
            reason=f"length {len(value)} exceeds maximum {constraint.max_length}",
        )
    if constraint.regex is not None:
        if len(constraint.regex) > 256:
            return ConstraintCheckResult(
                passed=False,
                reason=f"regex pattern too long ({len(constraint.regex)} chars, max 256)",
            )
        try:
            if not is_safe_pattern(constraint.regex):
                return ConstraintCheckResult(
                    passed=False,
                    reason=f"regex pattern is potentially unsafe (ReDoS risk): {constraint.regex}",
                )
            compiled = re.compile(constraint.regex)
            if not compiled.search(value):
                return ConstraintCheckResult(
                    passed=False,
                    reason=f"value does not match pattern {constraint.regex}",
                )
        except re.error:
            return ConstraintCheckResult(
                passed=False,
                reason=f"invalid regex pattern: {constraint.regex}",
            )
    if constraint.enum is not None and value not in constraint.enum:
        return ConstraintCheckResult(
            passed=False,
            reason=f'value "{value}" is not in allowed values: {", ".join(constraint.enum)}',
        )
    return ConstraintCheckResult(passed=True)


def _check_array_constraints(
    value: list[Any], constraint: ArgumentConstraint
) -> ConstraintCheckResult:
    if constraint.min_items is not None and len(value) < constraint.min_items:
        return ConstraintCheckResult(
            passed=False,
            reason=f"array has {len(value)} items, minimum is {constraint.min_items}",
        )
    if constraint.max_items is not None and len(value) > constraint.max_items:
        return ConstraintCheckResult(
            passed=False,
            reason=f"array has {len(value)} items, maximum is {constraint.max_items}",
        )
    return ConstraintCheckResult(passed=True)
