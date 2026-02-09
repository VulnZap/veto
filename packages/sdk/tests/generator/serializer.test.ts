import { describe, it, expect } from 'vitest';
import { serializePolicy, serializeTestCases } from '../../src/generator/serializer.js';
import type { GeneratedPolicy, GeneratedTestCase } from '../../src/generator/types.js';

describe('serializePolicy', () => {
  const policy: GeneratedPolicy = {
    version: '1.0',
    name: 'send-email-policy',
    description: 'Block external emails',
    rules: [{
      id: 'block-send-email-to',
      name: 'Block send_email to',
      description: 'Block emails to external domains',
      enabled: true,
      severity: 'high',
      action: 'block',
      tools: ['send_email'],
      conditions: [
        { field: 'arguments.to', operator: 'contains', value: '@external.com' },
      ],
    }],
  };

  it('should produce valid YAML with version', () => {
    const yaml = serializePolicy(policy);
    expect(yaml).toContain('version: "1.0"');
  });

  it('should include policy name', () => {
    const yaml = serializePolicy(policy);
    expect(yaml).toContain('name: send-email-policy');
  });

  it('should include rules section', () => {
    const yaml = serializePolicy(policy);
    expect(yaml).toContain('rules:');
    expect(yaml).toContain('  - id: block-send-email-to');
  });

  it('should include conditions', () => {
    const yaml = serializePolicy(policy);
    expect(yaml).toContain('      - field: arguments.to');
    expect(yaml).toContain('        operator: contains');
    expect(yaml).toContain('        value: "@external.com"');
  });

  it('should include tools list', () => {
    const yaml = serializePolicy(policy);
    expect(yaml).toContain('    tools:');
    expect(yaml).toContain('      - send_email');
  });

  it('should end with newline', () => {
    const yaml = serializePolicy(policy);
    expect(yaml.endsWith('\n')).toBe(true);
  });

  it('should handle numeric values', () => {
    const numPolicy: GeneratedPolicy = {
      ...policy,
      rules: [{
        ...policy.rules[0],
        conditions: [
          { field: 'arguments.count', operator: 'greater_than', value: 100 },
        ],
      }],
    };
    const yaml = serializePolicy(numPolicy);
    expect(yaml).toContain('value: 100');
  });

  it('should handle array values', () => {
    const arrayPolicy: GeneratedPolicy = {
      ...policy,
      rules: [{
        ...policy.rules[0],
        conditions: [
          { field: 'arguments.type', operator: 'in', value: ['admin', 'root'] },
        ],
      }],
    };
    const yaml = serializePolicy(arrayPolicy);
    expect(yaml).toContain('value: ["admin", "root"]');
  });
});

describe('serializeTestCases', () => {
  const testCases: GeneratedTestCase[] = [
    {
      name: 'should block external email',
      description: 'Tests that external email is blocked',
      toolCall: { tool: 'send_email', arguments: { to: 'user@external.com' } },
      expectedDecision: 'block',
    },
    {
      name: 'should allow internal email',
      description: 'Tests that internal email is allowed',
      toolCall: { tool: 'send_email', arguments: { to: 'user@internal.com' } },
      expectedDecision: 'allow',
    },
  ];

  it('should produce YAML with test_cases section', () => {
    const yaml = serializeTestCases(testCases);
    expect(yaml).toContain('test_cases:');
  });

  it('should include test names', () => {
    const yaml = serializeTestCases(testCases);
    expect(yaml).toContain('should block external email');
    expect(yaml).toContain('should allow internal email');
  });

  it('should include expected decisions', () => {
    const yaml = serializeTestCases(testCases);
    expect(yaml).toContain('expected_decision: block');
    expect(yaml).toContain('expected_decision: allow');
  });

  it('should include tool call arguments', () => {
    const yaml = serializeTestCases(testCases);
    expect(yaml).toContain('tool: send_email');
    expect(yaml).toContain('to: "user@external.com"');
  });
});
