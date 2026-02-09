/**
 * Natural language intent parser using LLM providers.
 *
 * Parses a plain-English policy description into a structured
 * GeneratorIntent that can be used to synthesize a policy.
 *
 * @module generator/intent-parser
 */

import type { Logger } from '../utils/logger.js';
import type { ResolvedCustomConfig } from '../custom/types.js';
import type { GeneratorIntent, LLMIntentResponse } from './types.js';
import { GeneratorError, GeneratorValidationError } from './types.js';
import type { ConditionOperator, RuleAction, RuleSeverity } from '../rules/types.js';
import { callOpenAI } from '../custom/providers/openai.js';
import { callAnthropic } from '../custom/providers/anthropic.js';
import { callGemini } from '../custom/providers/gemini.js';
import { callOpenRouter } from '../custom/providers/openrouter.js';
import type { ProviderMessages } from '../custom/prompt.js';

const VALID_ACTIONS: RuleAction[] = ['block', 'warn', 'log', 'allow'];
const VALID_SEVERITIES: RuleSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const VALID_OPERATORS: ConditionOperator[] = [
  'equals', 'not_equals', 'contains', 'not_contains',
  'starts_with', 'ends_with', 'matches',
  'greater_than', 'less_than', 'in', 'not_in',
];
const VALID_CONSTRAINT_TYPES = [
  'string_pattern', 'string_enum', 'string_length',
  'number_range', 'number_exact', 'boolean_exact',
  'array_contains', 'array_length', 'field_required', 'field_absent',
];

const INTENT_SYSTEM_PROMPT = `You are a security policy parser for AI agent tool calls.

TASK: Parse the user's natural language description into a structured policy intent.

IMPORTANT: Respond with ONLY a JSON object. No other text, no explanation, no markdown.

JSON SCHEMA:
{
  "toolName": "<name of the tool this policy applies to, e.g. 'send_email', 'execute_command'>",
  "description": "<concise description of what the policy enforces>",
  "action": "<block|warn|log|allow>",
  "severity": "<critical|high|medium|low|info>",
  "constraints": [
    {
      "field": "<dot-notation field path, e.g. 'arguments.path', 'arguments.to'>",
      "type": "<string_pattern|string_enum|string_length|number_range|number_exact|boolean_exact|array_contains|array_length|field_required|field_absent>",
      "operator": "<equals|not_equals|contains|not_contains|starts_with|ends_with|matches|greater_than|less_than|in|not_in>",
      "value": "<the value to compare against>"
    }
  ],
  "tags": ["<relevant tags like 'security', 'data-protection', 'access-control'>"]
}

RULES:
- "field" must use dot notation starting with "arguments." for tool argument fields
- Choose the most specific operator for the constraint
- For blocking dangerous patterns, use action "block" with severity "critical" or "high"
- For monitoring/auditing, use action "log" or "warn" with lower severity
- Always include at least one constraint
- Tags should be lowercase kebab-case`;

/**
 * Parse a natural language description into a structured intent using an LLM.
 */
export async function parseIntent(
  description: string,
  config: ResolvedCustomConfig,
  logger: Logger,
  maxRetries: number = 2
): Promise<GeneratorIntent> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const messages = buildMessages(config.provider, description);
      const rawResponse = await callLLM(messages, config, logger);
      const parsed = extractJSON(rawResponse);
      return validateIntentResponse(parsed, rawResponse);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn('Intent parsing attempt failed', {
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        error: lastError.message,
      });
    }
  }

  throw new GeneratorError(
    `Failed to parse intent after ${maxRetries + 1} attempts: ${lastError?.message}`,
    lastError
  );
}

function buildMessages(
  provider: string,
  description: string
): ProviderMessages {
  const userPrompt = `Parse this policy description into a structured intent:\n\n${description}`;

  switch (provider) {
    case 'openai':
    case 'openrouter':
      return {
        messages: [
          { role: 'system', content: INTENT_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      };
    case 'anthropic':
      return {
        system: INTENT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      };
    case 'gemini':
      return {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${INTENT_SYSTEM_PROMPT}\n\n${userPrompt}` }],
          },
        ],
      };
    default:
      throw new GeneratorError(`Unsupported provider: ${provider}`);
  }
}

async function callLLM(
  messages: ProviderMessages,
  config: ResolvedCustomConfig,
  logger: Logger
): Promise<string> {
  switch (config.provider) {
    case 'openai':
      return callOpenAI(messages, config, logger);
    case 'anthropic':
      return callAnthropic(messages, config, logger);
    case 'gemini':
      return callGemini(messages, config, logger);
    case 'openrouter':
      return callOpenRouter(messages, config, logger);
    default:
      throw new GeneratorError(`Unsupported provider: ${config.provider}`);
  }
}

function extractJSON(raw: string): unknown {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new GeneratorValidationError('No JSON found in LLM response', raw);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new GeneratorValidationError('Invalid JSON in LLM response', raw);
  }
}

function validateIntentResponse(parsed: unknown, raw: string): GeneratorIntent {
  if (!parsed || typeof parsed !== 'object') {
    throw new GeneratorValidationError('Response is not an object', raw);
  }

  const data = parsed as Record<string, unknown>;

  if (typeof data.toolName !== 'string' || data.toolName.length === 0) {
    throw new GeneratorValidationError('Missing or empty toolName', raw);
  }

  if (typeof data.description !== 'string' || data.description.length === 0) {
    throw new GeneratorValidationError('Missing or empty description', raw);
  }

  const action = String(data.action);
  if (!VALID_ACTIONS.includes(action as RuleAction)) {
    throw new GeneratorValidationError(`Invalid action: ${action}`, raw);
  }

  const severity = String(data.severity);
  if (!VALID_SEVERITIES.includes(severity as RuleSeverity)) {
    throw new GeneratorValidationError(`Invalid severity: ${severity}`, raw);
  }

  if (!Array.isArray(data.constraints) || data.constraints.length === 0) {
    throw new GeneratorValidationError('Missing or empty constraints array', raw);
  }

  const rawConstraints = data.constraints as LLMIntentResponse['constraints'];
  const constraints = rawConstraints.map((c, i) => {
    if (typeof c.field !== 'string' || c.field.length === 0) {
      throw new GeneratorValidationError(`Constraint ${i}: missing field`, raw);
    }
    if (!VALID_CONSTRAINT_TYPES.includes(c.type)) {
      throw new GeneratorValidationError(`Constraint ${i}: invalid type "${c.type}"`, raw);
    }
    if (!VALID_OPERATORS.includes(c.operator as ConditionOperator)) {
      throw new GeneratorValidationError(`Constraint ${i}: invalid operator "${c.operator}"`, raw);
    }
    if (c.value === undefined) {
      throw new GeneratorValidationError(`Constraint ${i}: missing value`, raw);
    }

    return {
      field: c.field,
      type: c.type as GeneratorIntent['constraints'][number]['type'],
      operator: c.operator as ConditionOperator,
      value: c.value,
    };
  });

  const tags = Array.isArray(data.tags)
    ? (data.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  return {
    toolName: data.toolName as string,
    description: data.description as string,
    action: action as RuleAction,
    severity: severity as RuleSeverity,
    constraints,
    tags,
  };
}
