"""
Main Veto guardrail class.

This is the primary entry point for using Veto. It automatically loads
configuration and rules from the veto/ directory and validates tool calls.
"""

from typing import (
    Any,
    Callable,
    Literal,
    Optional,
    TypeVar,
    Union,
    Awaitable,
    Protocol,
    runtime_checkable,
)
from dataclasses import dataclass, field
from pathlib import Path
import os
import asyncio
import inspect

import yaml

from veto.types.tool import ToolDefinition, ToolCall
from veto.types.config import (
    LogLevel,
    Validator,
    NamedValidator,
    ValidationContext,
    ValidationResult,
    ToolCallHistoryEntry,
)
from veto.utils.logger import Logger, create_logger
from veto.utils.id import generate_tool_call_id
from veto.core.validator import ValidationEngine
from veto.core.history import HistoryTracker, HistoryTrackerOptions, HistoryStats
from veto.core.interceptor import (
    Interceptor,
    InterceptorOptions,
    InterceptionResult,
    ToolCallDeniedError,
)
from veto.rules.types import (
    Rule,
    RuleCondition,
    ToolCallContext,
    ToolCallHistorySummary,
    ValidationAPIResponse,
)
from veto.custom.types import CustomConfig, CustomToolCall, CustomResponse
from veto.custom.client import CustomClient, CustomClientOptions


# Veto operating mode
VetoMode = Literal["strict", "log"]

# Validation mode - how tool calls are validated
ValidationMode = Literal["api", "custom"]

# Wrapped handler function type
WrappedHandler = Callable[[dict[str, Any]], Awaitable[Any]]


@dataclass
class WrappedTools:
    """Result of wrapping tools with Veto."""

    definitions: list[ToolDefinition]
    implementations: dict[str, WrappedHandler]


@dataclass
class VetoConfigFile:
    """Parsed veto.config.yaml structure."""

    version: Optional[str] = None
    mode: Optional[VetoMode] = None
    validation: Optional[dict[str, Any]] = None
    api: Optional[dict[str, Any]] = None
    custom: Optional[dict[str, Any]] = None
    logging: Optional[dict[str, Any]] = None
    rules: Optional[dict[str, Any]] = None


@dataclass
class LoadedRulesState:
    """Internal state for loaded rules."""

    all_rules: list[Rule] = field(default_factory=list)
    rules_by_tool: dict[str, list[Rule]] = field(default_factory=dict)
    global_rules: list[Rule] = field(default_factory=list)


@dataclass
class VetoOptions:
    """Options for creating a Veto instance."""

    config_dir: Optional[str] = None
    mode: Optional[VetoMode] = None
    log_level: Optional[LogLevel] = None
    session_id: Optional[str] = None
    agent_id: Optional[str] = None
    validators: Optional[list[Union[Validator, NamedValidator]]] = None


@runtime_checkable
class ToolLike(Protocol):
    """Protocol for tool-like objects."""

    name: str


T = TypeVar("T", bound=ToolLike)


