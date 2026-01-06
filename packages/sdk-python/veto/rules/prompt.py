"""
Prompt builder for the Veto validation.

Formats tool calls and rules into the exact prompt format
used for training the Veto model.
"""

from typing import Any
from veto.rules.types import Rule, RuleCondition


# System prompt for the Veto guardrail model
SYSTEM_PROMPT = """You are a security guardrail for AI agent tool calls. You receive a tool call and a ruleset defining security policies.
Evaluate whether the tool call violates any rules in the ruleset.
Respond with JSON only:
{"pass_weight": <float 0-1>, "block_weight": <float 0-1>, "decision": "<pass|block>", "reasoning": "<brief explanation>"}"""


def build_system_prompt() -> str:
    """Build the system prompt for kernel inference."""
    return SYSTEM_PROMPT


def format_value(value: Any, indent: int = 0) -> str:
    """Format a value for YAML-like output."""
    spaces = "  " * indent

    if value is None:
        return "null"

    if isinstance(value, str):
        return f'"{value}"'

    if isinstance(value, (int, float, bool)):
        return str(value).lower() if isinstance(value, bool) else str(value)

    if isinstance(value, list):
        if len(value) == 0:
            return "[]"
        if all(isinstance(v, (str, int, float)) for v in value):
            return f"[{', '.join(str(v) for v in value)}]"
        return "".join(
            f"\n{spaces}- {format_value(v, indent + 1)}" for v in value
        )

    if isinstance(value, dict):
        entries = list(value.items())
        if len(entries) == 0:
            return "{}"
        result = []
        for k, v in entries:
            formatted_value = format_value(v, indent + 1)
            if isinstance(v, dict) and v:
                result.append(f"\n{spaces}{k}:{formatted_value}")
            else:
                result.append(f"\n{spaces}{k}: {formatted_value}")
        return "".join(result)

    return str(value)


def format_tool_call(tool: str, arguments: dict[str, Any]) -> str:
    """Format a tool call for the kernel prompt."""
    lines = ["TOOL CALL:", f"tool: {tool}", "arguments:"]

    for key, value in arguments.items():
        formatted_value = format_value(value, 1)
        if isinstance(value, dict) and value:
            lines.append(f"  {key}:{formatted_value}")
        else:
            lines.append(f"  {key}: {formatted_value}")

    return "\n".join(lines)


def format_condition(condition: RuleCondition, indent: str) -> str:
    """Format a single condition."""
    lines = [
        f"{indent}- field: {condition.field}",
        f"{indent}  operator: {condition.operator}",
        f"{indent}  value: {format_value(condition.value)}",
    ]
    return "\n".join(lines)


def format_rules(rules: list[Rule]) -> str:
    """Format rules for the kernel prompt."""
    lines = ["RULES:"]

    for rule in rules:
        lines.append(f"- id: {rule.id}")
        lines.append(f"  name: {rule.name}")
        lines.append(f"  enabled: {str(rule.enabled).lower()}")
        lines.append(f"  severity: {rule.severity}")
        lines.append(f"  action: {rule.action}")

        if rule.tools and len(rule.tools) > 0:
            lines.append(f"  tools: [{', '.join(rule.tools)}]")

        if rule.conditions and len(rule.conditions) > 0:
            lines.append("  conditions:")
            for condition in rule.conditions:
                lines.append(format_condition(condition, "    "))

        if rule.condition_groups and len(rule.condition_groups) > 0:
            lines.append("  condition_groups:")
            for group in rule.condition_groups:
                lines.append("    - conditions:")
                for condition in group:
                    lines.append(format_condition(condition, "        "))

    return "\n".join(lines)


def build_prompt(tool: str, arguments: dict[str, Any], rules: list[Rule]) -> str:
    """Build the complete user prompt for kernel inference."""
    tool_call_section = format_tool_call(tool, arguments)
    rules_section = format_rules(rules)

    return f"{tool_call_section}\n\n{rules_section}"
