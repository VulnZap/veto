"""
Veto - A guardrail system for AI agent tool calls.

Veto sits between the AI model and tool execution, intercepting and
validating tool calls before they are executed.

Example:
    >>> from veto import Veto
    >>>
    >>> # Initialize Veto
    >>> veto = await Veto.init()
    >>>
    >>> # Wrap your tools
    >>> wrapped_tools = veto.wrap(my_tools)
    >>>
    >>> # Pass to your Agent/LLM
    >>> agent = create_agent(tools=wrapped_tools)
"""

# Main export
from veto.core.veto import (
    Veto,
    ToolCallDeniedError,
    VetoOptions,
    VetoMode,
    WrappedTools,
    WrappedHandler,
)

# Core types
from veto.types.tool import (
    ToolDefinition,
    ToolCall,
    ToolResult,
    ToolHandler,
    ExecutableTool,
    ToolInputSchema,
    JsonSchemaType,
    JsonSchemaProperty,
)

from veto.types.config import (
    LogLevel,
    ValidationDecision,
    ValidationResult,
    ValidationContext,
    Validator,
    NamedValidator,
    ToolCallHistoryEntry,
)

# Rule types
from veto.rules.types import (
    Rule,
    RuleSet,
    RuleCondition,
    RuleAction,
    RuleSeverity,
    ValidationAPIResponse,
)

# Custom provider types
from veto.custom.types import (
    CustomConfig,
    CustomProvider,
    CustomResponse,
    CustomToolCall,
)
from veto.custom.client import CustomClient

# Interception result
from veto.core.interceptor import InterceptionResult
from veto.core.history import HistoryStats

# Provider adapters
from veto.providers.adapters import (
    to_openai,
    from_openai,
    from_openai_tool_call,
    to_openai_tools,
    to_anthropic,
    from_anthropic,
    from_anthropic_tool_use,
    to_anthropic_tools,
    to_google_tool,
    from_google_function_call,
)

from veto.providers.types import (
    OpenAITool,
    OpenAIToolCall,
    AnthropicTool,
    AnthropicToolUse,
    GoogleTool,
    GoogleFunctionCall,
)

# CLI init function
from veto.cli.init import init, is_initialized

__all__ = [
    # Main
    "Veto",
    "ToolCallDeniedError",
    "VetoOptions",
    "VetoMode",
    "WrappedTools",
    "WrappedHandler",
    # Tool types
    "ToolDefinition",
    "ToolCall",
    "ToolResult",
    "ToolHandler",
    "ExecutableTool",
    "ToolInputSchema",
    "JsonSchemaType",
    "JsonSchemaProperty",
    # Config types
    "LogLevel",
    "ValidationDecision",
    "ValidationResult",
    "ValidationContext",
    "Validator",
    "NamedValidator",
    "ToolCallHistoryEntry",
    # Rule types
    "Rule",
    "RuleSet",
    "RuleCondition",
    "RuleAction",
    "RuleSeverity",
    "ValidationAPIResponse",
    # Custom types
    "CustomConfig",
    "CustomProvider",
    "CustomResponse",
    "CustomToolCall",
    "CustomClient",
    # Interception
    "InterceptionResult",
    "HistoryStats",
    # Provider adapters
    "to_openai",
    "from_openai",
    "from_openai_tool_call",
    "to_openai_tools",
    "to_anthropic",
    "from_anthropic",
    "from_anthropic_tool_use",
    "to_anthropic_tools",
    "to_google_tool",
    "from_google_function_call",
    # Provider types
    "OpenAITool",
    "OpenAIToolCall",
    "AnthropicTool",
    "AnthropicToolUse",
    "GoogleTool",
    "GoogleFunctionCall",
    # CLI
    "init",
    "is_initialized",
]
