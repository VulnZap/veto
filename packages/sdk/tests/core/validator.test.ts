import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ValidationEngine,
  createPassthroughValidator,
  createBlocklistValidator,
  createAllowlistValidator,
} from '../../src/core/validator.js';
import type { ValidationContext, NamedValidator } from '../../src/types/config.js';

const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createContext = (overrides: Partial<ValidationContext> = {}): ValidationContext => ({
  toolName: 'test_tool',
  arguments: {},
  callId: 'call_123',
  timestamp: new Date(),
  callHistory: [],
  ...overrides,
});

describe('ValidationEngine', () => {
  let engine: ValidationEngine;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    engine = new ValidationEngine({
      logger: mockLogger,
      defaultDecision: 'allow',
    });
  });

  describe('addValidator', () => {
    it('should add a validator', () => {
      const validator: NamedValidator = {
        name: 'test',
        validate: () => ({ decision: 'allow' }),
      };

      engine.addValidator(validator);

      expect(engine.getValidators()).toHaveLength(1);
      expect(engine.getValidators()[0].name).toBe('test');
    });

    it('should add validators in priority order', () => {
      engine.addValidator({
        name: 'low',
        priority: 100,
        validate: () => ({ decision: 'allow' }),
      });
      engine.addValidator({
        name: 'high',
        priority: 10,
        validate: () => ({ decision: 'allow' }),
      });

      const validators = engine.getValidators();
      expect(validators[0].name).toBe('high');
      expect(validators[1].name).toBe('low');
    });
  });

  describe('addValidators', () => {
    it('should add multiple validators at once', () => {
      engine.addValidators([
        { name: 'v1', validate: () => ({ decision: 'allow' }) },
        { name: 'v2', validate: () => ({ decision: 'allow' }) },
      ]);

      expect(engine.getValidators()).toHaveLength(2);
    });
  });

  describe('removeValidator', () => {
    it('should remove a validator by name', () => {
      engine.addValidator({ name: 'to-remove', validate: () => ({ decision: 'allow' }) });
      engine.addValidator({ name: 'keep', validate: () => ({ decision: 'allow' }) });

      const removed = engine.removeValidator('to-remove');

      expect(removed).toBe(true);
      expect(engine.getValidators()).toHaveLength(1);
      expect(engine.getValidators()[0].name).toBe('keep');
    });

    it('should return false for non-existent validator', () => {
      const removed = engine.removeValidator('non-existent');

      expect(removed).toBe(false);
    });
  });

  describe('clearValidators', () => {
    it('should remove all validators', () => {
      engine.addValidator({ name: 'v1', validate: () => ({ decision: 'allow' }) });
      engine.addValidator({ name: 'v2', validate: () => ({ decision: 'allow' }) });

      engine.clearValidators();

      expect(engine.getValidators()).toHaveLength(0);
    });
  });

  describe('validate', () => {
    it('should return default decision when no validators', async () => {
      const result = await engine.validate(createContext());

      expect(result.finalResult.decision).toBe('allow');
      expect(result.validatorResults).toHaveLength(0);
    });

    it('should run all validators and return allow', async () => {
      engine.addValidator({
        name: 'v1',
        priority: 1,
        validate: () => ({ decision: 'allow' }),
      });
      engine.addValidator({
        name: 'v2',
        priority: 2,
        validate: () => ({ decision: 'allow' }),
      });

      const result = await engine.validate(createContext());

      expect(result.finalResult.decision).toBe('allow');
      expect(result.validatorResults).toHaveLength(2);
      expect(result.validatorResults[0].validatorName).toBe('v1');
      expect(result.validatorResults[1].validatorName).toBe('v2');
    });

    it('should stop on first deny', async () => {
      let v2Called = false;

      engine.addValidator({
        name: 'denier',
        priority: 1,
        validate: () => ({ decision: 'deny', reason: 'blocked' }),
      });
      engine.addValidator({
        name: 'never-called',
        priority: 2,
        validate: () => {
          v2Called = true;
          return { decision: 'allow' };
        },
      });

      const result = await engine.validate(createContext());

      expect(result.finalResult.decision).toBe('deny');
      expect(result.finalResult.reason).toBe('blocked');
      expect(v2Called).toBe(false);
      expect(result.validatorResults).toHaveLength(1);
    });

    it('should pass modified arguments to next validator', async () => {
      let receivedArgs: Record<string, unknown> = {};

      engine.addValidator({
        name: 'modifier',
        priority: 1,
        validate: () => ({
          decision: 'modify',
          modifiedArguments: { sanitized: true },
        }),
      });
      engine.addValidator({
        name: 'checker',
        priority: 2,
        validate: (ctx) => {
          receivedArgs = ctx.arguments;
          return { decision: 'allow' };
        },
      });

      await engine.validate(createContext({ arguments: { original: true } }));

      expect(receivedArgs).toEqual({ sanitized: true });
    });

    it('should handle async validators', async () => {
      engine.addValidator({
        name: 'async',
        validate: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return { decision: 'allow' };
        },
      });

      const result = await engine.validate(createContext());

      expect(result.finalResult.decision).toBe('allow');
      expect(result.totalDurationMs).toBeGreaterThan(0);
    });

    it('should treat validator errors as denials', async () => {
      engine.addValidator({
        name: 'thrower',
        validate: () => {
          throw new Error('Validator crashed');
        },
      });

      const result = await engine.validate(createContext());

      expect(result.finalResult.decision).toBe('deny');
      expect(result.finalResult.reason).toContain('Validator crashed');
    });

    it('should only run validators for matching tools', async () => {
      let v1Called = false;
      let v2Called = false;

      engine.addValidator({
        name: 'filtered',
        toolFilter: ['other_tool'],
        validate: () => {
          v1Called = true;
          return { decision: 'allow' };
        },
      });
      engine.addValidator({
        name: 'unfiltered',
        validate: () => {
          v2Called = true;
          return { decision: 'allow' };
        },
      });

      await engine.validate(createContext({ toolName: 'test_tool' }));

      expect(v1Called).toBe(false);
      expect(v2Called).toBe(true);
    });

    it('should run validators matching tool filter', async () => {
      let called = false;

      engine.addValidator({
        name: 'filtered',
        toolFilter: ['test_tool', 'other_tool'],
        validate: () => {
          called = true;
          return { decision: 'allow' };
        },
      });

      await engine.validate(createContext({ toolName: 'test_tool' }));

      expect(called).toBe(true);
    });
  });
});

