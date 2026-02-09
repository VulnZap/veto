"""
Policy IR v1 schema validator.

Validates policy documents against the canonical JSON Schema
shared between TypeScript and Python SDKs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from jsonschema import Draft202012Validator, ValidationError as JsonSchemaError

from veto.rules.policy_ir_schema import POLICY_IR_V1_SCHEMA


@dataclass
class PolicyValidationError:
    """A single validation error with location and message."""

    path: str
    message: str
    keyword: str


class PolicySchemaError(Exception):
    """Raised when a policy document fails schema validation."""

    def __init__(self, errors: list[PolicyValidationError]) -> None:
        summary = "\n".join(f"  - {e.path}: {e.message}" for e in errors)
        super().__init__(f"Invalid policy document:\n{summary}")
        self.errors = errors


_validator: Draft202012Validator | None = None


def _get_validator() -> Draft202012Validator:
    global _validator
    if _validator is None:
        Draft202012Validator.check_schema(POLICY_IR_V1_SCHEMA)
        _validator = Draft202012Validator(POLICY_IR_V1_SCHEMA)
    return _validator


def _format_path(error: JsonSchemaError) -> str:
    parts = [str(p) for p in error.absolute_path]
    return "/" + "/".join(parts) if parts else "/"


def validate_policy_ir(data: Any) -> None:
    """Validate a policy document against the Policy IR v1 schema.

    Args:
        data: Parsed policy document (dict from YAML/JSON).

    Raises:
        PolicySchemaError: If validation fails, with actionable error details.
    """
    validator = _get_validator()
    raw_errors = list(validator.iter_errors(data))
    if raw_errors:
        errors = [
            PolicyValidationError(
                path=_format_path(e),
                message=e.message,
                keyword=e.validator,
            )
            for e in raw_errors
        ]
        raise PolicySchemaError(errors)
