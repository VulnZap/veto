/**
 * Structured error classes for CLI commands.
 * 
 * These errors replace direct process.exit() calls, making the CLI
 * testable and reusable as a library.
 * 
 * @module errors
 */

/**
 * Base class for all CLI errors.
 * Contains an exit code that the main CLI entry point uses.
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1
  ) {
    super(message);
    this.name = 'CLIError';
    Object.setPrototypeOf(this, CLIError.prototype);
  }
}

/**
 * Configuration-related errors (invalid config, missing files, etc.)
 */
export class ConfigError extends CLIError {
  constructor(message: string, exitCode: number = 1) {
    super(message, exitCode);
    this.name = 'ConfigError';
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/**
 * Resource not found errors (file, directory, etc.)
 */
export class NotFoundError extends CLIError {
  constructor(message: string, exitCode: number = 1) {
    super(message, exitCode);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Validation errors (invalid input, schema validation, etc.)
 */
export class ValidationError extends CLIError {
  constructor(message: string, exitCode: number = 1) {
    super(message, exitCode);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Agent/AI-related errors (policy violations, hook failures, etc.)
 */
export class AgentError extends CLIError {
  constructor(message: string, exitCode: number = 1) {
    super(message, exitCode);
    this.name = 'AgentError';
    Object.setPrototypeOf(this, AgentError.prototype);
  }
}

/**
 * Network/API errors (cloud sync, remote validation, etc.)
 */
export class NetworkError extends CLIError {
  constructor(message: string, exitCode: number = 1) {
    super(message, exitCode);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}
