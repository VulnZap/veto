import { describe, it, expect } from 'vitest';
import { normalizePolicy } from '../../src/generator/normalizer.js';
import type { GeneratedPolicy } from '../../src/generator/types.js';

describe('normalizePolicy', () => {
  const basePolicy: GeneratedPolicy = {
    version: '1.0',
    name: 'Test Policy',
    description: 'A test policy',
    rules: [
      {
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
      },
    ],
  };

  it('should lowercase and kebab-case policy name', () => {
    const result = normalizePolicy({
      ...basePolicy,
      name: 'My Test Policy',
    });
    expect(result.name).toBe('my-test-policy');
  });

  it('should trim whitespace from version and description', () => {
    const result = normalizePolicy({
      ...basePolicy,
      version: '  1.0  ',
      description: '  A test policy  ',
    });
    expect(result.version).toBe('1.0');
    expect(result.description).toBe('A test policy');
  });

  it('should lowercase and sort tool names', () => {
    const policy: GeneratedPolicy = {
      ...basePolicy,
      rules: [{
        ...basePolicy.rules[0],
        tools: ['Send_Email', 'Execute_Command'],
      }],
    };
    const result = normalizePolicy(policy);
    expect(result.rules[0].tools).toEqual(['execute_command', 'send_email']);
  });

  it('should sort conditions by field name', () => {
    const policy: GeneratedPolicy = {
      ...basePolicy,
      rules: [{
        ...basePolicy.rules[0],
        conditions: [
          { field: 'arguments.to', operator: 'contains', value: 'test' },
          { field: 'arguments.body', operator: 'contains', value: 'password' },
        ],
      }],
    };
    const result = normalizePolicy(policy);
    expect(result.rules[0].conditions[0].field).toBe('arguments.body');
    expect(result.rules[0].conditions[1].field).toBe('arguments.to');
  });

  it('should sort rules by severity (critical first), then by id', () => {
    const policy: GeneratedPolicy = {
      ...basePolicy,
      rules: [
        { ...basePolicy.rules[0], id: 'rule-b', severity: 'low' },
        { ...basePolicy.rules[0], id: 'rule-a', severity: 'critical' },
        { ...basePolicy.rules[0], id: 'rule-c', severity: 'low' },
      ],
    };
    const result = normalizePolicy(policy);
    expect(result.rules.map((r) => r.id)).toEqual(['rule-a', 'rule-b', 'rule-c']);
  });

  it('should trim string values in conditions', () => {
    const policy: GeneratedPolicy = {
      ...basePolicy,
      rules: [{
        ...basePolicy.rules[0],
        conditions: [
          { field: '  arguments.to  ', operator: 'contains', value: '  @external.com  ' },
        ],
      }],
    };
    const result = normalizePolicy(policy);
    expect(result.rules[0].conditions[0].field).toBe('arguments.to');
    expect(result.rules[0].conditions[0].value).toBe('@external.com');
  });

  it('should sort array values', () => {
    const policy: GeneratedPolicy = {
      ...basePolicy,
      rules: [{
        ...basePolicy.rules[0],
        conditions: [
          { field: 'arguments.type', operator: 'in', value: ['c', 'a', 'b'] },
        ],
      }],
    };
    const result = normalizePolicy(policy);
    expect(result.rules[0].conditions[0].value).toEqual(['a', 'b', 'c']);
  });

  it('should produce deterministic output for same input', () => {
    const result1 = normalizePolicy(basePolicy);
    const result2 = normalizePolicy(basePolicy);
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });
});
