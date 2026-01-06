/**
 * Google Gemini provider adapter for custom validation.
 *
 * @module custom/providers/gemini
 */

import type { Logger } from '../../utils/logger.js';
import type { ResolvedCustomConfig } from '../types.js';
import type { ProviderMessages } from '../prompt.js';
import { CustomError } from '../types.js';

let GeminiModule: typeof import('@google/generative-ai') | null = null;

async function getGeminiModule(): Promise<typeof import('@google/generative-ai')> {
  if (!GeminiModule) {
    GeminiModule = await import('@google/generative-ai');
  }
  return GeminiModule;
}

export async function callGemini(
  messages: ProviderMessages,
  config: ResolvedCustomConfig,
  logger: Logger
): Promise<string> {
  try {
    const { GoogleGenerativeAI, SchemaType } = await getGeminiModule();
    const ai = new GoogleGenerativeAI(config.apiKey);

    const textContent = messages.contents?.[0]?.parts?.[0]?.text ?? '';

    logger.debug('Calling Gemini API', {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    const model = ai.getGenerativeModel({
      model: config.model,
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            pass_weight: { type: SchemaType.NUMBER, description: 'Weight for pass decision (0-1)' },
            block_weight: { type: SchemaType.NUMBER, description: 'Weight for block decision (0-1)' },
            decision: { type: SchemaType.STRING, enum: ['pass', 'block'], description: 'The validation decision' },
            reasoning: { type: SchemaType.STRING, description: 'Brief explanation of the decision' },
          },
          required: ['pass_weight', 'block_weight', 'decision', 'reasoning'],
        },
      },
    });

    const result = await model.generateContent(textContent);
    const response = result.response;

    const text = response.text();
    if (!text) {
      throw new CustomError('Empty response from Gemini');
    }

    return text;
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }

    throw new CustomError(
      `Gemini API call failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}
