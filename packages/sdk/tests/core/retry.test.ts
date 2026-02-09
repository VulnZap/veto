import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  isRetriable,
  computeDelay,
  DEFAULT_RETRY_CONFIG,
} from '../../src/core/retry.js';
import { ValidationAPIError } from '../../src/rules/api-client.js';

const mockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const noSleep = async () => {};

describe('isRetriable', () => {
  it('returns true for generic errors', () => {
    expect(isRetriable(new Error('network error'))).toBe(true);
  });

  it('returns true for non-Error values', () => {
    expect(isRetriable('string error')).toBe(true);
  });

  it('returns true for 429 Too Many Requests', () => {
    expect(isRetriable(new ValidationAPIError('rate limited', 429))).toBe(true);
  });

  it('returns true for 500 Internal Server Error', () => {
    expect(isRetriable(new ValidationAPIError('server error', 500))).toBe(true);
  });

  it('returns true for 502 Bad Gateway', () => {
    expect(isRetriable(new ValidationAPIError('bad gateway', 502))).toBe(true);
  });

  it('returns true for 503 Service Unavailable', () => {
    expect(isRetriable(new ValidationAPIError('unavailable', 503))).toBe(true);
  });

  it('returns false for 400 Bad Request', () => {
    expect(isRetriable(new ValidationAPIError('bad request', 400))).toBe(false);
  });

  it('returns false for 401 Unauthorized', () => {
    expect(isRetriable(new ValidationAPIError('unauthorized', 401))).toBe(false);
  });

  it('returns false for 403 Forbidden', () => {
    expect(isRetriable(new ValidationAPIError('forbidden', 403))).toBe(false);
  });

  it('returns false for 404 Not Found', () => {
    expect(isRetriable(new ValidationAPIError('not found', 404))).toBe(false);
  });

  it('returns false for 422 Unprocessable Entity', () => {
    expect(isRetriable(new ValidationAPIError('unprocessable', 422))).toBe(false);
  });
});

describe('computeDelay', () => {
  it('increases exponentially', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 100, maxDelayMs: 10000 };
    const fixedJitter = () => 1;

    const d0 = computeDelay(0, config, fixedJitter);
    const d1 = computeDelay(1, config, fixedJitter);
    const d2 = computeDelay(2, config, fixedJitter);

    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
  });

  it('caps at maxDelayMs', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 100, maxDelayMs: 500 };
    const fixedJitter = () => 1;

    const d10 = computeDelay(10, config, fixedJitter);
    expect(d10).toBe(500);
  });

  it('applies jitter between 0.5x and 1x of exponential', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 100, maxDelayMs: 10000 };

    const minDelay = computeDelay(0, config, () => 0);
    const maxDelay = computeDelay(0, config, () => 1);

    expect(minDelay).toBe(50);
    expect(maxDelay).toBe(100);
  });
});

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, {}, mockLogger(), noSleep);

    expect(result.value).toBe('ok');
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retriable failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3 }, mockLogger(), noSleep);

    expect(result.value).toBe('ok');
    expect(result.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(fn, { maxAttempts: 3 }, mockLogger(), noSleep)
    ).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retriable errors', async () => {
    const fn = vi.fn()
      .mockRejectedValue(new ValidationAPIError('bad request', 400));

    await expect(
      withRetry(fn, { maxAttempts: 3 }, mockLogger(), noSleep)
    ).rejects.toThrow('bad request');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry 401 errors', async () => {
    const fn = vi.fn()
      .mockRejectedValue(new ValidationAPIError('unauthorized', 401));

    await expect(
      withRetry(fn, { maxAttempts: 3 }, mockLogger(), noSleep)
    ).rejects.toThrow('unauthorized');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries 429 errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new ValidationAPIError('rate limited', 429))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3 }, mockLogger(), noSleep);

    expect(result.value).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries 500 errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new ValidationAPIError('server error', 500))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3 }, mockLogger(), noSleep);

    expect(result.value).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('calls sleep between retries with computed delay', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    await withRetry(
      fn,
      { maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 5000 },
      mockLogger(),
      sleepFn,
      () => 1
    );

    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledWith(100);
  });

  it('uses default config when no overrides provided', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(
      withRetry(fn, {}, mockLogger(), noSleep)
    ).rejects.toThrow('fail');

    expect(fn).toHaveBeenCalledTimes(DEFAULT_RETRY_CONFIG.maxAttempts);
  });

  it('logs retry attempts', async () => {
    const logger = mockLogger();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    await withRetry(fn, { maxAttempts: 2 }, logger, noSleep);

    expect(logger.debug).toHaveBeenCalledWith(
      'Retrying after failure',
      expect.objectContaining({ attempt: 1 })
    );
  });

  it('logs non-retriable skip', async () => {
    const logger = mockLogger();
    const fn = vi.fn()
      .mockRejectedValue(new ValidationAPIError('bad', 400));

    await expect(
      withRetry(fn, { maxAttempts: 3 }, logger, noSleep)
    ).rejects.toThrow();

    expect(logger.debug).toHaveBeenCalledWith(
      'Non-retriable error, skipping retry',
      expect.objectContaining({ statusCode: 400 })
    );
  });
});
