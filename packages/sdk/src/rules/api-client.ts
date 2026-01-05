/**
 * API client for the validation endpoint.
 *
 * Sends tool call context and rules to an external API for validation
 * and returns the decision.
 *
 * @module rules/api-client
 */

import type { Logger } from '../utils/logger.js';
import type {
  Rule,
  ToolCallContext,
  ValidationAPIRequest,
  ValidationAPIResponse,
} from './types.js';

/**
 * Configuration for the validation API client.
 */
export interface ValidationAPIConfig {
  /** Base URL of the validation API */
  baseUrl: string;
  /** Endpoint path for tool call validation */
  endpoint?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
  /** API key for authentication (sent as Authorization: Bearer header) */
  apiKey?: string;
  /** Number of retries on failure */
  retries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
}

/**
 * Resolved configuration with defaults.
 */
interface ResolvedAPIConfig {
  baseUrl: string;
  endpoint: string;
  timeout: number;
  headers: Record<string, string>;
  apiKey?: string;
  retries: number;
  retryDelay: number;
}

/**
 * Options for the API client.
 */
export interface ValidationAPIClientOptions {
  /** API configuration */
  config: ValidationAPIConfig;
  /** Logger instance */
  logger: Logger;
  /** Behavior when API is unavailable */
  failMode?: 'open' | 'closed';
}

/**
 * Error thrown when the validation API fails.
 */
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

/**
 * Client for communicating with the validation API.
 */
export class ValidationAPIClient {
  private readonly config: ResolvedAPIConfig;
  private readonly logger: Logger;
  private readonly failMode: 'open' | 'closed';

  constructor(options: ValidationAPIClientOptions) {
    this.config = this.resolveConfig(options.config);
    this.logger = options.logger;
    this.failMode = options.failMode ?? 'closed';

    this.logger.info('Validation API client initialized', {
      baseUrl: this.config.baseUrl,
      endpoint: this.config.endpoint,
      timeout: this.config.timeout,
      failMode: this.failMode,
    });
  }

  /**
   * Validate a tool call against the rules.
   *
   * @param context - Tool call context
   * @param rules - Applicable rules
   * @returns Validation response
   */
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

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const response = await this.makeRequest(url, request);

        this.logger.debug('Received validation response', {
          callId: context.call_id,
          decision: response.decision,
          shouldPassWeight: response.should_pass_weight,
          shouldBlockWeight: response.should_block_weight,
        });

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.retries) {
          this.logger.warn('Validation request failed, retrying', {
            attempt: attempt + 1,
            maxRetries: this.config.retries,
            error: lastError.message,
          });
          await this.delay(this.config.retryDelay);
        }
      }
    }

    // All retries exhausted
    this.logger.error(
      'Validation API request failed after all retries',
      {
        url,
        callId: context.call_id,
        retries: this.config.retries,
      },
      lastError
    );

    // Return based on fail mode
    return this.getFailModeResponse(lastError?.message ?? 'API unavailable');
  }

  /**
   * Check if the API is healthy.
   *
   * @returns True if the API is reachable
   */
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

  /**
   * Make the actual HTTP request.
   */
  private async makeRequest(
    url: string,
    request: ValidationAPIRequest
  ): Promise<ValidationAPIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

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
        throw new ValidationAPIError(`Request timed out after ${this.config.timeout}ms`);
      }

      throw new ValidationAPIError(
        `Request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Build request headers.
   */
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

  /**
   * Parse and validate the API response.
   */
  private parseResponse(data: unknown): ValidationAPIResponse {
    if (!data || typeof data !== 'object') {
      throw new ValidationAPIError('Invalid response format');
    }

    const response = data as Record<string, unknown>;

    // Validate required fields
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

  /**
   * Get a response based on fail mode when API is unavailable.
   */
  private getFailModeResponse(reason: string): ValidationAPIResponse {
    if (this.failMode === 'open') {
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

  /**
   * Resolve configuration with defaults.
   */
  private resolveConfig(config: ValidationAPIConfig): ResolvedAPIConfig {
    return {
      baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
      endpoint: config.endpoint ?? '/tool/call/check',
      timeout: config.timeout ?? 10000,
      headers: config.headers ?? {},
      apiKey: config.apiKey,
      retries: config.retries ?? 2,
      retryDelay: config.retryDelay ?? 1000,
    };
  }

  /**
   * Delay for the specified milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a new validation API client.
 *
 * @param options - Client options
 * @returns ValidationAPIClient instance
 */
export function createValidationAPIClient(
  options: ValidationAPIClientOptions
): ValidationAPIClient {
  return new ValidationAPIClient(options);
}
