/**
 * OpenAI provider adapter for custom validation.
 *
 * @module custom/providers/openai
 */

import type { Logger } from '../../utils/logger.js';
import type { ResolvedCustomConfig } from '../types.js';
import type { ProviderMessages } from '../prompt.js';
import { CustomError } from '../types.js';

let OpenAIClass: typeof import('openai').default | null = null;

async function getOpenAIClass(): Promise<typeof import('openai').default> {
  if (!OpenAIClass) {
    OpenAIClass = (await import('openai')).default;
  }
  return OpenAIClass;
}

export async function callOpenAI(
  messages: ProviderMessages,
  config: ResolvedCustomConfig,
  logger: Logger
): Promise<string> {
  try {
    const OpenAI = await getOpenAIClass();
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });

    logger.debug('Calling OpenAI API', {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    const response = await client.chat.completions.create({
      model: config.model,
      messages: messages.messages! as Parameters<typeof client.chat.completions.create>[0]['messages'],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new CustomError('Empty response from OpenAI');
    }

    return content;
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }

    throw new CustomError(
      `OpenAI API call failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}
