/**
 * Custom LLM provider client for validation.
 *
 * @module custom/client
 */

import type { Logger } from '../utils/logger.js';
import type { Rule } from '../rules/types.js';
import { buildUserPrompt, buildProviderMessages } from './prompt.js';
import { parseValidationResponse, ResponseParseError } from '../utils/response-parser.js';
import type {
  CustomConfig,
  CustomToolCall,
  CustomResponse,
  ResolvedCustomConfig,
} from './types.js';
import { CustomError, resolveCustomConfig } from './types.js';
import { callOpenAI } from './providers/openai.js';
import { callAnthropic } from './providers/anthropic.js';
import { callGemini } from './providers/gemini.js';
import { callOpenRouter } from './providers/openrouter.js';

/**
 * Options for creating a custom client.
 */
export interface CustomClientOptions {
  /** Custom provider configuration */
  config: CustomConfig;
  /** Logger instance */
  logger: Logger;
}

/**
 * Client for custom LLM provider validation.
 */
export class CustomClient {
  private readonly config: ResolvedCustomConfig;
  private readonly logger: Logger;

  constructor(options: CustomClientOptions) {
    this.config = resolveCustomConfig(options.config);
    this.logger = options.logger;

    this.logger.debug('Custom client initialized', {
      provider: this.config.provider,
      model: this.config.model,
      temperature: this.config.temperature,
    });
  }

  /**
   * Evaluate a tool call against rules using the custom LLM provider.
   */
  async evaluate(toolCall: CustomToolCall, rules: Rule[]): Promise<CustomResponse> {
    const userPrompt = buildUserPrompt(toolCall, rules);
    const messages = buildProviderMessages(this.config.provider, userPrompt);

    this.logger.debug('Evaluating tool call with custom provider', {
      provider: this.config.provider,
      tool: toolCall.tool,
      ruleCount: rules.length,
    });

    try {
      const content = await this.callProvider(messages);
      return this.parseResponse(content);
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      throw new CustomError(
        `Custom validation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Call the appropriate provider based on configuration.
   */
  private async callProvider(messages: ReturnType<typeof buildProviderMessages>): Promise<string> {
    switch (this.config.provider) {
      case 'openai':
        return callOpenAI(messages, this.config, this.logger);
      case 'anthropic':
        return callAnthropic(messages, this.config, this.logger);
      case 'gemini':
        return callGemini(messages, this.config, this.logger);
      case 'openrouter':
        return callOpenRouter(messages, this.config, this.logger);
      default:
        throw new CustomError(`Unsupported provider: ${this.config.provider}`);
    }
  }

  /**
   * Parse LLM response into structured format.
   */
  private parseResponse(content: string): CustomResponse {
    this.logger.debug('Raw custom provider response:', { rawContent: content });

    try {
      const result = parseValidationResponse(content);

      this.logger.debug('Custom response parsed', {
        decision: result.decision,
        passWeight: result.pass_weight,
        blockWeight: result.block_weight,
      });

      return result;
    } catch (error) {
      if (error instanceof ResponseParseError) {
        throw new CustomError(error.message, error);
      }
      throw error;
    }
  }

  /**
   * Check if the custom provider is available and working.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testToolCall: CustomToolCall = {
        tool: 'health_check',
        arguments: {},
      };

      await this.evaluate(testToolCall, []);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a new custom client.
 */
export function createCustomClient(options: CustomClientOptions): CustomClient {
  return new CustomClient(options);
}
