import { describe, it, expect } from 'vitest';
import { buildUserPrompt, buildProviderMessages } from '../../src/custom/prompt.js';
import type { CustomToolCall } from '../../src/custom/types.js';
import type { Rule } from '../../src/rules/types.js';

describe('Custom Prompt', () => {
  const mockToolCall: CustomToolCall = {
    tool: 'read_file',
    arguments: { path: '/etc/passwd' },
  };

  const mockRules: Rule[] = [
    {
      id: 'block-system-paths',
      name: 'Block system path access',
      enabled: true,
      severity: 'critical',
      action: 'block',
      tools: ['read_file'],
      conditions: [
        {
          field: 'arguments.path',
          operator: 'starts_with',
          value: '/etc',
        },
      ],
    },
  ];

  describe('buildUserPrompt', () => {
    it('should build prompt with tool call and rules', () => {
      const prompt = buildUserPrompt(mockToolCall, mockRules);

      expect(prompt).toContain('TOOL CALL:');
      expect(prompt).toContain('tool: read_file');
      expect(prompt).toContain('path:');
      expect(prompt).toContain('/etc/passwd');
      expect(prompt).toContain('RULES:');
      expect(prompt).toContain('block-system-paths');
    });

    it('should handle empty rules array', () => {
      const prompt = buildUserPrompt(mockToolCall, []);

      expect(prompt).toContain('TOOL CALL:');
      expect(prompt).toContain('RULES:');
    });

    it('should handle complex arguments', () => {
      const complexToolCall: CustomToolCall = {
        tool: 'write_file',
        arguments: {
          path: '/home/user/file.txt',
          content: 'Hello, World!',
          options: {
            overwrite: true,
            encoding: 'utf-8',
          },
        },
      };

      const prompt = buildUserPrompt(complexToolCall, []);

      expect(prompt).toContain('tool: write_file');
      expect(prompt).toContain('path:');
      expect(prompt).toContain('content:');
    });
  });

  describe('buildProviderMessages', () => {
    const userPrompt = 'Test user prompt';

    it('should build OpenAI format messages', () => {
      const result = buildProviderMessages('openai', userPrompt);

      expect(result.messages).toBeDefined();
      expect(result.messages).toHaveLength(2);
      expect(result.messages![0].role).toBe('system');
      expect(result.messages![1].role).toBe('user');
      expect(result.messages![1].content).toBe(userPrompt);
    });

    it('should build OpenRouter format (same as OpenAI)', () => {
      const result = buildProviderMessages('openrouter', userPrompt);

      expect(result.messages).toBeDefined();
      expect(result.messages).toHaveLength(2);
      expect(result.messages![0].role).toBe('system');
      expect(result.messages![1].role).toBe('user');
    });

    it('should build Anthropic format with separate system prompt', () => {
      const result = buildProviderMessages('anthropic', userPrompt);

      expect(result.system).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].role).toBe('user');
      expect(result.messages![0].content).toBe(userPrompt);
    });

    it('should build Gemini format with contents array', () => {
      const result = buildProviderMessages('gemini', userPrompt);

      expect(result.contents).toBeDefined();
      expect(result.contents).toHaveLength(1);
      expect(result.contents![0].role).toBe('user');
      expect(result.contents![0].parts).toHaveLength(1);
      expect(result.contents![0].parts[0].text).toContain(userPrompt);
    });

    it('should include system prompt in Gemini user message', () => {
      const result = buildProviderMessages('gemini', userPrompt);

      const geminiContent = result.contents![0].parts[0].text;
      expect(geminiContent).toContain('security guardrail');
      expect(geminiContent).toContain(userPrompt);
    });

    it('should throw for unknown provider', () => {
      expect(() => buildProviderMessages('unknown' as any, userPrompt)).toThrow(
        'Unknown provider: unknown'
      );
    });
  });
});
