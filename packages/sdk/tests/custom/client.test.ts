import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CustomClient, type CustomClientOptions } from '../../src/custom/client.js';
import { CustomError, CustomParseError, type CustomConfig } from '../../src/custom/types.js';
import type { Rule } from '../../src/rules/types.js';
import { createLogger } from '../../src/utils/logger.js';

describe('CustomClient', () => {
  const mockLogger = createLogger('silent');
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.OPENROUTER_API_KEY = 'or-test';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const client = new CustomClient({
        config,
        logger: mockLogger,
      });

      expect(client).toBeDefined();
    });

    it('should throw when API key is missing', () => {
      delete process.env.OPENAI_API_KEY;

      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      expect(() => new CustomClient({ config, logger: mockLogger })).toThrow(
        'API key for openai not found'
      );
    });
  });

  describe('parseResponse', () => {
    it('should parse valid JSON response', async () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const client = new CustomClient({ config, logger: mockLogger });
      
      const validResponse = JSON.stringify({
        pass_weight: 0.9,
        block_weight: 0.1,
        decision: 'pass',
        reasoning: 'Tool call is safe',
      });

      const result = (client as any).parseResponse(validResponse);

      expect(result.decision).toBe('pass');
      expect(result.pass_weight).toBe(0.9);
      expect(result.block_weight).toBe(0.1);
      expect(result.reasoning).toBe('Tool call is safe');
    });

    it('should extract JSON from mixed content', async () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const client = new CustomClient({ config, logger: mockLogger });
      
      const mixedResponse = `Here is my analysis:
{"pass_weight": 0.2, "block_weight": 0.8, "decision": "block", "reasoning": "Dangerous operation"}
That's my verdict.`;

      const result = (client as any).parseResponse(mixedResponse);

      expect(result.decision).toBe('block');
      expect(result.block_weight).toBe(0.8);
    });

    it('should throw CustomParseError when no JSON found', async () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const client = new CustomClient({ config, logger: mockLogger });

      expect(() => (client as any).parseResponse('No JSON here')).toThrow(
        CustomParseError
      );
    });

    it('should throw CustomParseError for invalid JSON', async () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const client = new CustomClient({ config, logger: mockLogger });

      expect(() => (client as any).parseResponse('{invalid json}')).toThrow(
        CustomParseError
      );
    });

    it('should throw CustomParseError when pass_weight is missing', async () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const client = new CustomClient({ config, logger: mockLogger });
      
      const invalidResponse = JSON.stringify({
        block_weight: 0.5,
        decision: 'pass',
        reasoning: 'Test',
      });

      expect(() => (client as any).parseResponse(invalidResponse)).toThrow(
        'Missing or invalid pass_weight'
      );
    });

    it('should throw CustomParseError when decision is invalid', async () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const client = new CustomClient({ config, logger: mockLogger });
      
      const invalidResponse = JSON.stringify({
        pass_weight: 0.5,
        block_weight: 0.5,
        decision: 'invalid',
        reasoning: 'Test',
      });

      expect(() => (client as any).parseResponse(invalidResponse)).toThrow(
        'Missing or invalid decision'
      );
    });

    it('should include matched_rules when present', async () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const client = new CustomClient({ config, logger: mockLogger });
      
      const responseWithRules = JSON.stringify({
        pass_weight: 0.1,
        block_weight: 0.9,
        decision: 'block',
        reasoning: 'Matches security rule',
        matched_rules: ['rule-1', 'rule-2'],
      });

      const result = (client as any).parseResponse(responseWithRules);

      expect(result.matched_rules).toEqual(['rule-1', 'rule-2']);
    });

    it('should filter non-string matched_rules', async () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const client = new CustomClient({ config, logger: mockLogger });
      
      const responseWithMixedRules = JSON.stringify({
        pass_weight: 0.1,
        block_weight: 0.9,
        decision: 'block',
        reasoning: 'Test',
        matched_rules: ['rule-1', 123, null, 'rule-2'],
      });

      const result = (client as any).parseResponse(responseWithMixedRules);

      expect(result.matched_rules).toEqual(['rule-1', 'rule-2']);
    });
  });

  describe('healthCheck', () => {
    it('should return false when provider is unavailable', async () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const client = new CustomClient({ config, logger: mockLogger });
      
      vi.spyOn(client, 'evaluate').mockRejectedValue(new Error('Network error'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });
  });
});
