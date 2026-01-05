import { describe, it, expect } from 'vitest';
import { buildPrompt, buildSystemPrompt, formatToolCall, formatRules } from '../../src/kernel/prompt.js';
import type { Rule } from '../../src/rules/types.js';
import type { KernelToolCall } from '../../src/kernel/types.js';

describe('kernel prompt builder', () => {
  const sampleToolCall: KernelToolCall = {
    tool: 'execute_command',
    arguments: { command: 'rm -rf /var/log/*' },
  };

  const sampleRules: Rule[] = [
    {
      id: 'block-destructive-commands',
      name: 'Block destructive shell commands',
      enabled: true,
      severity: 'critical',
      action: 'block',
      tools: ['execute_command'],
      conditions: [
        { field: 'arguments.command', operator: 'contains', value: 'rm -rf' },
      ],
    },
  ];

  describe('buildSystemPrompt', () => {
    it('should return the guardrail system prompt', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('security guardrail');
      expect(prompt).toContain('tool call');
      expect(prompt).toContain('JSON only');
      expect(prompt).toContain('pass_weight');
      expect(prompt).toContain('block_weight');
      expect(prompt).toContain('decision');
      expect(prompt).toContain('reasoning');
    });
  });

  describe('formatToolCall', () => {
    it('should format tool call with name and arguments', () => {
      const formatted = formatToolCall(sampleToolCall);

      expect(formatted).toContain('TOOL CALL:');
      expect(formatted).toContain('tool: execute_command');
      expect(formatted).toContain('arguments:');
      expect(formatted).toContain('command: "rm -rf /var/log/*"');
    });

    it('should handle multiple arguments', () => {
      const toolCall: KernelToolCall = {
        tool: 'write_file',
        arguments: { path: '/etc/passwd', content: 'malicious' },
      };

      const formatted = formatToolCall(toolCall);

      expect(formatted).toContain('path: "/etc/passwd"');
      expect(formatted).toContain('content: "malicious"');
    });

    it('should handle nested object arguments', () => {
      const toolCall: KernelToolCall = {
        tool: 'api_call',
        arguments: { 
          url: 'https://api.example.com',
          options: { method: 'POST', headers: { auth: 'token' } },
        },
      };

      const formatted = formatToolCall(toolCall);

      expect(formatted).toContain('url: "https://api.example.com"');
      expect(formatted).toContain('options:');
    });

    it('should handle empty arguments', () => {
      const toolCall: KernelToolCall = {
        tool: 'list_files',
        arguments: {},
      };

      const formatted = formatToolCall(toolCall);

      expect(formatted).toContain('tool: list_files');
      expect(formatted).toContain('arguments:');
    });
  });

  describe('formatRules', () => {
    it('should format single rule with all fields', () => {
      const formatted = formatRules(sampleRules);

      expect(formatted).toContain('RULES:');
      expect(formatted).toContain('- id: block-destructive-commands');
      expect(formatted).toContain('name: Block destructive shell commands');
      expect(formatted).toContain('enabled: true');
      expect(formatted).toContain('severity: critical');
      expect(formatted).toContain('action: block');
      expect(formatted).toContain('tools: [execute_command]');
      expect(formatted).toContain('conditions:');
      expect(formatted).toContain('field: arguments.command');
      expect(formatted).toContain('operator: contains');
      expect(formatted).toContain('value: "rm -rf"');
    });

    it('should format multiple rules', () => {
      const rules: Rule[] = [
        ...sampleRules,
        {
          id: 'block-etc-access',
          name: 'Block /etc file access',
          enabled: true,
          severity: 'high',
          action: 'block',
          tools: ['read_file', 'write_file'],
          conditions: [
            { field: 'arguments.path', operator: 'starts_with', value: '/etc/' },
          ],
        },
      ];

      const formatted = formatRules(rules);

      expect(formatted).toContain('- id: block-destructive-commands');
      expect(formatted).toContain('- id: block-etc-access');
      expect(formatted).toContain('tools: [read_file, write_file]');
    });

    it('should handle rules with condition_groups', () => {
      const rules: Rule[] = [
        {
          id: 'complex-rule',
          name: 'Complex rule with groups',
          enabled: true,
          severity: 'medium',
          action: 'block',
          condition_groups: [
            [{ field: 'arguments.a', operator: 'equals', value: '1' }],
            [{ field: 'arguments.b', operator: 'equals', value: '2' }],
          ],
        },
      ];

      const formatted = formatRules(rules);

      expect(formatted).toContain('condition_groups:');
    });

    it('should handle rules without tools (global rules)', () => {
      const rules: Rule[] = [
        {
          id: 'global-rule',
          name: 'Applies to all tools',
          enabled: true,
          severity: 'low',
          action: 'warn',
        },
      ];

      const formatted = formatRules(rules);

      expect(formatted).toContain('- id: global-rule');
      // Should not have tools field or should have empty
    });
  });

  describe('buildPrompt', () => {
    it('should combine tool call and rules into user prompt', () => {
      const prompt = buildPrompt(sampleToolCall, sampleRules);

      expect(prompt).toContain('TOOL CALL:');
      expect(prompt).toContain('tool: execute_command');
      expect(prompt).toContain('RULES:');
      expect(prompt).toContain('- id: block-destructive-commands');
    });

    it('should separate sections with blank line', () => {
      const prompt = buildPrompt(sampleToolCall, sampleRules);

      // Tool call section followed by blank line then rules
      expect(prompt).toMatch(/arguments:\n\s+command:.*\n\nRULES:/s);
    });
  });
});
