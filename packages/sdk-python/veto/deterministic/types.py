from typing import Literal, Optional
from dataclasses import dataclass, field


@dataclass
class ArgumentConstraint:
    argument_name: str
    enabled: bool = True
    greater_than: Optional[float] = None
    less_than: Optional[float] = None
    greater_than_or_equal: Optional[float] = None
    less_than_or_equal: Optional[float] = None
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    regex: Optional[str] = None
    enum: Optional[list[str]] = None
    min_items: Optional[int] = None
    max_items: Optional[int] = None
    required: Optional[bool] = None
    not_null: Optional[bool] = None


@dataclass
class DeterministicPolicy:
    tool_name: str
    mode: Literal["deterministic", "llm"]
    constraints: list[ArgumentConstraint]
    has_session_constraints: bool
    has_rate_limits: bool
    version: int
    fetched_at: float


@dataclass
class ConstraintCheckResult:
    passed: bool
    reason: Optional[str] = None


@dataclass
class ValidationEntry:
    argument: str
    status: Literal["pass", "fail"]
    reason: Optional[str] = None


@dataclass
class LocalValidationResult:
    decision: Literal["allow", "deny"]
    reason: Optional[str] = None
    failed_argument: Optional[str] = None
    validations: list[ValidationEntry] = field(default_factory=list)
    latency_ms: float = 0.0
