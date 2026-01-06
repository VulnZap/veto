import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveCustomConfig,
  CustomAPIKeyError,
  CustomError,
  CustomParseError,
  PROVIDER_ENV_VARS,
  PROVIDER_BASE_URLS,
  CUSTOM_DEFAULTS,
  type CustomConfig,
  type CustomProvider,
} from '../../src/custom/types.js';

describe('Custom Types', () => {
  describe('resolveCustomConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should resolve config with explicit apiKey', () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test-key',
      };

      const resolved = resolveCustomConfig(config);

      expect(resolved.provider).toBe('openai');
      expect(resolved.model).toBe('gpt-4o');
      expect(resolved.apiKey).toBe('sk-test-key');
      expect(resolved.temperature).toBe(CUSTOM_DEFAULTS.temperature);
      expect(resolved.maxTokens).toBe(CUSTOM_DEFAULTS.maxTokens);
      expect(resolved.timeout).toBe(CUSTOM_DEFAULTS.timeout);
      expect(resolved.baseUrl).toBe(PROVIDER_BASE_URLS.openai);
    });

    it('should resolve apiKey from environment variable', () => {
      process.env.OPENAI_API_KEY = 'sk-from-env';

      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      const resolved = resolveCustomConfig(config);

      expect(resolved.apiKey).toBe('sk-from-env');
    });

    it('should throw CustomAPIKeyError when apiKey is missing', () => {
      delete process.env.OPENAI_API_KEY;

      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
      };

      expect(() => resolveCustomConfig(config)).toThrow(CustomAPIKeyError);
      expect(() => resolveCustomConfig(config)).toThrow(
        'API key for openai not found. Set OPENAI_API_KEY environment variable or provide apiKey in config.'
      );
    });

    it('should use custom temperature when provided', () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test',
        temperature: 0.5,
      };

      const resolved = resolveCustomConfig(config);

      expect(resolved.temperature).toBe(0.5);
    });

    it('should use custom maxTokens when provided', () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test',
        maxTokens: 1000,
      };

      const resolved = resolveCustomConfig(config);

      expect(resolved.maxTokens).toBe(1000);
    });

    it('should use custom baseUrl when provided', () => {
      const config: CustomConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-test',
        baseUrl: 'https://custom-api.example.com',
      };

      const resolved = resolveCustomConfig(config);

      expect(resolved.baseUrl).toBe('https://custom-api.example.com');
    });

    it('should resolve anthropic config correctly', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      const config: CustomConfig = {
        provider: 'anthropic',
        model: 'claude-3-opus',
      };

      const resolved = resolveCustomConfig(config);

      expect(resolved.provider).toBe('anthropic');
      expect(resolved.apiKey).toBe('sk-ant-test');
      expect(resolved.baseUrl).toBeUndefined();
    });

    it('should resolve gemini config correctly', () => {
      process.env.GEMINI_API_KEY = 'gemini-test-key';

      const config: CustomConfig = {
        provider: 'gemini',
        model: 'gemini-pro',
      };

      const resolved = resolveCustomConfig(config);

      expect(resolved.provider).toBe('gemini');
      expect(resolved.apiKey).toBe('gemini-test-key');
      expect(resolved.baseUrl).toBeUndefined();
    });

    it('should resolve openrouter config with correct baseUrl', () => {
      process.env.OPENROUTER_API_KEY = 'or-test-key';

      const config: CustomConfig = {
        provider: 'openrouter',
        model: 'anthropic/claude-3-opus',
      };

      const resolved = resolveCustomConfig(config);

      expect(resolved.provider).toBe('openrouter');
      expect(resolved.apiKey).toBe('or-test-key');
      expect(resolved.baseUrl).toBe('https://openrouter.ai/api/v1');
    });
  });

  describe('PROVIDER_ENV_VARS', () => {
    it('should have correct env var names for all providers', () => {
      expect(PROVIDER_ENV_VARS.openai).toBe('OPENAI_API_KEY');
      expect(PROVIDER_ENV_VARS.anthropic).toBe('ANTHROPIC_API_KEY');
      expect(PROVIDER_ENV_VARS.gemini).toBe('GEMINI_API_KEY');
      expect(PROVIDER_ENV_VARS.openrouter).toBe('OPENROUTER_API_KEY');
    });
  });

  describe('PROVIDER_BASE_URLS', () => {
    it('should have correct base URLs for providers that need them', () => {
      expect(PROVIDER_BASE_URLS.openai).toBe('https://api.openai.com/v1');
      expect(PROVIDER_BASE_URLS.openrouter).toBe('https://openrouter.ai/api/v1');
      expect(PROVIDER_BASE_URLS.anthropic).toBeUndefined();
      expect(PROVIDER_BASE_URLS.gemini).toBeUndefined();
    });
  });

  describe('CUSTOM_DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(CUSTOM_DEFAULTS.temperature).toBe(0.1);
      expect(CUSTOM_DEFAULTS.maxTokens).toBe(500);
      expect(CUSTOM_DEFAULTS.timeout).toBe(30000);
    });
  });

  describe('CustomError', () => {
    it('should create error with message', () => {
      const error = new CustomError('Test error message');

      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('CustomError');
      expect(error.cause).toBeUndefined();
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new CustomError('Wrapped error', cause);

      expect(error.message).toBe('Wrapped error');
      expect(error.cause).toBe(cause);
    });
  });

  describe('CustomParseError', () => {
    it('should create parse error with raw response', () => {
      const error = new CustomParseError('Invalid JSON', 'not valid json');

      expect(error.message).toBe('Invalid JSON');
      expect(error.name).toBe('CustomParseError');
      expect(error.rawResponse).toBe('not valid json');
    });
  });

  describe('CustomAPIKeyError', () => {
    it('should create API key error with provider info', () => {
      const error = new CustomAPIKeyError('openai', 'OPENAI_API_KEY');

      expect(error.message).toBe(
        'API key for openai not found. Set OPENAI_API_KEY environment variable or provide apiKey in config.'
      );
      expect(error.name).toBe('CustomAPIKeyError');
      expect(error.provider).toBe('openai');
    });
  });
});