describe('createPassthroughValidator', () => {
  it('should always allow', () => {
    const validator = createPassthroughValidator();
    const result = validator.validate(createContext());

    expect(result).toEqual({ decision: 'allow' });
    expect(validator.name).toBe('passthrough');
    expect(validator.priority).toBe(1000);
  });
});

describe('createBlocklistValidator', () => {
  it('should deny listed tools', () => {
    const validator = createBlocklistValidator(['dangerous', 'risky']);

    expect(validator.toolFilter).toEqual(['dangerous', 'risky']);

    const result = validator.validate(createContext({ toolName: 'dangerous' }));
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('dangerous');
  });

  it('should use custom reason', () => {
    const validator = createBlocklistValidator(['blocked'], 'Not permitted');

    const result = validator.validate(createContext({ toolName: 'blocked' }));

    expect(result.reason).toContain('Not permitted');
  });
});

describe('createAllowlistValidator', () => {
  it('should allow listed tools', () => {
    const validator = createAllowlistValidator(['safe', 'trusted']);

    const result = validator.validate(createContext({ toolName: 'safe' }));

    expect(result.decision).toBe('allow');
  });

  it('should deny unlisted tools', () => {
    const validator = createAllowlistValidator(['safe', 'trusted']);

    const result = validator.validate(createContext({ toolName: 'unknown' }));

    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('unknown');
  });

  it('should use custom reason', () => {
    const validator = createAllowlistValidator(['allowed'], 'Unauthorized');

    const result = validator.validate(createContext({ toolName: 'blocked' }));

    expect(result.reason).toContain('Unauthorized');
  });
});
