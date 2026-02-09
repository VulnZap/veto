import type { Logger } from '../utils/logger.js';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
};

const NON_RETRIABLE_STATUS_CODES = new Set([400, 401, 403, 404, 422]);

export interface RetryableError extends Error {
  statusCode?: number;
}

export function isRetriable(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const statusCode = (error as RetryableError).statusCode;
  if (statusCode === undefined) return true;
  if (statusCode === 429) return true;
  if (NON_RETRIABLE_STATUS_CODES.has(statusCode)) return false;
  return true;
}

export function computeDelay(
  attempt: number,
  config: RetryConfig,
  jitter?: () => number
): number {
  const random = jitter ?? Math.random;
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const jittered = exponential * (0.5 + random() * 0.5);
  return Math.min(jittered, config.maxDelayMs);
}

export interface RetryResult<T> {
  value: T;
  attempts: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig>,
  logger: Logger,
  sleepFn?: (ms: number) => Promise<void>,
  jitterFn?: () => number
): Promise<RetryResult<T>> {
  const resolved: RetryConfig = {
    maxAttempts: config.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
    baseDelayMs: config.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs: config.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
  };
  const sleep = sleepFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < resolved.maxAttempts; attempt++) {
    try {
      const value = await fn();
      return { value, attempts: attempt + 1 };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetriable(error)) {
        logger.debug('Non-retriable error, skipping retry', {
          attempt: attempt + 1,
          statusCode: (error as RetryableError).statusCode,
        });
        throw lastError;
      }

      if (attempt < resolved.maxAttempts - 1) {
        const delay = computeDelay(attempt, resolved, jitterFn);
        logger.debug('Retrying after failure', {
          attempt: attempt + 1,
          maxAttempts: resolved.maxAttempts,
          delayMs: Math.round(delay),
          error: lastError.message,
        });
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}
