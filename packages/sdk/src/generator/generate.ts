/**
 * Top-level generate function that orchestrates the full pipeline:
 * parse intent -> synthesize policy -> validate -> normalize -> serialize.
 *
 * @module generator/generate
 */

import type { Logger } from '../utils/logger.js';
import { resolveCustomConfig } from '../custom/types.js';
import type { GeneratorConfig, GeneratorOutput } from './types.js';
import { parseIntent } from './intent-parser.js';
import { synthesizePolicy } from './policy-synthesizer.js';
import { generateTestCases } from './test-generator.js';
import { validatePolicy } from './validator.js';
import { normalizePolicy } from './normalizer.js';
import { serializePolicy } from './serializer.js';

/**
 * Generate a validated, normalized policy from a natural language description.
 */
export async function generate(
  description: string,
  config: GeneratorConfig,
  logger: Logger
): Promise<GeneratorOutput> {
  const resolvedConfig = resolveCustomConfig({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    temperature: config.temperature ?? 0.2,
    maxTokens: config.maxTokens ?? 1024,
  });

  logger.info('Generating policy from description', {
    provider: config.provider,
    model: config.model,
  });

  const intent = await parseIntent(
    description,
    resolvedConfig,
    logger,
    config.maxRetries ?? 2
  );

  logger.debug('Parsed intent', {
    toolName: intent.toolName,
    action: intent.action,
    constraintCount: intent.constraints.length,
  });

  const rawPolicy = synthesizePolicy(intent);

  validatePolicy(rawPolicy);

  const policy = normalizePolicy(rawPolicy);

  const testCases = generateTestCases(policy);

  const yaml = serializePolicy(policy);

  logger.info('Policy generated', {
    name: policy.name,
    ruleCount: policy.rules.length,
    testCaseCount: testCases.length,
  });

  return { policy, testCases, yaml };
}
