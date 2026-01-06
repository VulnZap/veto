"""
Custom LLM provider types for validation.
"""

from typing import Any, Literal, Optional
from dataclasses import dataclass
import os


# Supported LLM providers for custom validation mode
CustomProvider = Literal["gemini", "openrouter", "openai", "anthropic"]


@dataclass
class CustomConfig:
    """Configuration for custom validation mode."""

    provider: CustomProvider
    model: str
    api_key: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    timeout: Optional[int] = None
    base_url: Optional[str] = None


@dataclass
class ResolvedCustomConfig:
    """Resolved custom configuration with defaults."""

    provider: CustomProvider
    model: str
    api_key: str
    temperature: float
    max_tokens: int
    timeout: int
    base_url: Optional[str] = None


@dataclass
class CustomResponse:
    """Response from custom LLM provider (matches kernel format)."""

    pass_weight: float
    block_weight: float
    decision: Literal["pass", "block"]
    reasoning: str
    matched_rules: Optional[list[str]] = None


@dataclass
class CustomToolCall:
    """Tool call structure for custom validation (matches kernel)."""

    tool: str
    arguments: dict[str, Any]


# Environment variable names for each provider
PROVIDER_ENV_VARS: dict[CustomProvider, str] = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}

# Default base URLs for each provider
PROVIDER_BASE_URLS: dict[CustomProvider, Optional[str]] = {
    "openai": "https://api.openai.com/v1",
    "anthropic": None,  # Uses SDK default
    "gemini": None,  # Uses SDK default
    "openrouter": "https://openrouter.ai/api/v1",
}

# Default values for custom configuration
CUSTOM_DEFAULTS = {
    "temperature": 0.1,
    "max_tokens": 500,
    "timeout": 30000,
}


class CustomError(Exception):
    """Base error class for custom provider errors."""

    def __init__(self, message: str, cause: Optional[Exception] = None):
        super().__init__(message)
        self.cause = cause


class CustomParseError(CustomError):
    """Error thrown when response parsing fails."""

    def __init__(self, message: str, raw_response: str):
        super().__init__(message)
        self.raw_response = raw_response


class CustomAPIKeyError(CustomError):
    """Error thrown when API key is missing."""

    def __init__(self, provider: CustomProvider, env_var: str):
        super().__init__(
            f"API key for {provider} not found. "
            f"Set {env_var} environment variable or provide api_key in config."
        )
        self.provider = provider


def resolve_custom_config(config: CustomConfig) -> ResolvedCustomConfig:
    """
    Resolve custom configuration with defaults and validation.

    Args:
        config: User-provided configuration

    Returns:
        Resolved configuration with all required fields

    Raises:
        CustomAPIKeyError: If API key is not found
    """
    # Resolve API key: use provided key or environment variable
    env_var = PROVIDER_ENV_VARS[config.provider]
    api_key = config.api_key or os.environ.get(env_var)

    if not api_key:
        raise CustomAPIKeyError(config.provider, env_var)

    return ResolvedCustomConfig(
        provider=config.provider,
        model=config.model,
        api_key=api_key,
        temperature=config.temperature
        if config.temperature is not None
        else CUSTOM_DEFAULTS["temperature"],
        max_tokens=int(config.max_tokens
        if config.max_tokens is not None
        else CUSTOM_DEFAULTS["max_tokens"]),
        timeout=int(config.timeout
        if config.timeout is not None
        else CUSTOM_DEFAULTS["timeout"]),
        base_url=config.base_url or PROVIDER_BASE_URLS[config.provider],
    )
