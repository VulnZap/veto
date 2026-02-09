/**
 * Test case generator for policies.
 *
 * Generates positive (should allow) and negative (should block/deny)
 * test cases from a generated policy.
 *
 * @module generator/test-generator
 */

import type { GeneratedPolicy, GeneratedTestCase, GeneratedCondition } from './types.js';

/**
 * Generate test cases for a policy.
 *
 * Produces both positive cases (tool calls that should be allowed)
 * and negative cases (tool calls that should be blocked).
 */
export function generateTestCases(policy: GeneratedPolicy): GeneratedTestCase[] {
  const testCases: GeneratedTestCase[] = [];

  for (const rule of policy.rules) {
    const toolName = rule.tools[0] ?? 'unknown_tool';
    const isBlockingRule = rule.action === 'block' || rule.action === 'warn';

    // Negative case: arguments that violate the rule
    const violatingArgs = buildViolatingArguments(rule.conditions);
    testCases.push({
      name: `${rule.id}: should ${isBlockingRule ? 'block' : 'flag'} violating call`,
      description: `Tool call to ${toolName} with arguments that match rule conditions`,
      toolCall: {
        tool: toolName,
        arguments: violatingArgs,
      },
      expectedDecision: isBlockingRule ? 'block' : 'allow',
    });

    // Positive case: arguments that do NOT violate the rule
    const safeArgs = buildSafeArguments(rule.conditions);
    testCases.push({
      name: `${rule.id}: should allow safe call`,
      description: `Tool call to ${toolName} with arguments that do not match rule conditions`,
      toolCall: {
        tool: toolName,
        arguments: safeArgs,
      },
      expectedDecision: 'allow',
    });
  }

  return testCases;
}

function buildViolatingArguments(conditions: GeneratedCondition[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  for (const condition of conditions) {
    const fieldPath = condition.field.replace(/^arguments\./, '');
    setNestedValue(args, fieldPath, buildViolatingValue(condition));
  }

  return args;
}

function buildSafeArguments(conditions: GeneratedCondition[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  for (const condition of conditions) {
    const fieldPath = condition.field.replace(/^arguments\./, '');
    setNestedValue(args, fieldPath, buildSafeValue(condition));
  }

  return args;
}

function buildViolatingValue(condition: GeneratedCondition): unknown {
  switch (condition.operator) {
    case 'equals':
      return condition.value;
    case 'not_equals':
      return condition.value;
    case 'contains':
      return typeof condition.value === 'string'
        ? `prefix-${condition.value}-suffix`
        : condition.value;
    case 'not_contains':
      return 'safe-value-without-match';
    case 'starts_with':
      return typeof condition.value === 'string'
        ? `${condition.value}/dangerous-path`
        : condition.value;
    case 'ends_with':
      return typeof condition.value === 'string'
        ? `dangerous-file${condition.value}`
        : condition.value;
    case 'matches':
      return condition.value;
    case 'greater_than':
      return typeof condition.value === 'number'
        ? condition.value + 1
        : condition.value;
    case 'less_than':
      return typeof condition.value === 'number'
        ? condition.value - 1
        : condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.length > 0
        ? condition.value[0]
        : condition.value;
    case 'not_in':
      return 'value-not-in-list';
    default:
      return condition.value;
  }
}

function buildSafeValue(condition: GeneratedCondition): unknown {
  switch (condition.operator) {
    case 'equals':
      return typeof condition.value === 'string'
        ? `safe-${condition.value}-alt`
        : typeof condition.value === 'number'
          ? condition.value + 999
          : !condition.value;
    case 'not_equals':
      return typeof condition.value === 'string'
        ? `different-${condition.value}`
        : typeof condition.value === 'number'
          ? condition.value + 1
          : !condition.value;
    case 'contains':
      return 'safe-value-no-match';
    case 'not_contains':
      return typeof condition.value === 'string'
        ? `has-${condition.value}-inside`
        : condition.value;
    case 'starts_with':
      return 'safe/allowed/path';
    case 'ends_with':
      return 'safe-file.txt';
    case 'matches':
      return 'non-matching-value';
    case 'greater_than':
      return typeof condition.value === 'number'
        ? condition.value - 1
        : 0;
    case 'less_than':
      return typeof condition.value === 'number'
        ? condition.value + 1
        : 100;
    case 'in':
      return 'value-outside-list';
    case 'not_in':
      return Array.isArray(condition.value) && condition.value.length > 0
        ? condition.value[0]
        : condition.value;
    default:
      return 'safe-default';
  }
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}
