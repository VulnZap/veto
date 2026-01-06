"""
Provider adapters for converting between Veto's format and provider formats.

These adapters enable Veto to work transparently with different AI providers
while maintaining a consistent internal representation.
"""

from typing import Callable, Generic, TypeVar, Union
from dataclasses import dataclass
import json

from veto.types.tool import ToolDefinition, ToolCall
from veto.providers.types import (
    Provider,
    OpenAITool,
    OpenAIToolCall,
    OpenAIFunctionDefinition,
    AnthropicTool,
    AnthropicToolUse,
    GoogleTool,
    GoogleFunctionDeclaration,
    GoogleFunctionCall,
)
from veto.utils.id import generate_tool_call_id


# ============================================================================
# OpenAI Adapter
# ============================================================================


def to_openai(tool: ToolDefinition) -> OpenAITool:
    """
    Convert Veto tool definition to OpenAI format.

    Example:
        >>> openai_tool = to_openai(ToolDefinition(
        ...     name='get_weather',
        ...     description='Get current weather',
        ...     input_schema={'type': 'object', 'properties': {'city': {'type': 'string'}}}
        ... ))
    """
    return OpenAITool(
        type="function",
        function=OpenAIFunctionDefinition(
            name=tool.name,
            description=tool.description,
            parameters=tool.input_schema,
        ),
    )


def from_openai(tool: OpenAITool) -> ToolDefinition:
    """Convert OpenAI tool format to Veto definition."""
    return ToolDefinition(
        name=tool.function.name,
        description=tool.function.description,
        input_schema=tool.function.parameters or {"type": "object"},
    )


def from_openai_tool_call(tool_call: OpenAIToolCall) -> ToolCall:
    """Convert OpenAI tool call to Veto format."""
    try:
        args = json.loads(tool_call.function.arguments)
    except (json.JSONDecodeError, TypeError):
        args = {}

    return ToolCall(
        id=tool_call.id,
        name=tool_call.function.name,
        arguments=args,
        raw_arguments=tool_call.function.arguments,
    )


def to_openai_tools(tools: list[ToolDefinition]) -> list[OpenAITool]:
    """Convert multiple Veto tools to OpenAI format."""
    return [to_openai(tool) for tool in tools]


# ============================================================================
# Anthropic Adapter
# ============================================================================


def to_anthropic(tool: ToolDefinition) -> AnthropicTool:
    """
    Convert Veto tool definition to Anthropic format.

    Example:
        >>> anthropic_tool = to_anthropic(ToolDefinition(
        ...     name='get_weather',
        ...     description='Get current weather',
        ...     input_schema={'type': 'object', 'properties': {'city': {'type': 'string'}}}
        ... ))
    """
    return AnthropicTool(
        name=tool.name,
        description=tool.description,
        input_schema=tool.input_schema,
    )


def from_anthropic(tool: AnthropicTool) -> ToolDefinition:
    """Convert Anthropic tool format to Veto definition."""
    return ToolDefinition(
        name=tool.name,
        description=tool.description,
        input_schema=tool.input_schema,
    )


def from_anthropic_tool_use(tool_use: AnthropicToolUse) -> ToolCall:
    """Convert Anthropic tool use to Veto format."""
    return ToolCall(
        id=tool_use.id,
        name=tool_use.name,
        arguments=tool_use.input,
    )


def to_anthropic_tools(tools: list[ToolDefinition]) -> list[AnthropicTool]:
    """Convert multiple Veto tools to Anthropic format."""
    return [to_anthropic(tool) for tool in tools]


# ============================================================================
# Google (Gemini) Adapter
# ============================================================================


def to_google_function_declaration(
    tool: ToolDefinition,
) -> GoogleFunctionDeclaration:
    """Convert Veto tool definition to Google function declaration."""
    return GoogleFunctionDeclaration(
        name=tool.name,
        description=tool.description,
        parameters=tool.input_schema,
    )


def to_google_tool(tools: list[ToolDefinition]) -> GoogleTool:
    """
    Convert Veto tools to Google tool format.

    Google's format wraps all function declarations in a single tool object.

    Example:
        >>> google_tool = to_google_tool([
        ...     ToolDefinition(name='get_weather', ...),
        ...     ToolDefinition(name='search', ...)
        ... ])
        # {'function_declarations': [...]}
    """
    return GoogleTool(
        function_declarations=[
            to_google_function_declaration(tool) for tool in tools
        ]
    )


def from_google_function_declaration(
    func: GoogleFunctionDeclaration,
) -> ToolDefinition:
    """Convert Google function declaration to Veto definition."""
    return ToolDefinition(
        name=func.name,
        description=func.description,
        input_schema=func.parameters or {"type": "object"},
    )


def from_google_tool(tool: GoogleTool) -> list[ToolDefinition]:
    """Convert Google tool to Veto definitions."""
    return [
        from_google_function_declaration(func)
        for func in tool.function_declarations
    ]


def from_google_function_call(function_call: GoogleFunctionCall) -> ToolCall:
    """Convert Google function call to Veto format."""
    return ToolCall(
        id=generate_tool_call_id(),
        name=function_call.name,
        arguments=function_call.args,
    )


# ============================================================================
# Generic Adapter Factory
# ============================================================================

TTool = TypeVar("TTool")
TToolCall = TypeVar("TToolCall")


@dataclass
class ProviderAdapter(Generic[TTool, TToolCall]):
    """Adapter interface for converting between formats."""

    to_provider_tool: Callable[[ToolDefinition], TTool]
    from_provider_tool: Callable[[TTool], ToolDefinition]
    from_provider_tool_call: Callable[[TToolCall], ToolCall]
    to_provider_tools: Callable[[list[ToolDefinition]], list[TTool]]


# OpenAI adapter instance
openai_adapter: ProviderAdapter[OpenAITool, OpenAIToolCall] = ProviderAdapter(
    to_provider_tool=to_openai,
    from_provider_tool=from_openai,
    from_provider_tool_call=from_openai_tool_call,
    to_provider_tools=to_openai_tools,
)

# Anthropic adapter instance
anthropic_adapter: ProviderAdapter[AnthropicTool, AnthropicToolUse] = (
    ProviderAdapter(
        to_provider_tool=to_anthropic,
        from_provider_tool=from_anthropic,
        from_provider_tool_call=from_anthropic_tool_use,
        to_provider_tools=to_anthropic_tools,
    )
)


def get_adapter(
    provider: Provider,
) -> Union[
    ProviderAdapter[OpenAITool, OpenAIToolCall],
    ProviderAdapter[AnthropicTool, AnthropicToolUse],
]:
    """
    Get an adapter for a specific provider.

    Example:
        >>> adapter = get_adapter('openai')
        >>> provider_tools = adapter.to_provider_tools(veto_tools)
    """
    if provider == "openai":
        return openai_adapter
    elif provider == "anthropic":
        return anthropic_adapter
    elif provider == "google":
        raise ValueError(
            "Google adapter not available via get_adapter(). "
            "Use to_google_tool() and from_google_function_call() directly."
        )
    else:
        raise ValueError(f"Unknown provider: {provider}")
