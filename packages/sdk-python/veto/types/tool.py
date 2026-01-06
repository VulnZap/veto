"""
Core type definitions for tool schemas used across different AI providers.

These types provide a unified representation of tool definitions that can be
converted to/from provider-specific formats (OpenAI, Anthropic, Google, etc.).
"""

from typing import (
    Any,
    Callable,
    Literal,
    Optional,
    TypedDict,
    Union,
    Awaitable,
    Protocol,
    runtime_checkable,
)
from dataclasses import dataclass, field


# JSON Schema type definitions for tool parameters
JsonSchemaType = Literal[
    "string", "number", "integer", "boolean", "object", "array", "null"
]


class JsonSchemaProperty(TypedDict, total=False):
    """Property definition within a JSON Schema object."""

    type: Union[JsonSchemaType, list[JsonSchemaType]]
    description: str
    enum: list[Union[str, int, bool, None]]
    default: Any
    items: "JsonSchemaProperty"
    properties: dict[str, "JsonSchemaProperty"]
    required: list[str]
    minimum: Union[int, float]
    maximum: Union[int, float]
    minLength: int
    maxLength: int
    pattern: str
    allOf: list["JsonSchemaProperty"]
    anyOf: list["JsonSchemaProperty"]
    oneOf: list["JsonSchemaProperty"]
    additionalProperties: Union[bool, "JsonSchemaProperty"]


class ToolInputSchema(TypedDict, total=False):
    """Complete JSON Schema definition for tool input parameters."""

    type: Literal["object"]
    properties: dict[str, JsonSchemaProperty]
    required: list[str]
    additionalProperties: bool


@dataclass
class ToolDefinition:
    """
    Unified tool definition that works across providers.

    This is the canonical format used internally by Veto. Provider adapters
    convert to/from this format.

    Example:
        >>> read_file_tool = ToolDefinition(
        ...     name='read_file',
        ...     description='Read the contents of a file at the specified path',
        ...     input_schema={
        ...         'type': 'object',
        ...         'properties': {
        ...             'path': {
        ...                 'type': 'string',
        ...                 'description': 'The file path to read'
        ...             }
        ...         },
        ...         'required': ['path']
        ...     }
        ... )
    """

    name: str
    input_schema: ToolInputSchema
    description: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


@dataclass
class ToolCall:
    """
    Represents a tool call made by an AI agent.

    This captures the intent to invoke a specific tool with given arguments,
    before the tool is actually executed.
    """

    id: str
    name: str
    arguments: dict[str, Any]
    raw_arguments: Optional[str] = None


@dataclass
class ToolResult:
    """Result of executing a tool call."""

    tool_call_id: str
    tool_name: str
    content: Any
    is_error: bool = False


# Handler function type for tool execution
ToolHandler = Callable[[dict[str, Any]], Union[Any, Awaitable[Any]]]


@dataclass
class ExecutableTool(ToolDefinition):
    """A tool definition paired with its execution handler."""

    handler: ToolHandler = field(default=lambda args: None)


@runtime_checkable
class ToolLike(Protocol):
    """Protocol for tool-like objects."""

    name: str


def is_executable_tool(tool: ToolDefinition) -> bool:
    """Type guard to check if a tool definition has an attached handler."""
    return isinstance(tool, ExecutableTool) and callable(tool.handler)


def get_tool_names(tools: list[ToolDefinition]) -> list[str]:
    """Extracts the names from an array of tool definitions."""
    return [tool.name for tool in tools]


def find_tool_by_name(
    tools: list[ToolDefinition], name: str
) -> Optional[ToolDefinition]:
    """Finds a tool by name in an array of tool definitions."""
    for tool in tools:
        if tool.name == name:
            return tool
    return None
