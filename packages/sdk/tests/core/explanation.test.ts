import { describe, it, expect, vi } from 'vitest';
import { ValidationEngine } from '../../src/core/validator.js';
import type { ValidationContext } from '../../src/types/config.js';
import { redactValue, createEmptyExplanation } from '../../src/types/explanation.js';

const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createContext = (overrides: Partial<ValidationContext> = {}): ValidationContext => ({
  toolName: 'test_tool',
  arguments: { path: '/etc/passwd', user: 'admin' },
  callId: 'call_123',
  timestamp: new Date(),
  callHistory: [],
  ...overrides,
});

describe('Decision Explainability', () => {
  describe('Verbosity: none', () => {
    it('should not produce explanation when verbosity is none', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'none' },
      });

      engine.addValidator({
        name: 'test',
        validate: () => ({ decision: 'allow' }),
      });

      const result = await engine.validate(createContext());

      expect(result.explanation).toBeUndefined();
      expect(result.finalResult.explanation).toBeUndefined();
    });

    it('should have zero overhead with no trace collection', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'none' },
      });

      let callCount = 0;
      engine.addValidator({
        name: 'counter',
        validate: () => {
          callCount++;
          return { decision: 'allow' };
        },
      });

      await engine.validate(createContext());
      expect(callCount).toBe(1);
      // No explanation means no trace overhead
    });
  });

  describe('Verbosity: simple', () => {
    it('should produce explanation with matched rules only', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'simple' },
      });

      engine.addValidator({
        name: 'allow-validator',
        validate: () => ({ decision: 'allow', reason: 'looks good' }),
      });
      engine.addValidator({
        name: 'deny-validator',
        priority: 200,
        validate: () => ({
          decision: 'deny',
          reason: 'blocked by policy',
          metadata: { matched_rules: ['rule-1'] },
        }),
      });

      const result = await engine.validate(createContext());

      expect(result.explanation).toBeDefined();
      const explanation = result.explanation!;
      expect(explanation.decision).toBe('deny');
      expect(explanation.verbosity).toBe('simple');
      expect(explanation.evaluatedRules).toBe(2);
      expect(explanation.matchedRules).toBe(1);
      expect(explanation.trace.length).toBeGreaterThan(0);
      expect(explanation.trace[0].ruleId).toBe('rule-1');
    });

    it('should not include trace for passing validators in simple mode', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'simple' },
      });

      engine.addValidator({
        name: 'allow-only',
        validate: () => ({ decision: 'allow' }),
      });

      const result = await engine.validate(createContext());

      expect(result.explanation).toBeDefined();
      expect(result.explanation!.trace).toHaveLength(0);
      expect(result.explanation!.decision).toBe('allow');
    });
  });

  describe('Verbosity: verbose', () => {
    it('should produce full trace for all validators', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'verbose' },
      });

      engine.addValidator({
        name: 'first',
        description: 'First validator',
        priority: 1,
        validate: () => ({ decision: 'allow', reason: 'all good' }),
      });
      engine.addValidator({
        name: 'second',
        description: 'Second validator',
        priority: 2,
        validate: () => ({ decision: 'allow', reason: 'also fine' }),
      });

      const result = await engine.validate(createContext());

      expect(result.explanation).toBeDefined();
      const explanation = result.explanation!;
      expect(explanation.verbosity).toBe('verbose');
      expect(explanation.trace).toHaveLength(2);
      expect(explanation.trace[0].ruleId).toBe('first');
      expect(explanation.trace[1].ruleId).toBe('second');
      expect(explanation.evaluatedRules).toBe(2);
      expect(explanation.matchedRules).toBe(0);
    });

    it('should include deny trace with remediation', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'verbose' },
      });

      engine.addValidator({
        name: 'security-check',
        description: 'Security policy check',
        validate: () => ({
          decision: 'deny',
          reason: 'Path contains sensitive system file',
        }),
      });

      const result = await engine.validate(createContext());

      expect(result.explanation).toBeDefined();
      const explanation = result.explanation!;
      expect(explanation.decision).toBe('deny');
      expect(explanation.remediation).toBeDefined();
      expect(explanation.remediation!.length).toBeGreaterThan(0);
      expect(explanation.remediation![0]).toContain('sensitive system file');
    });

    it('should record validator errors in trace', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'verbose' },
      });

      engine.addValidator({
        name: 'crasher',
        validate: () => { throw new Error('unexpected failure'); },
      });

      const result = await engine.validate(createContext());

      expect(result.explanation).toBeDefined();
      const explanation = result.explanation!;
      expect(explanation.decision).toBe('deny');
      expect(explanation.trace).toHaveLength(1);
      expect(explanation.trace[0].constraint).toBe('validator.error');
      expect(explanation.trace[0].result).toBe('fail');
      expect(explanation.trace[0].actual).toBe('unexpected failure');
    });
  });

  describe('Redaction', () => {
    it('should redact specified paths in trace', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: {
          verbosity: 'verbose',
          redactPaths: ['arguments.password', 'arguments.secret'],
        },
      });

      engine.addValidator({
        name: 'checker',
        validate: () => ({
          decision: 'deny',
          reason: 'blocked',
          metadata: { matched_rules: ['rule-1'] },
        }),
      });

      const result = await engine.validate(createContext({
        arguments: { password: 'hunter2', secret: 'abc', name: 'test' },
      }));

      const explanation = result.explanation!;
      for (const entry of explanation.trace) {
        if (entry.path === 'arguments.password' || entry.path === 'arguments.secret') {
          expect(entry.actual).toBe('[REDACTED]');
        }
      }
    });

    it('should not redact paths not in the list', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: {
          verbosity: 'verbose',
          redactPaths: ['arguments.password'],
        },
      });

      engine.addValidator({
        name: 'checker',
        validate: () => ({ decision: 'allow', reason: 'ok' }),
      });

      const result = await engine.validate(createContext({
        arguments: { name: 'visible' },
      }));

      const explanation = result.explanation!;
      for (const entry of explanation.trace) {
        if (entry.path === 'arguments') {
          expect(entry.actual).not.toBe('[REDACTED]');
        }
      }
    });
  });

  describe('Explanation shape', () => {
    it('should include all required fields', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'verbose' },
      });

      engine.addValidator({
        name: 'v1',
        validate: () => ({ decision: 'allow' }),
      });

      const result = await engine.validate(createContext());
      const explanation = result.explanation!;

      expect(explanation).toHaveProperty('decision');
      expect(explanation).toHaveProperty('reason');
      expect(explanation).toHaveProperty('verbosity');
      expect(explanation).toHaveProperty('trace');
      expect(explanation).toHaveProperty('evaluatedRules');
      expect(explanation).toHaveProperty('matchedRules');
      expect(explanation).toHaveProperty('evaluationTimeMs');
      expect(Array.isArray(explanation.trace)).toBe(true);
      expect(typeof explanation.evaluationTimeMs).toBe('number');
      expect(explanation.evaluationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should attach explanation to finalResult', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'simple' },
      });

      engine.addValidator({
        name: 'v1',
        validate: () => ({ decision: 'deny', reason: 'nope' }),
      });

      const result = await engine.validate(createContext());

      expect(result.finalResult.explanation).toBeDefined();
      expect(result.finalResult.explanation!.decision).toBe('deny');
    });
  });

  describe('Determinism', () => {
    it('should produce identical explanations for same input', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'verbose' },
      });

      engine.addValidator({
        name: 'deterministic',
        validate: () => ({
          decision: 'deny',
          reason: 'always blocks',
          metadata: { matched_rules: ['rule-1'] },
        }),
      });

      const ctx = createContext();
      const result1 = await engine.validate(ctx);
      const result2 = await engine.validate(ctx);

      // Compare everything except timing
      const e1 = { ...result1.explanation!, evaluationTimeMs: 0 };
      const e2 = { ...result2.explanation!, evaluationTimeMs: 0 };
      expect(e1).toEqual(e2);
    });
  });

  describe('No validators', () => {
    it('should produce explanation for default decision', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'verbose' },
      });

      const result = await engine.validate(createContext());

      expect(result.explanation).toBeDefined();
      expect(result.explanation!.decision).toBe('allow');
      expect(result.explanation!.trace).toHaveLength(0);
      expect(result.explanation!.evaluatedRules).toBe(0);
    });
  });

  describe('setExplanationConfig', () => {
    it('should update explanation config at runtime', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'none' },
      });

      engine.addValidator({
        name: 'v1',
        validate: () => ({ decision: 'allow' }),
      });

      // First call: no explanation
      const r1 = await engine.validate(createContext());
      expect(r1.explanation).toBeUndefined();

      // Change to verbose
      engine.setExplanationConfig({ verbosity: 'verbose' });

      const r2 = await engine.validate(createContext());
      expect(r2.explanation).toBeDefined();
      expect(r2.explanation!.verbosity).toBe('verbose');
    });
  });

  describe('Performance', () => {
    it('should have bounded overhead when verbosity is none', async () => {
      const engine = new ValidationEngine({
        logger: createMockLogger(),
        defaultDecision: 'allow',
        explanation: { verbosity: 'none' },
      });

      for (let i = 0; i < 10; i++) {
        engine.addValidator({
          name: `v${i}`,
          validate: () => ({ decision: 'allow' }),
        });
      }

      const runs = 100;
      const start = performance.now();
      for (let i = 0; i < runs; i++) {
        await engine.validate(createContext());
      }
      const noneTime = performance.now() - start;

      // With verbose
      engine.setExplanationConfig({ verbosity: 'verbose' });
      const start2 = performance.now();
      for (let i = 0; i < runs; i++) {
        await engine.validate(createContext());
      }
      const verboseTime = performance.now() - start2;

      // Verbose can be slower but none should be fast
      // The key requirement is that none has no explanation overhead
      expect(noneTime).toBeLessThan(verboseTime * 5); // generous bound
    });
  });
});

describe('Utility functions', () => {
  describe('redactValue', () => {
    it('should redact matching paths', () => {
      expect(redactValue('secret', 'password', ['password'])).toBe('[REDACTED]');
    });

    it('should redact child paths', () => {
      expect(redactValue('value', 'config.password.hash', ['config.password'])).toBe('[REDACTED]');
    });

    it('should not redact non-matching paths', () => {
      expect(redactValue('visible', 'name', ['password'])).toBe('visible');
    });

    it('should return value when no redact paths', () => {
      expect(redactValue('anything', 'any.path', [])).toBe('anything');
    });
  });

  describe('createEmptyExplanation', () => {
    it('should create a valid empty explanation', () => {
      const exp = createEmptyExplanation('allow', 'default', 1.5);
      expect(exp.decision).toBe('allow');
      expect(exp.reason).toBe('default');
      expect(exp.verbosity).toBe('none');
      expect(exp.trace).toHaveLength(0);
      expect(exp.evaluatedRules).toBe(0);
      expect(exp.matchedRules).toBe(0);
      expect(exp.evaluationTimeMs).toBe(1.5);
    });
  });
});
