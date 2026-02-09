import { describe, it, expect } from 'vitest';
import { synthesizePolicy } from '../../src/generator/policy-synthesizer.js';
import type { GeneratorIntent } from '../../src/generator/types.js';

function makeIntent(overrides?: Partial<GeneratorIntent>): GeneratorIntent {
  return {
    toolName: 'send_email',
    description: 'Block emails to external domains',
    action: 'block',
    severity: 'high',
    constraints: [
      {
        field: 'arguments.to',
        type: 'string_pattern',
        operator: 'contains',
        value: '@external.com',
      },
    ],
    tags: ['security'],
    ...overrides,
  };
}

describe('synthesizePolicy', () => {
  it('should produce a policy with version 1.0', () => {
    const result = synthesizePolicy(makeIntent());
    expect(result.version).toBe('1.0');
  });

  it('should name the policy based on tool name', () => {
    const result = synthesizePolicy(makeIntent());
    expect(result.name).toBe('send_email-policy');
  });

  it('should carry over the description', () => {
    const result = synthesizePolicy(makeIntent());
    expect(result.description).toBe('Block emails to external domains');
  });

  it('should generate a single rule', () => {
    const result = synthesizePolicy(makeIntent());
    expect(result.rules).toHaveLength(1);
  });

  it('should create a kebab-case rule ID from action, tool, and first constraint field', () => {
    const result = synthesizePolicy(makeIntent());
    expect(result.rules[0].id).toBe('block-send-email-to');
  });

  it('should set the rule as enabled', () => {
    const result = synthesizePolicy(makeIntent());
    expect(result.rules[0].enabled).toBe(true);
  });

  it('should propagate severity and action', () => {
    const result = synthesizePolicy(makeIntent({ severity: 'critical', action: 'warn' }));
    expect(result.rules[0].severity).toBe('critical');
    expect(result.rules[0].action).toBe('warn');
  });

  it('should set tools array with the tool name', () => {
    const result = synthesizePolicy(makeIntent());
    expect(result.rules[0].tools).toEqual(['send_email']);
  });

  it('should map constraints to conditions', () => {
    const intent = makeIntent({
      constraints: [
        { field: 'arguments.to', type: 'string_pattern', operator: 'contains', value: '@external.com' },
        { field: 'arguments.body', type: 'string_length', operator: 'greater_than', value: 10000 },
      ],
    });
    const result = synthesizePolicy(intent);
    expect(result.rules[0].conditions).toHaveLength(2);
    expect(result.rules[0].conditions[0].field).toBe('arguments.to');
    expect(result.rules[0].conditions[1].field).toBe('arguments.body');
  });

  it('should generate a human-readable rule name', () => {
    const result = synthesizePolicy(makeIntent());
    expect(result.rules[0].name).toContain('Block');
    expect(result.rules[0].name).toContain('send_email');
  });
});
