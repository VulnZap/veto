/**
 * Policy synthesizer that converts structured intents into policy objects.
 *
 * @module generator/policy-synthesizer
 */

import type { GeneratorIntent, GeneratedPolicy, GeneratedRule, GeneratedCondition } from './types.js';

/**
 * Synthesize a GeneratedPolicy from a validated GeneratorIntent.
 */
export function synthesizePolicy(intent: GeneratorIntent): GeneratedPolicy {
  const ruleId = buildRuleId(intent);
  const ruleName = buildRuleName(intent);

  const conditions: GeneratedCondition[] = intent.constraints.map((c) => ({
    field: c.field,
    operator: c.operator,
    value: c.value,
  }));

  const rule: GeneratedRule = {
    id: ruleId,
    name: ruleName,
    description: intent.description,
    enabled: true,
    severity: intent.severity,
    action: intent.action,
    tools: [intent.toolName],
    conditions,
  };

  const policyName = `${intent.toolName}-policy`;

  return {
    version: '1.0',
    name: policyName,
    description: intent.description,
    rules: [rule],
  };
}

function buildRuleId(intent: GeneratorIntent): string {
  const actionPrefix = intent.action;
  const toolSlug = intent.toolName
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  const constraintSlug = intent.constraints.length > 0
    ? intent.constraints[0].field
        .replace(/^arguments\./, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .toLowerCase()
    : 'general';

  return `${actionPrefix}-${toolSlug}-${constraintSlug}`;
}

function buildRuleName(intent: GeneratorIntent): string {
  const actionVerb = {
    block: 'Block',
    warn: 'Warn on',
    log: 'Log',
    allow: 'Allow',
  }[intent.action];

  return `${actionVerb} ${intent.toolName} ${intent.constraints[0]?.field.replace('arguments.', '') ?? ''}`.trim();
}
