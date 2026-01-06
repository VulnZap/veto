"""
Type definitions for YAML-based rules.

Rules define restrictions on tools and agent behavior. They are loaded
from YAML files and used to validate tool calls via an external API.
"""

from typing import Any, Literal, Optional
from dataclasses import dataclass, field


# Condition operators for rule matching
ConditionOperator = Literal[
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "matches",  # Regex match
    "greater_than",
    "less_than",
    "in",
    "not_in",
]


@dataclass
class RuleCondition:
    """A single condition within a rule."""

    field: str  # Supports dot notation, e.g., "arguments.path"
    operator: ConditionOperator
    value: Any


# Action to take when a rule matches
RuleAction = Literal["block", "warn", "log", "allow"]

# Severity level for a rule
RuleSeverity = Literal["critical", "high", "medium", "low", "info"]


@dataclass
class Rule:
    """A single rule definition."""

    id: str
    name: str
    enabled: bool
    severity: RuleSeverity
    action: RuleAction
    description: Optional[str] = None
    tools: Optional[list[str]] = None
    conditions: Optional[list[RuleCondition]] = None
    condition_groups: Optional[list[list[RuleCondition]]] = None
    tags: Optional[list[str]] = None
    metadata: Optional[dict[str, Any]] = None


@dataclass
class RuleSetSettings:
    """Global settings for a rule set."""

    default_action: Optional[RuleAction] = None
    fail_mode: Optional[Literal["open", "closed"]] = None
    global_tags: Optional[list[str]] = None


@dataclass
class RuleSet:
    """A rule set containing multiple rules with shared configuration."""

    version: str
    name: str
    rules: list[Rule]
    description: Optional[str] = None
    settings: Optional[RuleSetSettings] = None


@dataclass
class ToolCallHistorySummary:
    """Summary of a previous tool call for history context."""

    tool_name: str
    allowed: bool
    timestamp: str


@dataclass
class ToolCallContext:
    """Context passed to the validation API."""

    call_id: str
    tool_name: str
    arguments: dict[str, Any]
    timestamp: str
    session_id: Optional[str] = None
    agent_id: Optional[str] = None
    call_history: Optional[list[ToolCallHistorySummary]] = None
    custom: Optional[dict[str, Any]] = None


@dataclass
class ValidationAPIRequest:
    """Request payload sent to the validation API."""

    context: ToolCallContext
    rules: list[Rule]


@dataclass
class ValidationAPIResponse:
    """Response from the validation API."""

    should_pass_weight: float
    should_block_weight: float
    decision: Literal["pass", "block"]
    reasoning: str
    matched_rules: Optional[list[str]] = None
    metadata: Optional[dict[str, Any]] = None


@dataclass
class LoadedRules:
    """Loaded rules with their source information."""

    rule_sets: list[RuleSet] = field(default_factory=list)
    all_rules: list[Rule] = field(default_factory=list)
    rules_by_tool: dict[str, list[Rule]] = field(default_factory=dict)
    global_rules: list[Rule] = field(default_factory=list)
    source_files: list[str] = field(default_factory=list)


def get_rules_for_tool(loaded_rules: LoadedRules, tool_name: str) -> list[Rule]:
    """Get rules applicable to a specific tool."""
    tool_specific = loaded_rules.rules_by_tool.get(tool_name, [])
    all_applicable = [*loaded_rules.global_rules, *tool_specific]
    return [rule for rule in all_applicable if rule.enabled]
