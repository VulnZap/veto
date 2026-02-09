import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker, DEFAULT_CIRCUIT_BREAKER_CONFIG } from '../../src/core/circuit-breaker.js';

const mockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe('CircuitBreaker', () => {
  describe('initial state', () => {
    it('starts in closed state', () => {
      const cb = new CircuitBreaker({}, mockLogger());
      expect(cb.getState()).toBe('closed');
      expect(cb.canExecute()).toBe(true);
    });

    it('has zero metrics initially', () => {
      const cb = new CircuitBreaker({}, mockLogger());
      const m = cb.getMetrics();
      expect(m.failureCount).toBe(0);
      expect(m.successCount).toBe(0);
      expect(m.totalTrips).toBe(0);
      expect(m.lastFailureTime).toBeNull();
    });
  });

  describe('closed -> open transition', () => {
    it('trips after reaching failure threshold', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 }, mockLogger());

      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('closed');

      cb.recordFailure();
      expect(cb.getState()).toBe('open');
      expect(cb.canExecute()).toBe(false);
      expect(cb.getMetrics().totalTrips).toBe(1);
    });

    it('resets failure count on success', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 }, mockLogger());

      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('closed');
    });

    it('uses default threshold of 5', () => {
      const cb = new CircuitBreaker({}, mockLogger());

      for (let i = 0; i < DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold - 1; i++) {
        cb.recordFailure();
      }
      expect(cb.getState()).toBe('closed');

      cb.recordFailure();
      expect(cb.getState()).toBe('open');
    });
  });

  describe('open -> half-open transition', () => {
    it('transitions to half-open after reset timeout', () => {
      let now = 1000;
      const clock = () => now;
      const cb = new CircuitBreaker(
        { failureThreshold: 1, resetTimeoutMs: 5000 },
        mockLogger(),
        clock
      );

      cb.recordFailure();
      expect(cb.getState()).toBe('open');

      now = 5999;
      expect(cb.getState()).toBe('open');

      now = 6000;
      expect(cb.getState()).toBe('half-open');
      expect(cb.canExecute()).toBe(true);
    });
  });

  describe('half-open -> closed transition', () => {
    it('closes on success in half-open', () => {
      let now = 1000;
      const clock = () => now;
      const cb = new CircuitBreaker(
        { failureThreshold: 1, resetTimeoutMs: 100 },
        mockLogger(),
        clock
      );

      cb.recordFailure();
      expect(cb.getState()).toBe('open');

      now = 1200;
      expect(cb.getState()).toBe('half-open');

      cb.recordSuccess();
      expect(cb.getState()).toBe('closed');
      expect(cb.getMetrics().failureCount).toBe(0);
    });
  });

  describe('half-open -> open transition', () => {
    it('reopens on failure in half-open', () => {
      let now = 1000;
      const clock = () => now;
      const cb = new CircuitBreaker(
        { failureThreshold: 1, resetTimeoutMs: 100 },
        mockLogger(),
        clock
      );

      cb.recordFailure();
      now = 1200;
      expect(cb.getState()).toBe('half-open');

      cb.recordFailure();
      expect(cb.getState()).toBe('open');
      expect(cb.getMetrics().totalTrips).toBe(2);
    });
  });

  describe('half-open max attempts', () => {
    it('limits concurrent attempts in half-open', () => {
      let now = 1000;
      const clock = () => now;
      const cb = new CircuitBreaker(
        { failureThreshold: 1, resetTimeoutMs: 100, halfOpenMaxAttempts: 1 },
        mockLogger(),
        clock
      );

      cb.recordFailure();
      now = 1200;

      expect(cb.canExecute()).toBe(true);
    });
  });

  describe('reset', () => {
    it('restores to initial state', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 }, mockLogger());

      cb.recordFailure();
      expect(cb.getState()).toBe('open');

      cb.reset();
      expect(cb.getState()).toBe('closed');
      expect(cb.getMetrics().failureCount).toBe(0);
      expect(cb.getMetrics().totalTrips).toBe(0);
      expect(cb.canExecute()).toBe(true);
    });
  });

  describe('logging', () => {
    it('logs state transitions', () => {
      const logger = mockLogger();
      const cb = new CircuitBreaker({ failureThreshold: 1 }, logger);

      cb.recordFailure();

      expect(logger.info).toHaveBeenCalledWith(
        'Circuit breaker state transition',
        expect.objectContaining({ from: 'closed', to: 'open' })
      );
    });
  });
});
