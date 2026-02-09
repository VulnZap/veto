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
      expect(m.halfOpenAttempts).toBe(0);
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
    it('limits concurrent attempts in half-open with beginAttempt', () => {
      let now = 1000;
      const clock = () => now;
      const cb = new CircuitBreaker(
        { failureThreshold: 1, resetTimeoutMs: 100, halfOpenMaxAttempts: 1 },
        mockLogger(),
        clock
      );

      cb.recordFailure();
      now = 1200;

      // First check passes (triggers transition to half-open)
      expect(cb.canExecute()).toBe(true);
      
      // Mark attempt started
      cb.beginAttempt();
      
      // Now at max attempts, should block
      expect(cb.canExecute()).toBe(false);
      expect(cb.getMetrics().halfOpenAttempts).toBe(1);
    });

    it('allows multiple attempts when halfOpenMaxAttempts > 1', () => {
      let now = 1000;
      const clock = () => now;
      const cb = new CircuitBreaker(
        { failureThreshold: 1, resetTimeoutMs: 100, halfOpenMaxAttempts: 3 },
        mockLogger(),
        clock
      );

      cb.recordFailure();
      now = 1200;

      // First attempt
      expect(cb.canExecute()).toBe(true);
      cb.beginAttempt();
      expect(cb.getMetrics().halfOpenAttempts).toBe(1);

      // Second attempt
      expect(cb.canExecute()).toBe(true);
      cb.beginAttempt();
      expect(cb.getMetrics().halfOpenAttempts).toBe(2);

      // Third attempt
      expect(cb.canExecute()).toBe(true);
      cb.beginAttempt();
      expect(cb.getMetrics().halfOpenAttempts).toBe(3);

      // Fourth attempt blocked
      expect(cb.canExecute()).toBe(false);
    });

    it('resets halfOpenAttempts on success', () => {
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
      cb.beginAttempt();
      expect(cb.canExecute()).toBe(false);

      // Success resets and closes circuit
      cb.recordSuccess();
      expect(cb.getState()).toBe('closed');
      expect(cb.getMetrics().halfOpenAttempts).toBe(0);
    });

    it('resets halfOpenAttempts when transitioning back to open', () => {
      let now = 1000;
      const clock = () => now;
      const cb = new CircuitBreaker(
        { failureThreshold: 1, resetTimeoutMs: 100, halfOpenMaxAttempts: 2 },
        mockLogger(),
        clock
      );

      cb.recordFailure();
      now = 1200;

      // Trigger transition to half-open and begin attempt
      expect(cb.canExecute()).toBe(true);
      cb.beginAttempt();
      expect(cb.getMetrics().halfOpenAttempts).toBe(1);

      // Failure in half-open transitions back to open
      cb.recordFailure();
      expect(cb.getState()).toBe('open');
      expect(cb.getMetrics().halfOpenAttempts).toBe(0);

      // Wait for reset timeout again
      now = 1400;
      expect(cb.getState()).toBe('half-open');
      expect(cb.canExecute()).toBe(true);
    });

    it('beginAttempt is no-op when not in half-open state', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 }, mockLogger());

      // In closed state
      cb.beginAttempt();
      expect(cb.getMetrics().halfOpenAttempts).toBe(0);

      // Trip to open
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('open');

      // In open state
      cb.beginAttempt();
      expect(cb.getMetrics().halfOpenAttempts).toBe(0);
    });

    it('enforces limit across simulated concurrent requests', () => {
      let now = 1000;
      const clock = () => now;
      const cb = new CircuitBreaker(
        { failureThreshold: 1, resetTimeoutMs: 100, halfOpenMaxAttempts: 2 },
        mockLogger(),
        clock
      );

      cb.recordFailure();
      now = 1200;

      // Simulate two concurrent requests checking and starting
      const req1CanExecute = cb.canExecute();
      cb.beginAttempt();
      
      const req2CanExecute = cb.canExecute();
      cb.beginAttempt();
      
      // Third request should be blocked
      const req3CanExecute = cb.canExecute();

      expect(req1CanExecute).toBe(true);
      expect(req2CanExecute).toBe(true);
      expect(req3CanExecute).toBe(false);
      expect(cb.getMetrics().halfOpenAttempts).toBe(2);
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
      expect(cb.getMetrics().halfOpenAttempts).toBe(0);
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

    it('logs half-open probe attempts', () => {
      let now = 1000;
      const clock = () => now;
      const logger = mockLogger();
      const cb = new CircuitBreaker(
        { failureThreshold: 1, resetTimeoutMs: 100, halfOpenMaxAttempts: 2 },
        logger,
        clock
      );

      cb.recordFailure();
      now = 1200;
      cb.getState(); // Trigger transition to half-open

      cb.beginAttempt();

      expect(logger.debug).toHaveBeenCalledWith(
        'Half-open probe attempt started',
        expect.objectContaining({ halfOpenAttempts: 1, halfOpenMaxAttempts: 2 })
      );
    });
  });
});
