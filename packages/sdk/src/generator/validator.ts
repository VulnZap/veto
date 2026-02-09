/**
 * Post-generation validator for generated policies.
 *
 * Validates that generated policies conform to the expected schema,
 * type constraints, and semantic invariants.
 *
 * @module generator/validator
 */

import type { GeneratedPolicy, GeneratedRule, GeneratedCondition } from './types.js';
import { GeneratorValidationError } from './types.js';
import type { ConditionOperator, RuleAction, RuleSeverity } from '../rules/types.js';

const VALID_ACTIONS: RuleAction[] = ['block', 'warn', 'log', 'allow'];
const VALID_SEVERITIES: RuleSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const VALID_OPERATORS: ConditionOperator[] = [
  'equals', 'not_equals', 'contains', 'not_contains',
  'starts_with', 'ends_with', 'matches',
  'greater_than', 'less_than', 'in', 'not_in',
];

/**
 * Validate a generated policy against the schema and semantic rules.
 * Throws GeneratorValidationError if invalid.
 */
export function validatePolicy(policy: GeneratedPolicy): void {
  validatePolicyStructure(policy);

  const ruleIds = new Set<string>();
  for (const rule of policy.rules) {
    validateRule(rule);

    if (ruleIds.has(rule.id)) {
      throw new GeneratorValidationError(
        `Duplicate rule ID: ${rule.id}`,
        JSON.stringify(policy)
      );
    }
    ruleIds.add(rule.id);
  }
}

function validatePolicyStructure(policy: GeneratedPolicy): void {
  if (typeof policy.version !== 'string' || policy.version.length === 0) {
    throw new GeneratorValidationError('Policy missing version', JSON.stringify(policy));
  }

  if (typeof policy.name !== 'string' || policy.name.length === 0) {
    throw new GeneratorValidationError('Policy missing name', JSON.stringify(policy));
  }

  if (typeof policy.description !== 'string') {
    throw new GeneratorValidationError('Policy missing description', JSON.stringify(policy));
  }

  if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
    throw new GeneratorValidationError('Policy must have at least one rule', JSON.stringify(policy));
  }
}

function validateRule(rule: GeneratedRule): void {
  if (typeof rule.id !== 'string' || rule.id.length === 0) {
    throw new GeneratorValidationError('Rule missing id', JSON.stringify(rule));
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(rule.id) && !/^[a-z0-9]$/.test(rule.id)) {
    throw new GeneratorValidationError(
      `Rule ID must be lowercase kebab-case: "${rule.id}"`,
      JSON.stringify(rule)
    );
  }

  if (typeof rule.name !== 'string' || rule.name.length === 0) {
    throw new GeneratorValidationError('Rule missing name', JSON.stringify(rule));
  }

  if (typeof rule.enabled !== 'boolean') {
    throw new GeneratorValidationError('Rule enabled must be boolean', JSON.stringify(rule));
  }

  if (!VALID_ACTIONS.includes(rule.action)) {
    throw new GeneratorValidationError(`Invalid rule action: ${rule.action}`, JSON.stringify(rule));
  }

  if (!VALID_SEVERITIES.includes(rule.severity)) {
    throw new GeneratorValidationError(`Invalid rule severity: ${rule.severity}`, JSON.stringify(rule));
  }

  if (!Array.isArray(rule.tools) || rule.tools.length === 0) {
    throw new GeneratorValidationError('Rule must specify at least one tool', JSON.stringify(rule));
  }

  for (const tool of rule.tools) {
    if (typeof tool !== 'string' || tool.length === 0) {
      throw new GeneratorValidationError('Rule tool name must be a non-empty string', JSON.stringify(rule));
    }
  }

  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    throw new GeneratorValidationError('Rule must have at least one condition', JSON.stringify(rule));
  }

  for (const condition of rule.conditions) {
    validateCondition(condition);
  }
}

function validateCondition(condition: GeneratedCondition): void {
  if (typeof condition.field !== 'string' || condition.field.length === 0) {
    throw new GeneratorValidationError('Condition missing field', JSON.stringify(condition));
  }

  if (!VALID_OPERATORS.includes(condition.operator)) {
    throw new GeneratorValidationError(
      `Invalid condition operator: ${condition.operator}`,
      JSON.stringify(condition)
    );
  }

  if (condition.value === undefined) {
    throw new GeneratorValidationError('Condition missing value', JSON.stringify(condition));
  }

  validateOperatorValueType(condition);
}

function validateOperatorValueType(condition: GeneratedCondition): void {
  const { operator, value } = condition;

  switch (operator) {
    case 'greater_than':
    case 'less_than':
      if (typeof value !== 'number') {
        throw new GeneratorValidationError(
          `Operator "${operator}" requires a numeric value, got ${typeof value}`,
          JSON.stringify(condition)
        );
      }
      break;

    case 'in':
    case 'not_in':
      if (!Array.isArray(value)) {
        throw new GeneratorValidationError(
          `Operator "${operator}" requires an array value, got ${typeof value}`,
          JSON.stringify(condition)
        );
      }
      break;

    case 'contains':
    case 'not_contains':
    case 'starts_with':
    case 'ends_with':
    case 'matches':
      if (typeof value !== 'string') {
        throw new GeneratorValidationError(
          `Operator "${operator}" requires a string value, got ${typeof value}`,
          JSON.stringify(condition)
        );
      }
      break;
  }
}
