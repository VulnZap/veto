"""
Provider adapters for Veto.
"""

from veto.providers.types import (
    Provider,
    OpenAIFunctionDefinition,
    OpenAITool,
    OpenAIToolCall,
    AnthropicTool,
    AnthropicToolUse,
    GoogleFunctionDeclaration,
    GoogleTool,
    GoogleFunctionCall,
    ProviderTool,
    ProviderToolCall,
)

from veto.providers.adapters import (
    to_openai,
    from_openai,
    from_openai_tool_call,
    to_openai_tools,
    to_anthropic,
    from_anthropic,
    from_anthropic_tool_use,
    to_anthropic_tools,
    to_google_function_declaration,
    to_google_tool,
    from_google_function_declaration,
    from_google_tool,
    from_google_function_call,
    ProviderAdapter,
    openai_adapter,
    anthropic_adapter,
    get_adapter,
)

__all__ = [
    # Types
    "Provider",
    "OpenAIFunctionDefinition",
    "OpenAITool",
    "OpenAIToolCall",
    "AnthropicTool",
    "AnthropicToolUse",
    "GoogleFunctionDeclaration",
    "GoogleTool",
    "GoogleFunctionCall",
    "ProviderTool",
    "ProviderToolCall",
    # Adapters
    "to_openai",
    "from_openai",
    "from_openai_tool_call",
    "to_openai_tools",
    "to_anthropic",
    "from_anthropic",
    "from_anthropic_tool_use",
    "to_anthropic_tools",
    "to_google_function_declaration",
    "to_google_tool",
    "from_google_function_declaration",
    "from_google_tool",
    "from_google_function_call",
    "ProviderAdapter",
    "openai_adapter",
    "anthropic_adapter",
    "get_adapter",
]
