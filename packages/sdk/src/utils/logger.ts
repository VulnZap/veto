/**
 * Logging infrastructure for Veto.
 *
 * Provides a flexible logging system with configurable log levels
 * and support for custom logger implementations.
 *
 * @module utils/logger
 */

import type { LogLevel } from '../types/config.js';

/**
 * Log entry structure for structured logging.
 */
export interface LogEntry {
  /** Log level of this entry */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Timestamp of the log entry */
  timestamp: Date;
  /** Additional context data */
  context?: Record<string, unknown>;
  /** Error object if applicable */
  error?: Error;
}

/**
 * Logger interface that can be implemented for custom logging.
 *
 * @example
 * ```typescript
 * const customLogger: Logger = {
 *   debug: (msg, ctx) => myLoggingService.log('debug', msg, ctx),
 *   info: (msg, ctx) => myLoggingService.log('info', msg, ctx),
 *   warn: (msg, ctx) => myLoggingService.log('warn', msg, ctx),
 *   error: (msg, ctx, err) => myLoggingService.log('error', msg, { ...ctx, err }),
 * };
 * ```
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>, error?: Error): void;
}

/**
 * Numeric priority for log levels (lower = more verbose).
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Check if a log level should be emitted given the configured level.
 */
function shouldLog(messageLevel: LogLevel, configuredLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[messageLevel] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

/**
 * Format a log message with optional context.
 */
function formatMessage(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);
  const prefix = `[${timestamp}] [VETO] ${levelStr}`;

  if (context && Object.keys(context).length > 0) {
    const contextStr = JSON.stringify(context);
    return `${prefix} ${message} ${contextStr}`;
  }

  return `${prefix} ${message}`;
}

/**
 * Create a console-based logger with the specified log level.
 *
 * @param level - Minimum log level to emit
 * @returns Logger instance
 *
 * @example
 * ```typescript
 * const logger = createLogger('info');
 * logger.debug('This will not be logged');
 * logger.info('This will be logged');
 * ```
 */
export function createLogger(level: LogLevel): Logger {
  return {
    debug(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('debug', level)) {
        console.debug(formatMessage('debug', message, context));
      }
    },

    info(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('info', level)) {
        console.info(formatMessage('info', message, context));
      }
    },

    warn(message: string, context?: Record<string, unknown>): void {
      if (shouldLog('warn', level)) {
        console.warn(formatMessage('warn', message, context));
      }
    },

    error(
      message: string,
      context?: Record<string, unknown>,
      error?: Error
    ): void {
      if (shouldLog('error', level)) {
        console.error(formatMessage('error', message, context));
        if (error) {
          console.error(error);
        }
      }
    },
  };
}

/**
 * A no-op logger that discards all messages.
 * Useful for testing or when logging should be completely disabled.
 */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Create a logger that stores entries in memory.
 * Useful for testing or capturing logs for later analysis.
 *
 * @param level - Minimum log level to capture
 * @returns Object containing the logger and captured entries
 *
 * @example
 * ```typescript
 * const { logger, entries } = createMemoryLogger('debug');
 * logger.info('test message', { key: 'value' });
 * console.log(entries); // [{ level: 'info', message: 'test message', ... }]
 * ```
 */
export function createMemoryLogger(level: LogLevel = 'debug'): {
  logger: Logger;
  entries: LogEntry[];
  clear: () => void;
} {
  const entries: LogEntry[] = [];

  const addEntry = (
    messageLevel: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void => {
    if (shouldLog(messageLevel, level)) {
      entries.push({
        level: messageLevel,
        message,
        timestamp: new Date(),
        context,
        error,
      });
    }
  };

  return {
    entries,
    clear: () => {
      entries.length = 0;
    },
    logger: {
      debug: (message, context) => addEntry('debug', message, context),
      info: (message, context) => addEntry('info', message, context),
      warn: (message, context) => addEntry('warn', message, context),
      error: (message, context, error) =>
        addEntry('error', message, context, error),
    },
  };
}

/**
 * Create a child logger with additional default context.
 *
 * @param parent - Parent logger to wrap
 * @param defaultContext - Context to include in all log entries
 * @returns Logger with merged context
 *
 * @example
 * ```typescript
 * const parentLogger = createLogger('info');
 * const childLogger = createChildLogger(parentLogger, { component: 'validator' });
 * childLogger.info('Validation complete'); // Includes { component: 'validator' }
 * ```
 */
export function createChildLogger(
  parent: Logger,
  defaultContext: Record<string, unknown>
): Logger {
  const mergeContext = (
    context?: Record<string, unknown>
  ): Record<string, unknown> => {
    return { ...defaultContext, ...context };
  };

  return {
    debug: (message, context) => parent.debug(message, mergeContext(context)),
    info: (message, context) => parent.info(message, mergeContext(context)),
    warn: (message, context) => parent.warn(message, mergeContext(context)),
    error: (message, context, error) =>
      parent.error(message, mergeContext(context), error),
  };
}
