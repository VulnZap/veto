import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseIntent } from '../../src/generator/intent-parser.js';
import { GeneratorError } from '../../src/generator/types.js';
import type { ResolvedCustomConfig } from '../../src/custom/types.js';
import { silentLogger } from '../../src/utils/logger.js';

// Mock all LLM providers
vi.mock('../../src/custom/providers/openai.js', () => ({
  callOpenAI: vi.fn(),
}));
vi.mock('../../src/custom/providers/anthropic.js', () => ({
  callAnthropic: vi.fn(),
}));
vi.mock('../../src/custom/providers/gemini.js', () => ({
  callGemini: vi.fn(),
}));
vi.mock('../../src/custom/providers/openrouter.js', () => ({
  callOpenRouter: vi.fn(),
}));

import { callOpenAI } from '../../src/custom/providers/openai.js';

const mockCallOpenAI = vi.mocked(callOpenAI);

const config: ResolvedCustomConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: 'test-key',
  temperature: 0.2,
  maxTokens: 1024,
  timeout: 30000,
};

const validLLMResponse = JSON.stringify({
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
  tags: ['security', 'data-protection'],
});

describe('parseIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse a valid LLM response into a GeneratorIntent', async () => {
    mockCallOpenAI.mockResolvedValueOnce(validLLMResponse);

    const intent = await parseIntent('Block emails to external domains', config, silentLogger, 0);

    expect(intent.toolName).toBe('send_email');
    expect(intent.description).toBe('Block emails to external domains');
    expect(intent.action).toBe('block');
    expect(intent.severity).toBe('high');
    expect(intent.constraints).toHaveLength(1);
    expect(intent.constraints[0].field).toBe('arguments.to');
    expect(intent.constraints[0].operator).toBe('contains');
    expect(intent.tags).toEqual(['security', 'data-protection']);
  });

  it('should extract JSON from response with surrounding text', async () => {
    mockCallOpenAI.mockResolvedValueOnce(`Here is the intent:\n${validLLMResponse}\n\nDone.`);

    const intent = await parseIntent('test', config, silentLogger, 0);
    expect(intent.toolName).toBe('send_email');
  });

  it('should reject response with missing toolName', async () => {
    const badResponse = JSON.stringify({ description: 'test', action: 'block', severity: 'high', constraints: [{ field: 'a', type: 'string_pattern', operator: 'equals', value: 'x' }], tags: [] });
    mockCallOpenAI.mockResolvedValueOnce(badResponse);

    await expect(parseIntent('test', config, silentLogger, 0)).rejects.toThrow(GeneratorError);
  });

  it('should reject response with invalid action', async () => {
    const badResponse = JSON.stringify({
      toolName: 'test', description: 'test', action: 'destroy',
      severity: 'high', constraints: [{ field: 'a', type: 'string_pattern', operator: 'equals', value: 'x' }], tags: [],
    });
    mockCallOpenAI.mockResolvedValueOnce(badResponse);

    await expect(parseIntent('test', config, silentLogger, 0)).rejects.toThrow(GeneratorError);
  });

  it('should reject response with invalid operator', async () => {
    const badResponse = JSON.stringify({
      toolName: 'test', description: 'test', action: 'block',
      severity: 'high', constraints: [{ field: 'a', type: 'string_pattern', operator: 'like', value: 'x' }], tags: [],
    });
    mockCallOpenAI.mockResolvedValueOnce(badResponse);

    await expect(parseIntent('test', config, silentLogger, 0)).rejects.toThrow(GeneratorError);
  });

  it('should reject response with empty constraints', async () => {
    const badResponse = JSON.stringify({
      toolName: 'test', description: 'test', action: 'block',
      severity: 'high', constraints: [], tags: [],
    });
    mockCallOpenAI.mockResolvedValueOnce(badResponse);

    await expect(parseIntent('test', config, silentLogger, 0)).rejects.toThrow(GeneratorError);
  });

  it('should retry on failure up to maxRetries', async () => {
    mockCallOpenAI
      .mockRejectedValueOnce(new Error('API error'))
      .mockRejectedValueOnce(new Error('API error again'))
      .mockResolvedValueOnce(validLLMResponse);

    const intent = await parseIntent('test', config, silentLogger, 2);
    expect(intent.toolName).toBe('send_email');
    expect(mockCallOpenAI).toHaveBeenCalledTimes(3);
  });

  it('should throw after all retries exhausted', async () => {
    mockCallOpenAI
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'));

    await expect(parseIntent('test', config, silentLogger, 1)).rejects.toThrow(/Failed to parse intent after 2 attempts/);
  });

  it('should reject non-JSON response', async () => {
    mockCallOpenAI.mockResolvedValueOnce('This is just plain text with no JSON');

    await expect(parseIntent('test', config, silentLogger, 0)).rejects.toThrow(GeneratorError);
  });

  it('should handle tags being absent (default to empty array)', async () => {
    const noTagsResponse = JSON.stringify({
      toolName: 'test_tool', description: 'test', action: 'block',
      severity: 'high', constraints: [{ field: 'arguments.x', type: 'string_pattern', operator: 'equals', value: 'y' }],
    });
    mockCallOpenAI.mockResolvedValueOnce(noTagsResponse);

    const intent = await parseIntent('test', config, silentLogger, 0);
    expect(intent.tags).toEqual([]);
  });
});
