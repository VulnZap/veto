/**
 * veto generate command implementation.
 *
 * Generates a validated policy from a natural language description
 * using an LLM provider.
 *
 * @module cli/generate
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLogger } from '../utils/logger.js';
import { generate } from '../generator/generate.js';
import { serializeTestCases } from '../generator/serializer.js';
import type { CustomProvider } from '../custom/types.js';
import type { GeneratorOutput } from '../generator/types.js';

const VALID_PROVIDERS: CustomProvider[] = ['openai', 'anthropic', 'gemini', 'openrouter'];

export interface GenerateOptions {
  description: string;
  provider: string;
  model?: string;
  output?: string;
  withTests?: boolean;
  quiet?: boolean;
}

export interface GenerateResult {
  success: boolean;
  output?: GeneratorOutput;
  policyPath?: string;
  testPath?: string;
  messages: string[];
}

const DEFAULT_MODELS: Record<CustomProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20250929',
  gemini: 'gemini-2.0-flash',
  openrouter: 'openai/gpt-4o',
};

function log(message: string, quiet: boolean): void {
  if (!quiet) {
    console.log(message);
  }
}

export async function runGenerate(options: GenerateOptions): Promise<GenerateResult> {
  const {
    description,
    provider,
    model,
    output,
    withTests = false,
    quiet = false,
  } = options;

  const result: GenerateResult = {
    success: false,
    messages: [],
  };

  if (!VALID_PROVIDERS.includes(provider as CustomProvider)) {
    result.messages.push(`Invalid provider: ${provider}. Valid: ${VALID_PROVIDERS.join(', ')}`);
    log(`Error: Invalid provider "${provider}". Valid providers: ${VALID_PROVIDERS.join(', ')}`, quiet);
    return result;
  }

  const resolvedProvider = provider as CustomProvider;
  const resolvedModel = model ?? DEFAULT_MODELS[resolvedProvider];

  log('', quiet);
  log(`Generating policy with ${resolvedProvider} (${resolvedModel})...`, quiet);
  log('', quiet);

  const logger = createLogger(quiet ? 'silent' : 'info');

  try {
    const generatorOutput = await generate(description, {
      provider: resolvedProvider,
      model: resolvedModel,
    }, logger);

    result.output = generatorOutput;

    if (output) {
      const policyPath = resolve(output);
      writeFileSync(policyPath, generatorOutput.yaml, 'utf-8');
      result.policyPath = policyPath;
      log(`  Policy written to ${policyPath}`, quiet);

      if (withTests) {
        const testPath = policyPath.replace(/\.ya?ml$/, '.test.yaml');
        const testYaml = serializeTestCases(generatorOutput.testCases);
        writeFileSync(testPath, testYaml, 'utf-8');
        result.testPath = testPath;
        log(`  Tests written to ${testPath}`, quiet);
      }
    } else {
      log(generatorOutput.yaml, quiet);

      if (withTests) {
        log('---', quiet);
        log(serializeTestCases(generatorOutput.testCases), quiet);
      }
    }

    result.success = true;
    log('', quiet);
    log('Policy generated.', quiet);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.messages.push(message);
    log(`Error: ${message}`, quiet);
  }

  return result;
}
