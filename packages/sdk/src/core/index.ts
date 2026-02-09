/**
 * Core module exports for Veto.
 *
 * @module core
 */

export { Veto, ToolCallDeniedError, type VetoOptions } from './veto.js';
export {
  ValidationEngine,
  createPassthroughValidator,
  createBlocklistValidator,
  createAllowlistValidator,
  type ValidationEngineOptions,
  type AggregatedValidationResult,
} from './validator.js';
export {
  HistoryTracker,
  type HistoryTrackerOptions,
  type HistoryStats,
} from './history.js';
export {
  Interceptor,
  type InterceptorOptions,
  type InterceptionResult,
} from './interceptor.js';
export {
  CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitState,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './circuit-breaker.js';
export {
  withRetry,
  isRetriable,
  computeDelay,
  type RetryConfig,
  type RetryResult,
  DEFAULT_RETRY_CONFIG,
} from './retry.js';
