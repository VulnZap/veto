import type { Logger } from '../utils/logger.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  totalTrips: number;
  halfOpenAttempts: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private halfOpenAttempts = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange: number;
  private totalTrips = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly logger: Logger;
  private readonly now: () => number;

  constructor(
    config: Partial<CircuitBreakerConfig>,
    logger: Logger,
    clock?: () => number
  ) {
    this.config = {
      failureThreshold: config.failureThreshold ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold,
      resetTimeoutMs: config.resetTimeoutMs ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs,
      halfOpenMaxAttempts: config.halfOpenMaxAttempts ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenMaxAttempts,
    };
    this.logger = logger;
    this.now = clock ?? Date.now;
    this.lastStateChange = this.now();
  }

  getState(): CircuitState {
    if (this.state === 'open' && this.shouldAttemptReset()) {
      this.transitionTo('half-open');
    }
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalTrips: this.totalTrips,
      halfOpenAttempts: this.halfOpenAttempts,
    };
  }

  canExecute(): boolean {
    const current = this.getState();
    if (current === 'closed') return true;
    if (current === 'half-open') {
      return this.halfOpenAttempts < this.config.halfOpenMaxAttempts;
    }
    return false;
  }

  /**
   * Mark that an attempt is starting in half-open state.
   * Call this after canExecute() returns true and before starting the request.
   * This enforces the halfOpenMaxAttempts limit for concurrency safety.
   */
  beginAttempt(): void {
    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
      this.logger.debug('Half-open probe attempt started', {
        halfOpenAttempts: this.halfOpenAttempts,
        halfOpenMaxAttempts: this.config.halfOpenMaxAttempts,
      });
    }
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      this.halfOpenAttempts = 0;
      this.transitionTo('closed');
      return;
    }
    this.successCount++;
    this.failureCount = 0;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = this.now();

    if (this.state === 'half-open') {
      this.transitionTo('open');
      return;
    }

    if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = null;
    this.totalTrips = 0;
    this.transitionTo('closed');
  }

  private shouldAttemptReset(): boolean {
    if (this.lastFailureTime === null) return false;
    return this.now() - this.lastFailureTime >= this.config.resetTimeoutMs;
  }

  private transitionTo(newState: CircuitState): void {
    const prev = this.state;
    if (prev === newState) return;

    this.state = newState;
    this.lastStateChange = this.now();

    if (newState === 'open') {
      this.totalTrips++;
      this.halfOpenAttempts = 0;
    }

    if (newState === 'half-open') {
      this.halfOpenAttempts = 0;
    }

    if (newState === 'closed') {
      this.failureCount = 0;
    }

    this.logger.info('Circuit breaker state transition', {
      from: prev,
      to: newState,
      failureCount: this.failureCount,
      totalTrips: this.totalTrips,
    });
  }
}
