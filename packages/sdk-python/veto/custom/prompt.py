"""
Prompt building for custom LLM providers.
"""

from typing import Any, Optional
from dataclasses import dataclass

from veto.rules.types import Rule
from veto.rules.prompt import build_prompt as build_kernel_prompt
from veto.custom.types import CustomProvider, CustomToolCall


# System prompt for custom validation (provider-agnostic)
SYSTEM_PROMPT = """You are a security guardrail for AI agent tool calls.

TASK: Evaluate whether the tool call violates any rules in the provided ruleset.

IMPORTANT: You MUST respond with ONLY a JSON object, no other text, no explanation, no markdown.

JSON FORMAT:
{"pass_weight": <float 0-1>, "block_weight": <float 0-1>, "decision": "<pass|block>", "reasoning": "<brief explanation>"}

RULES:
- If no rules are violated, set decision to "pass" with pass_weight >= 0.7
- If any rule is violated, set decision to "block" with block_weight >= 0.7"""


@dataclass
class ProviderMessages:
    """
    Provider-specific message structures.

    Different providers have different message formats:
    - OpenAI/OpenRouter: [{'role': 'system', 'content'}, {'role': 'user', 'content'}]
    - Anthropic: system is separate parameter, messages: [{'role': 'user', 'content'}]
    - Gemini: contents with parts
    """

    system: Optional[str] = None
    messages: Optional[list[dict[str, str]]] = None
    contents: Optional[list[dict[str, Any]]] = None


def build_user_prompt(tool_call: CustomToolCall, rules: list[Rule]) -> str:
    """
    Build user prompt from tool call and rules.
    Reuses kernel's build_prompt function for consistency.

    Args:
        tool_call: Tool call to validate
        rules: Rules to evaluate against

    Returns:
        Formatted user prompt
    """
    return build_kernel_prompt(tool_call.tool, tool_call.arguments, rules)


def build_provider_messages(
    provider: CustomProvider, user_prompt: str
) -> ProviderMessages:
    """
    Build provider-specific message structure.

    Args:
        provider: LLM provider type
        user_prompt: Formatted user prompt

    Returns:
        Provider-specific message structure
    """
    if provider in ("openai", "openrouter"):
        return ProviderMessages(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ]
        )
    elif provider == "anthropic":
        return ProviderMessages(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
    elif provider == "gemini":
        # Gemini: system prompt prepended to user message
        return ProviderMessages(
            contents=[
                {
                    "role": "user",
                    "parts": [{"text": f"{SYSTEM_PROMPT}\n\n{user_prompt}"}],
                }
            ]
        )
    else:
        raise ValueError(f"Unknown provider: {provider}")
