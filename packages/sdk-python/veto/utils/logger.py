"""
Logging infrastructure for Veto.

Provides a flexible logging system with configurable log levels
and support for custom logger implementations.
"""

from typing import Any, Callable, Optional, Protocol
from dataclasses import dataclass
from datetime import datetime

from veto.types.config import LogLevel


@dataclass
class LogEntry:
    """Log entry structure for structured logging."""

    level: LogLevel
    message: str
    timestamp: datetime
    context: Optional[dict[str, Any]] = None
    error: Optional[Exception] = None


class Logger(Protocol):
    """
    Logger interface that can be implemented for custom logging.

    Example:
        >>> class MyLogger:
        ...     def debug(self, msg, ctx=None): my_service.log('debug', msg, ctx)
        ...     def info(self, msg, ctx=None): my_service.log('info', msg, ctx)
        ...     def warn(self, msg, ctx=None): my_service.log('warn', msg, ctx)
        ...     def error(self, msg, ctx=None, err=None): my_service.log('error', msg, ctx)
    """

    def debug(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None: ...

    def info(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None: ...

    def warn(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None: ...

    def error(
        self,
        message: str,
        context: Optional[dict[str, Any]] = None,
        error: Optional[Exception] = None,
    ) -> None: ...


# Numeric priority for log levels (lower = more verbose)
LOG_LEVEL_PRIORITY: dict[LogLevel, int] = {
    "debug": 0,
    "info": 1,
    "warn": 2,
    "error": 3,
    "silent": 4,
}


def should_log(message_level: LogLevel, configured_level: LogLevel) -> bool:
    """Check if a log level should be emitted given the configured level."""
    return LOG_LEVEL_PRIORITY[message_level] >= LOG_LEVEL_PRIORITY[configured_level]


def format_message(
    level: LogLevel,
    message: str,
    context: Optional[dict[str, Any]] = None,
) -> str:
    """Format a log message with optional context."""
    import json

    timestamp = datetime.now().isoformat()
    level_str = level.upper().ljust(5)
    prefix = f"[{timestamp}] [VETO] {level_str}"

    if context and len(context) > 0:
        context_str = json.dumps(context)
        return f"{prefix} {message} {context_str}"

    return f"{prefix} {message}"


class ConsoleLogger:
    """Console-based logger implementation."""

    def __init__(self, level: LogLevel):
        self.level = level

    def debug(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        if should_log("debug", self.level):
            print(format_message("debug", message, context))

    def info(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        if should_log("info", self.level):
            print(format_message("info", message, context))

    def warn(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        if should_log("warn", self.level):
            print(format_message("warn", message, context))

    def error(
        self,
        message: str,
        context: Optional[dict[str, Any]] = None,
        error: Optional[Exception] = None,
    ) -> None:
        if should_log("error", self.level):
            print(format_message("error", message, context))
            if error:
                print(error)


def create_logger(level: LogLevel) -> Logger:
    """
    Create a console-based logger with the specified log level.

    Args:
        level: Minimum log level to emit

    Returns:
        Logger instance

    Example:
        >>> logger = create_logger('info')
        >>> logger.debug('This will not be logged')
        >>> logger.info('This will be logged')
    """
    return ConsoleLogger(level)


class SilentLogger:
    """A no-op logger that discards all messages."""

    def debug(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        pass

    def info(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        pass

    def warn(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        pass

    def error(
        self,
        message: str,
        context: Optional[dict[str, Any]] = None,
        error: Optional[Exception] = None,
    ) -> None:
        pass


# Silent logger singleton
silent_logger: Logger = SilentLogger()


class MemoryLogger:
    """Logger that stores entries in memory."""

    def __init__(self, level: LogLevel = "debug"):
        self.level = level
        self.entries: list[LogEntry] = []

    def _add_entry(
        self,
        message_level: LogLevel,
        message: str,
        context: Optional[dict[str, Any]] = None,
        error: Optional[Exception] = None,
    ) -> None:
        if should_log(message_level, self.level):
            self.entries.append(
                LogEntry(
                    level=message_level,
                    message=message,
                    timestamp=datetime.now(),
                    context=context,
                    error=error,
                )
            )

    def debug(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        self._add_entry("debug", message, context)

    def info(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        self._add_entry("info", message, context)

    def warn(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        self._add_entry("warn", message, context)

    def error(
        self,
        message: str,
        context: Optional[dict[str, Any]] = None,
        error: Optional[Exception] = None,
    ) -> None:
        self._add_entry("error", message, context, error)

    def clear(self) -> None:
        self.entries.clear()


def create_memory_logger(
    level: LogLevel = "debug",
) -> tuple[Logger, list[LogEntry], Callable[[], None]]:
    """
    Create a logger that stores entries in memory.

    Useful for testing or capturing logs for later analysis.

    Args:
        level: Minimum log level to capture

    Returns:
        Tuple of (logger, entries list, clear function)

    Example:
        >>> logger, entries, clear = create_memory_logger('debug')
        >>> logger.info('test message', {'key': 'value'})
        >>> print(entries)  # [LogEntry(level='info', message='test message', ...)]
    """
    memory_logger = MemoryLogger(level)
    return memory_logger, memory_logger.entries, memory_logger.clear


class ChildLogger:
    """Logger with additional default context."""

    def __init__(self, parent: Logger, default_context: dict[str, Any]):
        self.parent = parent
        self.default_context = default_context

    def _merge_context(
        self, context: Optional[dict[str, Any]]
    ) -> dict[str, Any]:
        return {**self.default_context, **(context or {})}

    def debug(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        self.parent.debug(message, self._merge_context(context))

    def info(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        self.parent.info(message, self._merge_context(context))

    def warn(
        self, message: str, context: Optional[dict[str, Any]] = None
    ) -> None:
        self.parent.warn(message, self._merge_context(context))

    def error(
        self,
        message: str,
        context: Optional[dict[str, Any]] = None,
        error: Optional[Exception] = None,
    ) -> None:
        self.parent.error(message, self._merge_context(context), error)


def create_child_logger(
    parent: Logger, default_context: dict[str, Any]
) -> Logger:
    """
    Create a child logger with additional default context.

    Args:
        parent: Parent logger to wrap
        default_context: Context to include in all log entries

    Returns:
        Logger with merged context

    Example:
        >>> parent_logger = create_logger('info')
        >>> child_logger = create_child_logger(parent_logger, {'component': 'validator'})
        >>> child_logger.info('Validation complete')  # Includes {'component': 'validator'}
    """
    return ChildLogger(parent, default_context)
