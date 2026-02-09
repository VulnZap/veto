/**
 * YAML serializer for generated policies.
 *
 * Converts GeneratedPolicy objects into canonical YAML strings
 * matching the format used by the rule loader.
 *
 * @module generator/serializer
 */

import type { GeneratedPolicy, GeneratedTestCase } from './types.js';

/**
 * Serialize a generated policy to YAML string.
 */
export function serializePolicy(policy: GeneratedPolicy): string {
  const lines: string[] = [];

  lines.push(`version: "${policy.version}"`);
  lines.push(`name: ${policy.name}`);
  lines.push(`description: ${yamlString(policy.description)}`);
  lines.push('');
  lines.push('rules:');

  for (const rule of policy.rules) {
    lines.push(`  - id: ${rule.id}`);
    lines.push(`    name: ${yamlString(rule.name)}`);
    lines.push(`    description: ${yamlString(rule.description)}`);
    lines.push(`    enabled: ${rule.enabled}`);
    lines.push(`    severity: ${rule.severity}`);
    lines.push(`    action: ${rule.action}`);

    lines.push('    tools:');
    for (const tool of rule.tools) {
      lines.push(`      - ${tool}`);
    }

    lines.push('    conditions:');
    for (const condition of rule.conditions) {
      lines.push(`      - field: ${condition.field}`);
      lines.push(`        operator: ${condition.operator}`);
      lines.push(`        value: ${yamlValue(condition.value)}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Serialize test cases to YAML string.
 */
export function serializeTestCases(testCases: GeneratedTestCase[]): string {
  const lines: string[] = [];

  lines.push('test_cases:');

  for (const tc of testCases) {
    lines.push(`  - name: ${yamlString(tc.name)}`);
    lines.push(`    description: ${yamlString(tc.description)}`);
    lines.push(`    expected_decision: ${tc.expectedDecision}`);
    lines.push('    tool_call:');
    lines.push(`      tool: ${tc.toolCall.tool}`);
    lines.push('      arguments:');

    for (const [key, value] of Object.entries(tc.toolCall.arguments)) {
      lines.push(`        ${key}: ${yamlValue(value)}`);
    }
  }

  return lines.join('\n') + '\n';
}

function yamlString(value: string): string {
  if (needsQuoting(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

function yamlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => yamlValue(v));
    return `[${items.join(', ')}]`;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function needsQuoting(value: string): boolean {
  if (value.length === 0) return true;
  if (/^[\s#]/.test(value)) return true;
  if (/[:{},&*?|>!%@`'"[\]]/.test(value)) return true;
  if (['true', 'false', 'null', 'yes', 'no', 'on', 'off'].includes(value.toLowerCase())) return true;
  return false;
}
