"""
Custom LLM provider module for Veto validation.
"""

from veto.custom.types import (
    CustomProvider,
    CustomConfig,
    ResolvedCustomConfig,
    CustomResponse,
    CustomToolCall,
    PROVIDER_ENV_VARS,
    PROVIDER_BASE_URLS,
    CUSTOM_DEFAULTS,
    CustomError,
    CustomParseError,
    CustomAPIKeyError,
    resolve_custom_config,
)

from veto.custom.client import (
    CustomClient,
    CustomClientOptions,
    create_custom_client,
)

from veto.custom.prompt import (
    SYSTEM_PROMPT,
    ProviderMessages,
    build_user_prompt,
    build_provider_messages,
)

__all__ = [
    # Types
    "CustomProvider",
    "CustomConfig",
    "ResolvedCustomConfig",
    "CustomResponse",
    "CustomToolCall",
    "PROVIDER_ENV_VARS",
    "PROVIDER_BASE_URLS",
    "CUSTOM_DEFAULTS",
    "CustomError",
    "CustomParseError",
    "CustomAPIKeyError",
    "resolve_custom_config",
    # Client
    "CustomClient",
    "CustomClientOptions",
    "create_custom_client",
    # Prompt
    "SYSTEM_PROMPT",
    "ProviderMessages",
    "build_user_prompt",
    "build_provider_messages",
]
