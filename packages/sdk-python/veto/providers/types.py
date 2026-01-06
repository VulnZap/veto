"""
Provider-specific type definitions.

This module defines the tool schema formats used by different AI providers,
allowing Veto to work transparently with each provider's format.
"""

from typing import Any, Literal, Optional, Union
from dataclasses import dataclass

from veto.types.tool import ToolInputSchema


# ============================================================================
# OpenAI / Azure OpenAI Format
# ============================================================================


@dataclass
class OpenAIFunctionDefinition:
    """
    OpenAI function definition format.

    See: https://platform.openai.com/docs/guides/function-calling
    """

    name: str
    description: Optional[str] = None
    parameters: Optional[ToolInputSchema] = None


@dataclass
class OpenAITool:
    """OpenAI tool format (wraps function definition)."""

    type: Literal["function"]
    function: OpenAIFunctionDefinition


@dataclass
class OpenAIToolCall:
    """OpenAI tool call from the API response."""

    id: str
    type: Literal["function"]
    function: "OpenAIToolCallFunction"


@dataclass
class OpenAIToolCallFunction:
    """Function details within an OpenAI tool call."""

    name: str
    arguments: str


# ============================================================================
# Anthropic (Claude) Format
# ============================================================================


@dataclass
class AnthropicTool:
    """
    Anthropic tool definition format.

    See: https://docs.anthropic.com/claude/docs/tool-use
    """

    name: str
    input_schema: ToolInputSchema
    description: Optional[str] = None


@dataclass
class AnthropicToolUse:
    """Anthropic tool use block from the API response."""

    type: Literal["tool_use"]
    id: str
    name: str
    input: dict[str, Any]


# ============================================================================
# Google (Gemini) Format
# ============================================================================


@dataclass
class GoogleFunctionDeclaration:
    """
    Google function declaration format.

    See: https://ai.google.dev/gemini-api/docs/function-calling
    """

    name: str
    description: Optional[str] = None
    parameters: Optional[ToolInputSchema] = None


@dataclass
class GoogleTool:
    """Google tool format (wraps function declarations)."""

    function_declarations: list[GoogleFunctionDeclaration]


@dataclass
class GoogleFunctionCall:
    """Google function call from the API response."""

    name: str
    args: dict[str, Any]


# ============================================================================
# Provider Enum
# ============================================================================

# Supported AI providers
Provider = Literal["openai", "anthropic", "google"]

# Union type for all provider tool formats
ProviderTool = Union[OpenAITool, AnthropicTool, GoogleTool]

# Union type for all provider tool call formats
ProviderToolCall = Union[OpenAIToolCall, AnthropicToolUse, GoogleFunctionCall]
