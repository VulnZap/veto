/**
 * Deterministic normalizer for generated policies.
 *
 * Ensures policies have a canonical form before persistence:
 * sorted keys, normalized values, consistent formatting.
 *
 * @module generator/normalizer
 */

import type { GeneratedPolicy, GeneratedRule, GeneratedCondition } from './types.js';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

/**
 * Normalize a generated policy into canonical form.
 *
 * - Sorts rules by severity (critical first), then by id
 * - Sorts conditions by field name
 * - Normalizes string values (trim whitespace)
 * - Ensures tool names are lowercase
 * - Removes empty optional fields
 */
export function normalizePolicy(policy: GeneratedPolicy): GeneratedPolicy {
  const normalizedRules = policy.rules
    .map(normalizeRule)
    .sort(compareRules);

  return {
    version: policy.version.trim(),
    name: policy.name.trim().toLowerCase().replace(/\s+/g, '-'),
    description: policy.description.trim(),
    rules: normalizedRules,
  };
}

function normalizeRule(rule: GeneratedRule): GeneratedRule {
  const conditions = rule.conditions
    .map(normalizeCondition)
    .sort((a, b) => a.field.localeCompare(b.field));

  const tools = rule.tools
    .map((t) => t.trim().toLowerCase())
    .sort();

  return {
    id: rule.id.trim().toLowerCase().replace(/\s+/g, '-'),
    name: rule.name.trim(),
    description: rule.description.trim(),
    enabled: rule.enabled,
    severity: rule.severity,
    action: rule.action,
    tools,
    conditions,
  };
}

function normalizeCondition(condition: GeneratedCondition): GeneratedCondition {
  return {
    field: condition.field.trim(),
    operator: condition.operator,
    value: normalizeValue(condition.value),
  };
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeValue).sort((a, b) => {
      if (typeof a === 'string' && typeof b === 'string') {
        return a.localeCompare(b);
      }
      return 0;
    });
  }
  return value;
}

function compareRules(a: GeneratedRule, b: GeneratedRule): number {
  const severityA = SEVERITY_ORDER.indexOf(a.severity as typeof SEVERITY_ORDER[number]);
  const severityB = SEVERITY_ORDER.indexOf(b.severity as typeof SEVERITY_ORDER[number]);

  if (severityA !== severityB) {
    return severityA - severityB;
  }

  return a.id.localeCompare(b.id);
}
