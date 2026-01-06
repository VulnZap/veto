"""
Type definitions for Veto.
"""

from veto.types.tool import (
    JsonSchemaType,
    JsonSchemaProperty,
    ToolInputSchema,
    ToolDefinition,
    ToolCall,
    ToolResult,
    ToolHandler,
    ExecutableTool,
    is_executable_tool,
    get_tool_names,
    find_tool_by_name,
)

from veto.types.config import (
    LogLevel,
    ValidationDecision,
    ValidationResult,
    ValidationContext,
    ToolCallHistoryEntry,
    Validator,
    NamedValidator,
    VetoConfig,
    ResolvedVetoConfig,
    is_named_validator,
    normalize_validator,
)

__all__ = [
    # Tool types
    "JsonSchemaType",
    "JsonSchemaProperty",
    "ToolInputSchema",
    "ToolDefinition",
    "ToolCall",
    "ToolResult",
    "ToolHandler",
    "ExecutableTool",
    "is_executable_tool",
    "get_tool_names",
    "find_tool_by_name",
    # Config types
    "LogLevel",
    "ValidationDecision",
    "ValidationResult",
    "ValidationContext",
    "ToolCallHistoryEntry",
    "Validator",
    "NamedValidator",
    "VetoConfig",
    "ResolvedVetoConfig",
    "is_named_validator",
    "normalize_validator",
]
