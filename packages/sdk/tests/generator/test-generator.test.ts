import { describe, it, expect } from 'vitest';
import { generateTestCases } from '../../src/generator/test-generator.js';
import type { GeneratedPolicy } from '../../src/generator/types.js';

function makePolicy(): GeneratedPolicy {
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
  };
}

describe('generateTestCases', () => {
  it('should generate two test cases per rule (violating + safe)', () => {
    const testCases = generateTestCases(makePolicy());
    expect(testCases).toHaveLength(2);
  });

  it('should generate a blocking test case for block rules', () => {
    const testCases = generateTestCases(makePolicy());
    const blockCase = testCases.find((tc) => tc.expectedDecision === 'block');
    expect(blockCase).toBeDefined();
    expect(blockCase!.toolCall.tool).toBe('send_email');
  });

  it('should generate an allow test case for safe calls', () => {
    const testCases = generateTestCases(makePolicy());
    const allowCase = testCases.find((tc) => tc.expectedDecision === 'allow');
    expect(allowCase).toBeDefined();
    expect(allowCase!.toolCall.tool).toBe('send_email');
  });

  it('should produce violating args that contain the constrained value', () => {
    const testCases = generateTestCases(makePolicy());
    const blockCase = testCases.find((tc) => tc.expectedDecision === 'block')!;
    const toValue = blockCase.toolCall.arguments['to'] as string;
    expect(toValue).toContain('@external.com');
  });

  it('should produce safe args that do NOT contain the constrained value', () => {
    const testCases = generateTestCases(makePolicy());
    const allowCase = testCases.find((tc) => tc.expectedDecision === 'allow')!;
    const toValue = allowCase.toolCall.arguments['to'] as string;
    expect(toValue).not.toContain('@external.com');
  });

  it('should handle starts_with operator', () => {
    const policy = makePolicy();
    policy.rules[0].conditions = [
      { field: 'arguments.path', operator: 'starts_with', value: '/etc' },
    ];
    const testCases = generateTestCases(policy);
    const blockCase = testCases.find((tc) => tc.expectedDecision === 'block')!;
    expect((blockCase.toolCall.arguments['path'] as string).startsWith('/etc')).toBe(true);
  });

  it('should handle greater_than operator', () => {
    const policy = makePolicy();
    policy.rules[0].conditions = [
      { field: 'arguments.count', operator: 'greater_than', value: 100 },
    ];
    const testCases = generateTestCases(policy);
    const blockCase = testCases.find((tc) => tc.expectedDecision === 'block')!;
    expect(blockCase.toolCall.arguments['count']).toBe(101);
    const allowCase = testCases.find((tc) => tc.expectedDecision === 'allow')!;
    expect(allowCase.toolCall.arguments['count']).toBe(99);
  });

  it('should handle in operator', () => {
    const policy = makePolicy();
    policy.rules[0].conditions = [
      { field: 'arguments.type', operator: 'in', value: ['admin', 'root'] },
    ];
    const testCases = generateTestCases(policy);
    const blockCase = testCases.find((tc) => tc.expectedDecision === 'block')!;
    expect(blockCase.toolCall.arguments['type']).toBe('admin');
  });

  it('should handle nested field paths', () => {
    const policy = makePolicy();
    policy.rules[0].conditions = [
      { field: 'arguments.config.secret', operator: 'equals', value: true },
    ];
    const testCases = generateTestCases(policy);
    const blockCase = testCases.find((tc) => tc.expectedDecision === 'block')!;
    const config = blockCase.toolCall.arguments['config'] as Record<string, unknown>;
    expect(config['secret']).toBe(true);
  });

  it('should handle warn action (treated as blocking)', () => {
    const policy = makePolicy();
    policy.rules[0].action = 'warn';
    const testCases = generateTestCases(policy);
    const blockCase = testCases.find((tc) => tc.expectedDecision === 'block');
    expect(blockCase).toBeDefined();
  });

  it('should handle log action (treated as non-blocking)', () => {
    const policy = makePolicy();
    policy.rules[0].action = 'log';
    const testCases = generateTestCases(policy);
    expect(testCases.every((tc) => tc.expectedDecision === 'allow')).toBe(true);
  });
});