class Veto:
    """
    Veto - A guardrail system for AI agent tool calls.

    Veto automatically loads configuration from the veto/ directory and
    validates tool calls against defined rules via an external API.

    Example:
        >>> from veto import Veto
        >>>
        >>> # Initialize Veto (loads config from ./veto automatically)
        >>> veto = await Veto.init()
        >>>
        >>> # Wrap your tools
        >>> wrapped_tools = veto.wrap(my_tools)
        >>>
        >>> # Pass to AI provider, validation is automatic
    """

    def __init__(
        self,
        options: VetoOptions,
        config: VetoConfigFile,
        rules: LoadedRulesState,
        logger: Logger,
    ):
        self._logger = logger
        self._config_dir = options.config_dir or "./veto"
        self._rules = rules

        # Resolve mode (strict blocks, log only logs)
        self._mode: VetoMode = options.mode or config.mode or "strict"

        # Resolve validation mode (api or custom)
        self._validation_mode: ValidationMode = (
            config.validation.get("mode", "api") if config.validation else "api"
        )

        # Resolve API configuration from config file
        api_config = config.api or {}
        self._api_base_url = api_config.get(
            "baseUrl", "http://localhost:8080"
        ).rstrip("/")
        self._api_endpoint = api_config.get("endpoint", "/tool/call/check")
        self._api_timeout = api_config.get("timeout", 10000)
        self._api_retries = api_config.get("retries", 2)
        self._api_retry_delay = api_config.get("retryDelay", 1000)

        # Resolve custom provider configuration
        self._custom_config: Optional[CustomConfig] = None
        self._custom_client: Optional[CustomClient] = None
        if self._validation_mode == "custom" and config.custom:
            provider = config.custom.get("provider")
            model = config.custom.get("model")
            if provider and model:
                self._custom_config = CustomConfig(
                    provider=provider,
                    model=model,
                    api_key=config.custom.get("apiKey"),
                    temperature=config.custom.get("temperature"),
                    max_tokens=config.custom.get("maxTokens"),
                    timeout=config.custom.get("timeout"),
                    base_url=config.custom.get("baseUrl"),
                )

        # Resolve tracking options
        self._session_id = options.session_id or os.environ.get(
            "VETO_SESSION_ID"
        )
        self._agent_id = options.agent_id or os.environ.get("VETO_AGENT_ID")

        self._logger.info(
            "Veto configuration loaded",
            {
                "config_dir": self._config_dir,
                "mode": self._mode,
                "validation_mode": self._validation_mode,
                "api_url": (
                    f"{self._api_base_url}{self._api_endpoint}"
                    if self._validation_mode == "api"
                    else None
                ),
                "custom_provider": (
                    self._custom_config.provider if self._custom_config else None
                ),
                "custom_model": (
                    self._custom_config.model if self._custom_config else None
                ),
                "rules_loaded": len(rules.all_rules),
            },
        )

        # Initialize validation engine
        from veto.core.validator import ValidationEngineOptions
        default_decision = "allow"
        self._validation_engine = ValidationEngine(
            ValidationEngineOptions(logger=self._logger, default_decision=default_decision)
        )

        # Add the rule validator based on validation mode
        async def validate_with_rules(
            ctx: ValidationContext,
        ) -> ValidationResult:
            if self._validation_mode == "custom":
                return await self._validate_with_custom(ctx)
            else:
                return await self._validate_with_api(ctx)

        self._validation_engine.add_validator(
            NamedValidator(
                name="veto-rule-validator",
                description=(
                    f"Validates tool calls via {self._custom_config.provider if self._custom_config else 'custom'} LLM"
                    if self._validation_mode == "custom"
                    else "Validates tool calls via external API"
                ),
                priority=50,
                validate=validate_with_rules,
            )
        )

        # Add any additional validators
        if options.validators:
            self._validation_engine.add_validators(options.validators)

        # Initialize history tracker
        self._history_tracker = HistoryTracker(
            HistoryTrackerOptions(max_size=100, logger=self._logger)
        )

        # Initialize interceptor
        self._interceptor = Interceptor(
            InterceptorOptions(
                logger=self._logger,
                validation_engine=self._validation_engine,
                history_tracker=self._history_tracker,
            )
        )

        self._logger.info("Veto initialized successfully")

    @classmethod
    async def init(cls, options: Optional[VetoOptions] = None) -> "Veto":
        """
        Initialize Veto by loading configuration and rules.

        Args:
            options: Initialization options

        Returns:
            Initialized Veto instance

        Example:
            >>> # Use defaults (loads from ./veto)
            >>> veto = await Veto.init()
            >>>
            >>> # Custom config directory
            >>> veto = await Veto.init(VetoOptions(config_dir='./my-veto-config'))
        """
        options = options or VetoOptions()
        config_dir = Path(options.config_dir or "./veto").resolve()

        # Determine log level
        env_log_level = os.environ.get("VETO_LOG_LEVEL")
        log_level: LogLevel = (
            options.log_level
            or (env_log_level if env_log_level in ("debug", "info", "warn", "error", "silent") else None)  # type: ignore[assignment]
            or "info"
        )

        # Load config file
        config_path = config_dir / "veto.config.yaml"
        config = VetoConfigFile()

        if config_path.exists():
            with open(config_path, "r") as f:
                parsed = yaml.safe_load(f)
                if parsed:
                    config = VetoConfigFile(
                        version=parsed.get("version"),
                        mode=parsed.get("mode"),
                        validation=parsed.get("validation"),
                        api=parsed.get("api"),
                        custom=parsed.get("custom"),
                        logging=parsed.get("logging"),
                        rules=parsed.get("rules"),
                    )
                    config_log_level = (
                        config.logging.get("level")
                        if config.logging
                        else None
                    )
                    if options.log_level:
                        log_level = options.log_level
                    elif env_log_level in ("debug", "info", "warn", "error", "silent"):
                        log_level = env_log_level  # type: ignore[assignment]
                    elif config_log_level in ("debug", "info", "warn", "error", "silent"):
                        log_level = config_log_level
                    else:
                        log_level = "info"

        logger = create_logger(log_level)

        if not config_path.exists():
            logger.warn(
                "Veto config not found. Run 'veto init' to initialize.",
                {"expected": str(config_path)},
            )

        # Load rules
        rules_dir = config_dir / (
            config.rules.get("directory", "./rules")
            if config.rules
            else "./rules"
        )
        recursive = config.rules.get("recursive", True) if config.rules else True
        rules = cls._load_rules(rules_dir, recursive, logger)

        return cls(options, config, rules, logger)

    @classmethod
    def _load_rules(
        cls, rules_dir: Path, recursive: bool, logger: Logger
    ) -> LoadedRulesState:
        """Load rules from YAML files."""
        state = LoadedRulesState()

        if not rules_dir.exists():
            logger.debug("Rules directory not found", {"path": str(rules_dir)})
            return state

        yaml_files = cls._find_yaml_files(rules_dir, recursive)
        logger.debug("Found rule files", {"count": len(yaml_files)})

        for file_path in yaml_files:
            try:
                with open(file_path, "r") as f:
                    parsed = yaml.safe_load(f)

                rules: list[Rule] = []

                if isinstance(parsed, list):
                    rules = [cls._parse_rule(r) for r in parsed]
                elif isinstance(parsed, dict) and "rules" in parsed:
                    rules = [cls._parse_rule(r) for r in parsed.get("rules", [])]
                elif isinstance(parsed, dict) and "id" in parsed:
                    rules = [cls._parse_rule(parsed)]

                # Process and index rules
                for rule in rules:
                    if not rule.enabled:
                        continue

                    state.all_rules.append(rule)

                    if not rule.tools or len(rule.tools) == 0:
                        state.global_rules.append(rule)
                    else:
                        for tool_name in rule.tools:
                            if tool_name not in state.rules_by_tool:
                                state.rules_by_tool[tool_name] = []
                            state.rules_by_tool[tool_name].append(rule)

                logger.debug(
                    "Loaded rules from file",
                    {"path": str(file_path), "count": len(rules)},
                )
            except Exception as error:
                logger.error(
                    "Failed to load rules file",
                    {"path": str(file_path)},
                    error if isinstance(error, Exception) else None,
                )

        logger.info(
            "Rules loaded",
            {
                "total": len(state.all_rules),
                "global": len(state.global_rules),
                "tool_specific": len(state.rules_by_tool),
            },
        )

        return state

    @classmethod
    def _parse_rule(cls, data: dict[str, Any]) -> Rule:
        """Parse a rule from YAML data."""
        conditions = None
        if "conditions" in data:
            conditions = [
                RuleCondition(
                    field=c.get("field", ""),
                    operator=c.get("operator", "equals"),
                    value=c.get("value"),
                )
                for c in data.get("conditions", [])
            ]

        condition_groups = None
        if "condition_groups" in data:
            condition_groups = [
                [
                    RuleCondition(
                        field=c.get("field", ""),
                        operator=c.get("operator", "equals"),
                        value=c.get("value"),
                    )
                    for c in group
                ]
                for group in data.get("condition_groups", [])
            ]

        return Rule(
            id=data.get("id", ""),
            name=data.get("name", ""),
            enabled=data.get("enabled", True),
            severity=data.get("severity", "medium"),
            action=data.get("action", "block"),
            description=data.get("description"),
            tools=data.get("tools"),
            conditions=conditions,
            condition_groups=condition_groups,
            tags=data.get("tags"),
            metadata=data.get("metadata"),
        )

    @classmethod
    def _find_yaml_files(cls, directory: Path, recursive: bool) -> list[Path]:
        """Find YAML files in a directory."""
        files: list[Path] = []

        try:
            for entry in directory.iterdir():
                if entry.is_dir() and recursive:
                    files.extend(cls._find_yaml_files(entry, recursive))
                elif entry.is_file():
                    if entry.suffix.lower() in (".yaml", ".yml"):
                        files.append(entry)
        except Exception:
            # Directory doesn't exist or not readable
            pass

        return files

    def _get_rules_for_tool(self, tool_name: str) -> list[Rule]:
        """Get rules applicable to a tool."""
        tool_specific = self._rules.rules_by_tool.get(tool_name, [])
        return [*self._rules.global_rules, *tool_specific]

    async def _validate_with_api(
        self, context: ValidationContext
    ) -> ValidationResult:
        """Validate a tool call with the external API."""
        rules = self._get_rules_for_tool(context.tool_name)

        # If no rules, allow by default
        if len(rules) == 0:
            self._logger.debug(
                "No rules for tool, allowing", {"tool": context.tool_name}
            )
            return ValidationResult(decision="allow")

        # Build API request
        api_context = ToolCallContext(
            call_id=context.call_id,
            tool_name=context.tool_name,
            arguments=context.arguments,
            timestamp=context.timestamp.isoformat(),
            session_id=self._session_id,
            agent_id=self._agent_id,
            call_history=self._build_history_summary(context.call_history),
            custom=context.custom,
        )

        url = f"{self._api_base_url}{self._api_endpoint}"

        # Make API call with retries
        last_error: Optional[Exception] = None

        for attempt in range(self._api_retries + 1):
            try:
                response = await self._make_api_request(url, api_context, rules)
                return self._handle_api_response(response, context)
            except Exception as error:
                last_error = error if isinstance(error, Exception) else Exception(str(error))

                if attempt < self._api_retries:
                    self._logger.warn(
                        "API request failed, retrying",
                        {"attempt": attempt + 1, "error": str(last_error)},
                    )
                    await asyncio.sleep(self._api_retry_delay / 1000)

        # All retries failed - use fail mode
        return self._handle_api_failure(
            str(last_error) if last_error else "API unavailable"
        )

    async def _make_api_request(
        self,
        url: str,
        context: ToolCallContext,
        rules: list[Rule],
    ) -> ValidationAPIResponse:
        """Make the API request."""
        import aiohttp

        timeout = aiohttp.ClientTimeout(total=self._api_timeout / 1000)

        # Convert dataclasses to dicts for JSON serialization
        context_dict = {
            "call_id": context.call_id,
            "tool_name": context.tool_name,
            "arguments": context.arguments,
            "timestamp": context.timestamp,
            "session_id": context.session_id,
            "agent_id": context.agent_id,
            "call_history": (
                [
                    {
                        "tool_name": h.tool_name,
                        "allowed": h.allowed,
                        "timestamp": h.timestamp,
                    }
                    for h in context.call_history
                ]
                if context.call_history
                else None
            ),
            "custom": context.custom,
        }

        rules_list = [
            {
                "id": r.id,
                "name": r.name,
                "enabled": r.enabled,
                "severity": r.severity,
                "action": r.action,
                "description": r.description,
                "tools": r.tools,
                "conditions": (
                    [
                        {
                            "field": c.field,
                            "operator": c.operator,
                            "value": c.value,
                        }
                        for c in r.conditions
                    ]
                    if r.conditions
                    else None
                ),
            }
            for r in rules
        ]

        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                url,
                json={"context": context_dict, "rules": rules_list},
                headers={"Content-Type": "application/json"},
            ) as response:
                if not response.ok:
                    raise Exception(f"API returned status {response.status}")

                data = await response.json()

                # Validate response
                if data.get("decision") not in ("pass", "block"):
                    raise Exception("Invalid API response: missing decision")

                return ValidationAPIResponse(
                    should_pass_weight=data.get("should_pass_weight", 0),
                    should_block_weight=data.get("should_block_weight", 0),
                    decision=data["decision"],
                    reasoning=data.get("reasoning", ""),
                    matched_rules=data.get("matched_rules"),
                    metadata=data.get("metadata"),
                )

    def _handle_api_response(
        self,
        response: ValidationAPIResponse,
        context: ValidationContext,
    ) -> ValidationResult:
        """Handle successful API response."""
        metadata = {
            "should_pass_weight": response.should_pass_weight,
            "should_block_weight": response.should_block_weight,
            "matched_rules": response.matched_rules,
        }

        if response.decision == "pass":
            self._logger.debug(
                "API allowed tool call",
                {
                    "tool": context.tool_name,
                    "pass_weight": response.should_pass_weight,
                },
            )

            return ValidationResult(
                decision="allow",
                reason=response.reasoning,
                metadata=metadata,
            )
        else:
            # API returned block decision
            if self._mode == "log":
                # Log mode: log the block but allow the call
                self._logger.warn(
                    "Tool call would be blocked (log mode)",
                    {
                        "tool": context.tool_name,
                        "block_weight": response.should_block_weight,
                        "reason": response.reasoning,
                    },
                )

                return ValidationResult(
                    decision="allow",
                    reason=f"[LOG MODE] Would block: {response.reasoning}",
                    metadata={**metadata, "blocked_in_strict_mode": True},
                )
            else:
                # Strict mode: actually block the call
                self._logger.warn(
                    "Tool call blocked",
                    {
                        "tool": context.tool_name,
                        "block_weight": response.should_block_weight,
                        "reason": response.reasoning,
                    },
                )

                return ValidationResult(
                    decision="deny",
                    reason=response.reasoning,
                    metadata=metadata,
                )

    def _handle_api_failure(self, reason: str) -> ValidationResult:
        """Handle API failure. In log mode, always allow. In strict mode, block."""
        if self._mode == "log":
            self._logger.warn(
                "API unavailable (log mode, allowing)", {"reason": reason}
            )
            return ValidationResult(
                decision="allow",
                reason=f"API unavailable: {reason}",
                metadata={"api_error": True},
            )
        else:
            self._logger.error(
                "API unavailable (strict mode, blocking)", {"reason": reason}
            )
            return ValidationResult(
                decision="deny",
                reason=f"API unavailable: {reason}",
                metadata={"api_error": True},
            )

    def _get_custom_client(self) -> CustomClient:
        """Get or create the custom provider client."""
        if self._custom_client:
            return self._custom_client

        if not self._custom_config:
            raise ValueError(
                "Custom validation is not configured. "
                "Set validation.mode='custom' and provide custom.provider "
                "and custom.model in veto.config.yaml"
            )

        self._custom_client = CustomClient(
            CustomClientOptions(
                config=self._custom_config,
                logger=self._logger,
            )
        )

        return self._custom_client

    async def _validate_with_custom(
        self, context: ValidationContext
    ) -> ValidationResult:
        """Validate a tool call with custom LLM provider."""
        rules = self._get_rules_for_tool(context.tool_name)

        # If no rules, allow by default
        if len(rules) == 0:
            self._logger.debug(
                "No rules for tool, allowing", {"tool": context.tool_name}
            )
            return ValidationResult(decision="allow")

        tool_call = CustomToolCall(
            tool=context.tool_name,
            arguments=context.arguments,
        )

        try:
            custom_client = self._get_custom_client()
            response = await custom_client.evaluate(tool_call, rules)

            return self._handle_custom_response(response, context)
        except Exception as error:
            reason = str(error)
            return self._handle_custom_failure(reason)

    def _handle_custom_response(
        self,
        response: CustomResponse,
        context: ValidationContext,
    ) -> ValidationResult:
        """Handle successful custom provider response."""
        metadata = {
            "pass_weight": response.pass_weight,
            "block_weight": response.block_weight,
            "matched_rules": response.matched_rules,
        }

        if response.decision == "pass":
            self._logger.debug(
                "Custom provider allowed tool call",
                {
                    "tool": context.tool_name,
                    "pass_weight": response.pass_weight,
                },
            )

            return ValidationResult(
                decision="allow",
                reason=response.reasoning,
                metadata=metadata,
            )
        else:
            # Custom provider returned block decision
            if self._mode == "log":
                # Log mode: log the block but allow the call
                self._logger.warn(
                    "Tool call would be blocked (log mode)",
                    {
                        "tool": context.tool_name,
                        "block_weight": response.block_weight,
                        "reason": response.reasoning,
                    },
                )

                return ValidationResult(
                    decision="allow",
                    reason=f"[LOG MODE] Would block: {response.reasoning}",
                    metadata={**metadata, "blocked_in_strict_mode": True},
                )
            else:
                # Strict mode: actually block the call
                self._logger.warn(
                    "Tool call blocked by custom provider",
                    {
                        "tool": context.tool_name,
                        "block_weight": response.block_weight,
                        "reason": response.reasoning,
                    },
                )

                return ValidationResult(
                    decision="deny",
                    reason=response.reasoning,
                    metadata=metadata,
                )

    def _handle_custom_failure(self, reason: str) -> ValidationResult:
        """Handle custom provider failure."""
        if self._mode == "log":
            self._logger.warn(
                "Custom provider unavailable (log mode, allowing)",
                {"reason": reason},
            )
            return ValidationResult(
                decision="allow",
                reason=f"Custom provider unavailable: {reason}",
                metadata={"custom_provider_failed": True},
            )
        else:
            self._logger.error(
                "Custom provider unavailable (strict mode, blocking)",
                {"reason": reason},
            )
            return ValidationResult(
                decision="deny",
                reason=f"Custom provider unavailable: {reason}",
                metadata={"custom_provider_failed": True},
            )

    def _build_history_summary(
        self, history: list[ToolCallHistoryEntry]
    ) -> list[ToolCallHistorySummary]:
        """Build history summary for API."""
        return [
            ToolCallHistorySummary(
                tool_name=entry.tool_name,
                allowed=entry.validation_result.decision != "deny",
                timestamp=entry.timestamp.isoformat(),
            )
            for entry in history[-10:]
        ]

    def wrap(self, tools: list[T]) -> list[T]:
        """
        Wrap tools with Veto validation (provider-agnostic).

        This method accepts tools of any type and returns them with the same type,
        but with Veto validation injected into the execution function.
        Works with LangChain tools, custom tools, or any tool that has a callable function.

        Args:
            tools: Array of tools to wrap (LangChain, custom, etc.)

        Returns:
            The same tools with Veto validation injected

        Example:
            >>> from langchain.tools import tool
            >>> from veto import Veto
            >>>
            >>> @tool
            >>> def search(query: str) -> str:
            ...     return f"Results for: {query}"
            >>>
            >>> veto = await Veto.init()
            >>> wrapped_tools = veto.wrap([search])
        """
        return [self.wrap_tool(tool) for tool in tools]

    def wrap_tool(self, tool: T) -> T:
        """
        Wrap a single tool with Veto validation (provider-agnostic).

        Args:
            tool: The tool to wrap

        Returns:
            The same tool with Veto validation injected
        """
        tool_name = tool.name
        veto = self

        # For LangChain tools, we need to wrap the 'func' property
        if hasattr(tool, "func") and callable(getattr(tool, "func")):
            original_func = getattr(tool, "func")

            async def wrapped_func(input_data: dict[str, Any]) -> Any:
                # Validate with Veto
                result = await veto._validate_tool_call(
                    ToolCall(
                        id=generate_tool_call_id(),
                        name=tool_name,
                        arguments=input_data,
                    )
                )

                if not result.allowed:
                    raise ToolCallDeniedError(
                        tool_name,
                        result.original_call.id or "",
                        result.validation_result,
                    )

                # Execute the original function with potentially modified arguments
                final_args = result.final_arguments or input_data
                if inspect.iscoroutinefunction(original_func):
                    return await original_func(final_args)
                return original_func(final_args)

            # Create a copy of the tool with the wrapped function
            # This is a bit tricky in Python - we need to handle different tool types
            try:
                import copy

                wrapped = copy.copy(tool)
                object.__setattr__(wrapped, "func", wrapped_func)

                # Also wrap invoke if it exists
                if hasattr(tool, "invoke"):
                    original_invoke = getattr(tool, "invoke")

                    async def wrapped_invoke(
                        input_data: dict[str, Any], *args: Any, **kwargs: Any
                    ) -> Any:
                        # Validate with Veto first
                        result = await veto._validate_tool_call(
                            ToolCall(
                                id=generate_tool_call_id(),
                                name=tool_name,
                                arguments=input_data,
                            )
                        )

                        if not result.allowed:
                            raise ToolCallDeniedError(
                                tool_name,
                                result.original_call.id or "",
                                result.validation_result,
                            )

                        # Call original invoke with potentially modified arguments
                        final_args = result.final_arguments or input_data
                        if inspect.iscoroutinefunction(original_invoke):
                            return await original_invoke(final_args, *args, **kwargs)
                        return original_invoke(final_args, *args, **kwargs)

                    object.__setattr__(wrapped, "invoke", wrapped_invoke)

                veto._logger.debug("Tool wrapped", {"name": tool_name})
                return wrapped
            except Exception:
                pass

        # Fallback for other tool types (handler, run, execute, etc.)
        exec_function_keys = ["handler", "run", "execute", "call", "_call"]

        for key in exec_function_keys:
            if hasattr(tool, key) and callable(getattr(tool, key)):
                original_func = getattr(tool, key)

                async def make_wrapped(orig_fn: Any, fn_key: str) -> Any:
                    async def wrapped_fn(*args: Any, **kwargs: Any) -> Any:
                        # Determine call args
                        if len(args) == 1 and isinstance(args[0], dict):
                            call_args = args[0]
                        elif kwargs:
                            call_args = kwargs
                        else:
                            call_args = {"args": args}

                        result = await veto._validate_tool_call(
                            ToolCall(
                                id=generate_tool_call_id(),
                                name=tool_name,
                                arguments=call_args,
                            )
                        )

                        if not result.allowed:
                            raise ToolCallDeniedError(
                                tool_name,
                                result.original_call.id or "",
                                result.validation_result,
                            )

                        final_args = result.final_arguments or call_args
                        if len(args) == 1 and isinstance(args[0], dict):
                            if inspect.iscoroutinefunction(orig_fn):
                                return await orig_fn(final_args)
                            return orig_fn(final_args)
                        if inspect.iscoroutinefunction(orig_fn):
                            return await orig_fn(*args, **kwargs)
                        return orig_fn(*args, **kwargs)

                    return wrapped_fn

                try:
                    import copy

                    wrapped = copy.copy(tool)
                    # We need to create the wrapped function synchronously
                    # so we'll use a closure approach

                    def create_wrapper(orig: Any) -> Any:
                        async def wrapper(*args: Any, **kwargs: Any) -> Any:
                            if len(args) == 1 and isinstance(args[0], dict):
                                call_args = args[0]
                            elif kwargs:
                                call_args = kwargs
                            else:
                                call_args = {"args": args}

                            result = await veto._validate_tool_call(
                                ToolCall(
                                    id=generate_tool_call_id(),
                                    name=tool_name,
                                    arguments=call_args,
                                )
                            )

                            if not result.allowed:
                                raise ToolCallDeniedError(
                                    tool_name,
                                    result.original_call.id or "",
                                    result.validation_result,
                                )

                            final_args = result.final_arguments or call_args
                            if len(args) == 1 and isinstance(args[0], dict):
                                if inspect.iscoroutinefunction(orig):
                                    return await orig(final_args)
                                return orig(final_args)
                            if inspect.iscoroutinefunction(orig):
                                return await orig(*args, **kwargs)
                            return orig(*args, **kwargs)

                        return wrapper

                    object.__setattr__(wrapped, key, create_wrapper(original_func))
                    veto._logger.debug("Tool wrapped", {"name": tool_name})
                    return wrapped
                except Exception:
                    pass

        # No wrappable function found, return as-is
        veto._logger.warn(
            "No wrappable function found on tool", {"name": tool_name}
        )
        return tool

    async def _validate_tool_call(self, call: ToolCall) -> InterceptionResult:
        """Validate a tool call."""
        normalized_call = ToolCall(
            id=call.id or generate_tool_call_id(),
            name=call.name,
            arguments=call.arguments,
            raw_arguments=call.raw_arguments,
        )

        return await self._interceptor.intercept(normalized_call)

    def get_history_stats(self) -> HistoryStats:
        """Get history statistics."""
        return self._history_tracker.get_stats()

    def clear_history(self) -> None:
        """Clear call history."""
        self._history_tracker.clear()


# Re-export error class
__all__ = [
    "Veto",
    "ToolCallDeniedError",
    "VetoOptions",
    "VetoMode",
    "ValidationMode",
    "WrappedTools",
    "WrappedHandler",
]
