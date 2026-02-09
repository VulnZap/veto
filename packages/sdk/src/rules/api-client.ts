import type { Logger } from '../utils/logger.js';
import type { ResilienceConfig } from '../types/config.js';
import { CircuitBreaker, type CircuitBreakerConfig } from '../core/circuit-breaker.js';
import { withRetry, type RetryConfig } from '../core/retry.js';
import type {
  Rule,
  ToolCallContext,
  ValidationAPIRequest,
  ValidationAPIResponse,
} from './types.js';

export interface ValidationAPIConfig {
  baseUrl: string;
  endpoint?: string;
  timeout?: number;
  headers?: Record<string, string>;
  apiKey?: string;
  retries?: number;
  retryDelay?: number;
}

interface ResolvedAPIConfig {
  baseUrl: string;
  endpoint: string;
  timeout: number;
  headers: Record<string, string>;
  apiKey?: string;
}

export interface ValidationAPIClientOptions {
  config: ValidationAPIConfig;
  logger: Logger;
  failMode?: 'open' | 'closed';
  resilience?: ResilienceConfig;
  clock?: () => number;
  sleepFn?: (ms: number) => Promise<void>;
  jitterFn?: () => number;
}

export class ValidationAPIError extends Error {
  readonly statusCode?: number;
  readonly responseBody?: string;

  constructor(message: string, statusCode?: number, responseBody?: string) {
    super(message);
    this.name = 'ValidationAPIError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitOpenError';
  }
}

export class ValidationAPIClient {
  private readonly config: ResolvedAPIConfig;
  private readonly logger: Logger;
  private readonly failMode: 'fail-closed' | 'fail-open';
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryConfig: Partial<RetryConfig>;
  private readonly deadlineMs: number;
  private readonly sleepFn?: (ms: number) => Promise<void>;
  private readonly jitterFn?: () => number;

  constructor(options: ValidationAPIClientOptions) {
    this.config = this.resolveConfig(options.config);
    this.logger = options.logger;
    this.sleepFn = options.sleepFn;
    this.jitterFn = options.jitterFn;

    const res = options.resilience ?? {};

    this.failMode = res.failMode ?? (options.failMode === 'open' ? 'fail-open' : 'fail-closed');
    this.deadlineMs = res.deadlineMs ?? options.config.timeout ?? 5000;

    this.retryConfig = {
      maxAttempts: res.retry?.maxAttempts ?? options.config.retries ?? 3,
      baseDelayMs: res.retry?.baseDelayMs ?? options.config.retryDelay ?? 200,
      maxDelayMs: res.retry?.maxDelayMs ?? 5000,
    };

    const cbConfig: Partial<CircuitBreakerConfig> = {
      failureThreshold: res.circuitBreaker?.failureThreshold,
      resetTimeoutMs: res.circuitBreaker?.resetTimeoutMs,
      halfOpenMaxAttempts: res.circuitBreaker?.halfOpenMaxAttempts,
    };
    this.circuitBreaker = new CircuitBreaker(cbConfig, this.logger, options.clock);

    this.logger.info('Validation API client initialized', {
      baseUrl: this.config.baseUrl,
      endpoint: this.config.endpoint,
      deadlineMs: this.deadlineMs,
      failMode: this.failMode,
      retryMaxAttempts: this.retryConfig.maxAttempts,
    });
  }

  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  async validate(
    context: ToolCallContext,
    rules: Rule[]
  ): Promise<ValidationAPIResponse> {
    const request: ValidationAPIRequest = {
      context,
      rules,
    };

    const url = `${this.config.baseUrl}${this.config.endpoint}`;

    this.logger.debug('Sending validation request', {
      url,
      toolName: context.tool_name,
      callId: context.call_id,
      ruleCount: rules.length,
    });

    if (!this.circuitBreaker.canExecute()) {
      this.logger.warn('Circuit breaker is open, skipping request', {
        callId: context.call_id,
      });
      return this.getFailModeResponse('Circuit breaker is open');
    }

    // Mark that we're starting an attempt (enforces halfOpenMaxAttempts in half-open state)
    this.circuitBreaker.beginAttempt();

    try {
      const result = await withRetry(
        () => this.makeRequest(url, request),
        this.retryConfig,
        this.logger,
        this.sleepFn,
        this.jitterFn
      );

      this.circuitBreaker.recordSuccess();

      this.logger.debug('Received validation response', {
        callId: context.call_id,
        decision: result.value.decision,
        attempts: result.attempts,
      });

      return result.value;
    } catch (error) {
      this.circuitBreaker.recordFailure();

      const lastError = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Validation API request failed after all retries',
        {
          url,
          callId: context.call_id,
          retries: this.retryConfig.maxAttempts,
        },
        lastError
      );

      return this.getFailModeResponse(lastError.message);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async makeRequest(
    url: string,
    request: ValidationAPIRequest
  ): Promise<ValidationAPIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.deadlineMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.text().catch(() => 'Unable to read response body');
        throw new ValidationAPIError(
          `API returned status ${response.status}`,
          response.status,
          body
        );
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ValidationAPIError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ValidationAPIError(`Request timed out after ${this.deadlineMs}ms`);
      }

      throw new ValidationAPIError(
        `Request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  private parseResponse(data: unknown): ValidationAPIResponse {
    if (!data || typeof data !== 'object') {
      throw new ValidationAPIError('Invalid response format');
    }

    const response = data as Record<string, unknown>;

    if (typeof response.should_pass_weight !== 'number') {
      throw new ValidationAPIError('Missing or invalid should_pass_weight');
    }
    if (typeof response.should_block_weight !== 'number') {
      throw new ValidationAPIError('Missing or invalid should_block_weight');
    }
    if (response.decision !== 'pass' && response.decision !== 'block') {
      throw new ValidationAPIError('Missing or invalid decision (must be "pass" or "block")');
    }
    if (typeof response.reasoning !== 'string') {
      throw new ValidationAPIError('Missing or invalid reasoning');
    }

    return {
      should_pass_weight: response.should_pass_weight,
      should_block_weight: response.should_block_weight,
      decision: response.decision,
      reasoning: response.reasoning,
      matched_rules: response.matched_rules as string[] | undefined,
      metadata: response.metadata as Record<string, unknown> | undefined,
    };
  }

  private getFailModeResponse(reason: string): ValidationAPIResponse {
    if (this.failMode === 'fail-open') {
      this.logger.warn('Failing open due to API error', { reason });
      return {
        should_pass_weight: 1.0,
        should_block_weight: 0.0,
        decision: 'pass',
        reasoning: `API unavailable, failing open: ${reason}`,
      };
    } else {
      this.logger.warn('Failing closed due to API error', { reason });
      return {
        should_pass_weight: 0.0,
        should_block_weight: 1.0,
        decision: 'block',
        reasoning: `API unavailable, failing closed: ${reason}`,
      };
    }
  }

  private resolveConfig(config: ValidationAPIConfig): ResolvedAPIConfig {
    return {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      endpoint: config.endpoint ?? '/tool/call/check',
      timeout: config.timeout ?? 5000,
      headers: config.headers ?? {},
      apiKey: config.apiKey,
    };
  }
}

export function createValidationAPIClient(
  options: ValidationAPIClientOptions
): ValidationAPIClient {
  return new ValidationAPIClient(options);
}
