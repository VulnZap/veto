"""
Type definitions for Veto Cloud API interactions.
"""

from typing import Any, Literal, Optional
from dataclasses import dataclass, field


@dataclass
class ToolParameter:
    """Definition of a single tool parameter for registration."""

    name: str
    type: str  # "string", "number", "integer", "boolean", "object", "array"
    description: Optional[str] = None
    required: bool = False
    # Additional schema info
    enum: Optional[list[Any]] = None
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    pattern: Optional[str] = None


@dataclass
class ToolRegistration:
    """Tool registration payload sent to cloud API."""

    name: str
    description: Optional[str] = None
    parameters: list[ToolParameter] = field(default_factory=list)


@dataclass
class ToolRegistrationRequest:
    """Request to register tools with the cloud."""

    tools: list[ToolRegistration]


@dataclass
class ToolRegistrationResponse:
    """Response from tool registration."""

    success: bool
    registered_tools: list[str]
    message: Optional[str] = None


@dataclass
class ValidationRequest:
    """Request to validate a tool call."""

    tool_name: str
    arguments: dict[str, Any]
    context: Optional[dict[str, Any]] = None  # Optional metadata/context


@dataclass
class FailedConstraint:
    """Details about a constraint that failed validation."""

    parameter: str
    constraint_type: str  # "range", "enum", "regex", "custom", etc.
    expected: Any
    actual: Any
    message: str


@dataclass
class ValidationResponse:
    """Response from tool call validation."""

    decision: Literal["allow", "deny", "require_approval"]
    reason: Optional[str] = None
    failed_constraints: list[FailedConstraint] = field(default_factory=list)
    # Metadata from cloud (can include LLM reasoning if exceptions were evaluated)
    metadata: Optional[dict[str, Any]] = None
    approval_id: Optional[str] = None


@dataclass
class ApprovalData:
    """Data returned when an approval is resolved."""

    id: str
    status: Literal["pending", "approved", "denied"]
    tool_name: Optional[str] = None
    resolved_by: Optional[str] = None


@dataclass
class ApprovalPollOptions:
    """Options for polling an approval record."""

    poll_interval: float = 2.0  # seconds between polls
    timeout: float = 300.0  # max seconds to wait
