import { describe, it, expect } from 'vitest';
import { validatePolicy } from '../../src/generator/validator.js';
import type { GeneratedPolicy } from '../../src/generator/types.js';
import { GeneratorValidationError } from '../../src/generator/types.js';

function makeValidPolicy(overrides?: Partial<GeneratedPolicy>): GeneratedPolicy {
  return {
    version: '1.0',
    name: 'test-policy',
    description: 'Test policy',
    rules: [{
      id: 'block-send-email-to',
      name: 'Block send_email to',
      description: 'Block external emails',
      enabled: true,
      severity: 'high',
      action: 'block',
      tools: ['send_email'],
      conditions: [
        { field: 'arguments.to', operator: 'contains', value: '@external.com' },
      ],
    }],
    ...overrides,
  };
}

describe('validatePolicy', () => {
  it('should accept a valid policy', () => {
    expect(() => validatePolicy(makeValidPolicy())).not.toThrow();
  });

  it('should reject policy without version', () => {
    expect(() => validatePolicy(makeValidPolicy({ version: '' }))).toThrow(GeneratorValidationError);
  });

  it('should reject policy without name', () => {
    expect(() => validatePolicy(makeValidPolicy({ name: '' }))).toThrow(GeneratorValidationError);
  });

  it('should reject policy with empty rules', () => {
    expect(() => validatePolicy(makeValidPolicy({ rules: [] }))).toThrow(GeneratorValidationError);
  });

  it('should reject duplicate rule IDs', () => {
    const policy = makeValidPolicy();
    policy.rules.push({ ...policy.rules[0] });
    expect(() => validatePolicy(policy)).toThrow(/Duplicate rule ID/);
  });

  it('should reject rule with invalid action', () => {
    const policy = makeValidPolicy();
    policy.rules[0].action = 'invalid' as any;
    expect(() => validatePolicy(policy)).toThrow(/Invalid rule action/);
  });

  it('should reject rule with invalid severity', () => {
    const policy = makeValidPolicy();
    policy.rules[0].severity = 'invalid' as any;
    expect(() => validatePolicy(policy)).toThrow(/Invalid rule severity/);
  });

  it('should reject rule with no tools', () => {
    const policy = makeValidPolicy();
    policy.rules[0].tools = [];
    expect(() => validatePolicy(policy)).toThrow(/at least one tool/);
  });

  it('should reject rule with no conditions', () => {
    const policy = makeValidPolicy();
    policy.rules[0].conditions = [];
    expect(() => validatePolicy(policy)).toThrow(/at least one condition/);
  });

  it('should reject condition with invalid operator', () => {
    const policy = makeValidPolicy();
    policy.rules[0].conditions[0].operator = 'invalid' as any;
    expect(() => validatePolicy(policy)).toThrow(/Invalid condition operator/);
  });

  it('should reject numeric operator with string value', () => {
    const policy = makeValidPolicy();
    policy.rules[0].conditions = [
      { field: 'arguments.count', operator: 'greater_than', value: 'not-a-number' },
    ];
    expect(() => validatePolicy(policy)).toThrow(/requires a numeric value/);
  });

  it('should reject in/not_in operator with non-array value', () => {
    const policy = makeValidPolicy();
    policy.rules[0].conditions = [
      { field: 'arguments.type', operator: 'in', value: 'string' },
    ];
    expect(() => validatePolicy(policy)).toThrow(/requires an array value/);
  });

  it('should reject contains operator with non-string value', () => {
    const policy = makeValidPolicy();
    policy.rules[0].conditions = [
      { field: 'arguments.path', operator: 'contains', value: 123 },
    ];
    expect(() => validatePolicy(policy)).toThrow(/requires a string value/);
  });

  it('should reject rule with non-kebab-case id', () => {
    const policy = makeValidPolicy();
    policy.rules[0].id = 'InvalidCamelCase';
    expect(() => validatePolicy(policy)).toThrow(/lowercase kebab-case/);
  });

  it('should accept all valid actions', () => {
    for (const action of ['block', 'warn', 'log', 'allow'] as const) {
      const policy = makeValidPolicy();
      policy.rules[0].action = action;
      expect(() => validatePolicy(policy)).not.toThrow();
    }
  });

  it('should accept all valid severities', () => {
    for (const severity of ['critical', 'high', 'medium', 'low', 'info'] as const) {
      const policy = makeValidPolicy();
      policy.rules[0].severity = severity;
      expect(() => validatePolicy(policy)).not.toThrow();
    }
  });
});
