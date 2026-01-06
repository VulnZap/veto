/**
 * Anthropic provider adapter for custom validation.
 *
 * @module custom/providers/anthropic
 */

import type { Logger } from '../../utils/logger.js';
import type { ResolvedCustomConfig } from '../types.js';
import type { ProviderMessages } from '../prompt.js';
import { CustomError } from '../types.js';

/**
 * Call Anthropic API with the given prompt.
 */
export async function callAnthropic(
  messages: ProviderMessages,
  config: ResolvedCustomConfig,
  logger: Logger
): Promise<string> {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({
      apiKey: config.apiKey,
    });

    logger.debug('Calling Anthropic API', {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    const anthropicMessages = messages.messages!.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const response = await client.messages.create({
      model: config.model,
      system: messages.system,
      messages: anthropicMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new CustomError('Unexpected response type from Anthropic');
    }

    return content.text;
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }

    throw new CustomError(
      `Anthropic API call failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}
