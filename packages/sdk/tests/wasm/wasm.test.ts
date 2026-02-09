import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Rule } from '../../src/rules/types.js';
import { compilePolicy, serializePolicy, deserializePolicy } from '../../src/wasm/compiler.js';
import { evaluate } from '../../src/wasm/vm.js';
import { PolicyCache } from '../../src/wasm/cache.js';
import { WasmDecisionEngine } from '../../src/wasm/engine.js';

function makeRule(overrides: Partial<Rule> & { id: string; name: string }): Rule {
  return {
    enabled: true,
    severity: 'high',
    action: 'block',
    ...overrides,
  };
}

describe('compiler', () => {
  it('compiles empty rule set', () => {
    const compiled = compilePolicy([]);
    expect(compiled.version).toBe(1);
    expect(compiled.instructions.length).toBeGreaterThan(0); // at least HALT
    expect(compiled.ruleIds).toEqual([]);
  });

  it('compiles a rule with conditions', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block dangerous paths',
        conditions: [
          { field: 'path', operator: 'contains', value: '/etc/passwd' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);
    expect(compiled.ruleIds).toContain('r1');
    expect(compiled.argKeys).toContain('path');
    expect(compiled.instructions.length).toBeGreaterThan(1);
  });

  it('compiles a rule with condition groups (OR logic)', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r2',
        name: 'Block multiple patterns',
        condition_groups: [
          [{ field: 'cmd', operator: 'equals', value: 'rm' }],
          [{ field: 'cmd', operator: 'equals', value: 'format' }],
        ],
      }),
    ];

    const compiled = compilePolicy(rules);
    expect(compiled.ruleIds).toContain('r2');
  });

  it('skips disabled rules', () => {
    const rules: Rule[] = [
      makeRule({ id: 'r1', name: 'Enabled', enabled: true }),
      makeRule({ id: 'r2', name: 'Disabled', enabled: false }),
    ];

    const compiled = compilePolicy(rules);
    expect(compiled.ruleIds).toEqual(['r1']);
  });
});

describe('serialization', () => {
  it('round-trips through serialize/deserialize', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Test',
        conditions: [
          { field: 'path', operator: 'equals', value: '/tmp/secret' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);
    const buffer = serializePolicy(compiled);
    const restored = deserializePolicy(buffer);

    expect(restored.version).toBe(compiled.version);
    expect(restored.ruleIds).toEqual(compiled.ruleIds);
    expect(restored.instructions).toEqual(compiled.instructions);
    expect(restored.constantPool).toEqual(compiled.constantPool);
    expect(restored.argKeys).toEqual(compiled.argKeys);
  });
});

describe('vm', () => {
  it('allows when no rules match', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block rm',
        conditions: [
          { field: 'command', operator: 'equals', value: 'rm' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);
    const result = evaluate(compiled, { command: 'ls' });

    expect(result.decision).toBe('allow');
  });

  it('denies when rule conditions match', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block rm',
        conditions: [
          { field: 'command', operator: 'equals', value: 'rm' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);
    const result = evaluate(compiled, { command: 'rm' });

    expect(result.decision).toBe('deny');
    expect(result.matchedRules).toContain('r1');
    expect(result.latencyNs).toBeGreaterThan(0);
  });

  it('evaluates contains operator', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block paths with passwd',
        conditions: [
          { field: 'path', operator: 'contains', value: 'passwd' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);

    expect(evaluate(compiled, { path: '/etc/passwd' }).decision).toBe('deny');
    expect(evaluate(compiled, { path: '/home/user' }).decision).toBe('allow');
  });

  it('evaluates not_contains operator', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block if path does not contain safe',
        conditions: [
          { field: 'path', operator: 'not_contains', value: 'safe' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);

    expect(evaluate(compiled, { path: '/safe/dir' }).decision).toBe('allow');
    expect(evaluate(compiled, { path: '/danger/dir' }).decision).toBe('deny');
  });

  it('evaluates starts_with and ends_with', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block .exe files',
        conditions: [
          { field: 'filename', operator: 'ends_with', value: '.exe' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);

    expect(evaluate(compiled, { filename: 'virus.exe' }).decision).toBe('deny');
    expect(evaluate(compiled, { filename: 'script.sh' }).decision).toBe('allow');
  });

  it('evaluates numeric comparisons', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block large amounts',
        conditions: [
          { field: 'amount', operator: 'greater_than', value: 1000 },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);

    expect(evaluate(compiled, { amount: 1500 }).decision).toBe('deny');
    expect(evaluate(compiled, { amount: 500 }).decision).toBe('allow');
    expect(evaluate(compiled, { amount: 1000 }).decision).toBe('allow');
  });

  it('evaluates regex matches', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block SQL injection',
        conditions: [
          { field: 'query', operator: 'matches', value: 'DROP\\s+TABLE' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);

    expect(evaluate(compiled, { query: 'DROP TABLE users' }).decision).toBe('deny');
    expect(evaluate(compiled, { query: 'SELECT * FROM users' }).decision).toBe('allow');
  });

  it('evaluates in/not_in operators', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block dangerous commands',
        conditions: [
          { field: 'cmd', operator: 'in', value: ['rm', 'format', 'shutdown'] },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);

    expect(evaluate(compiled, { cmd: 'rm' }).decision).toBe('deny');
    expect(evaluate(compiled, { cmd: 'ls' }).decision).toBe('allow');
  });

  it('evaluates AND conditions', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block dangerous combos',
        conditions: [
          { field: 'cmd', operator: 'equals', value: 'delete' },
          { field: 'target', operator: 'equals', value: 'production' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);

    expect(evaluate(compiled, { cmd: 'delete', target: 'production' }).decision).toBe('deny');
    expect(evaluate(compiled, { cmd: 'delete', target: 'staging' }).decision).toBe('allow');
    expect(evaluate(compiled, { cmd: 'list', target: 'production' }).decision).toBe('allow');
  });

  it('evaluates OR condition groups', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block either pattern',
        condition_groups: [
          [{ field: 'cmd', operator: 'equals', value: 'rm' }],
          [{ field: 'cmd', operator: 'equals', value: 'format' }],
        ],
      }),
    ];

    const compiled = compilePolicy(rules);

    expect(evaluate(compiled, { cmd: 'rm' }).decision).toBe('deny');
    expect(evaluate(compiled, { cmd: 'format' }).decision).toBe('deny');
    expect(evaluate(compiled, { cmd: 'ls' }).decision).toBe('allow');
  });

  it('supports nested argument paths', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block by nested field',
        conditions: [
          { field: 'config.mode', operator: 'equals', value: 'destructive' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);

    expect(evaluate(compiled, { config: { mode: 'destructive' } }).decision).toBe('deny');
    expect(evaluate(compiled, { config: { mode: 'safe' } }).decision).toBe('allow');
  });

  it('handles missing arguments gracefully', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Check nonexistent field',
        conditions: [
          { field: 'nonexistent', operator: 'equals', value: 'test' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);
    const result = evaluate(compiled, {});

    expect(result.decision).toBe('allow');
  });

  it('enforces max instruction limit', () => {
    const rules: Rule[] = [];
    for (let i = 0; i < 100; i++) {
      rules.push(
        makeRule({
          id: `r${i}`,
          name: `Rule ${i}`,
          action: 'allow',
          conditions: [
            { field: 'x', operator: 'equals', value: `val${i}` },
          ],
        }),
      );
    }

    const compiled = compilePolicy(rules);
    const result = evaluate(compiled, { x: 'none' });
    expect(result.decision).toBe('allow');

    expect(() =>
      evaluate(compiled, { x: 'none' }, { maxInstructions: 5 }),
    ).toThrow('VM execution limit');
  });

  it('enforces max stack depth', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Test',
        conditions: [
          { field: 'a', operator: 'equals', value: 'b' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);
    expect(() =>
      evaluate(compiled, { a: 'b' }, { maxStackDepth: 1 }),
    ).toThrow('VM stack overflow');
  });

  it('returns allow rules without deny', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Allow safe',
        action: 'allow',
        conditions: [
          { field: 'cmd', operator: 'equals', value: 'ls' },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);
    const result = evaluate(compiled, { cmd: 'ls' });
    expect(result.decision).toBe('allow');
    expect(result.matchedRules).toContain('r1');
  });
});

describe('PolicyCache', () => {
  it('stores and retrieves policies', () => {
    const cache = new PolicyCache();
    const policy = compilePolicy([]);

    cache.set('tool1', policy);
    expect(cache.get('tool1')).toBe(policy);
    expect(cache.size).toBe(1);
  });

  it('returns undefined for missing keys', () => {
    const cache = new PolicyCache();
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('evicts expired entries', async () => {
    const cache = new PolicyCache({ ttlMs: 10 });
    const policy = compilePolicy([]);

    cache.set('tool1', policy);
    expect(cache.get('tool1')).toBe(policy);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cache.get('tool1')).toBeUndefined();
  });

  it('evicts LRU when at capacity', () => {
    const cache = new PolicyCache({ maxEntries: 2 });
    const p1 = compilePolicy([]);
    const p2 = compilePolicy([]);
    const p3 = compilePolicy([]);

    cache.set('t1', p1);
    cache.set('t2', p2);
    cache.get('t1');
    cache.set('t3', p3);

    expect(cache.get('t1')).toBe(p1);
    expect(cache.get('t2')).toBeUndefined();
    expect(cache.get('t3')).toBe(p3);
  });

  it('stores and retrieves last-known-good policies', () => {
    const cache = new PolicyCache({ ttlMs: 10 });
    const policy = compilePolicy([]);

    cache.setLastKnownGood('tool1', policy);
    expect(cache.getLastKnownGood('tool1')).toBe(policy);
  });

  it('has() respects TTL', async () => {
    const cache = new PolicyCache({ ttlMs: 10 });
    const policy = compilePolicy([]);

    cache.set('tool1', policy);
    expect(cache.has('tool1')).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cache.has('tool1')).toBe(false);
  });

  it('clear() removes all entries', () => {
    const cache = new PolicyCache();
    cache.set('t1', compilePolicy([]));
    cache.set('t2', compilePolicy([]));
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('WasmDecisionEngine', () => {
  let engine: WasmDecisionEngine;

  beforeEach(() => {
    engine = new WasmDecisionEngine();
    engine.init();
  });

  afterEach(() => {
    engine.destroy();
  });

  it('evaluates loaded rules', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block rm',
        conditions: [
          { field: 'command', operator: 'equals', value: 'rm' },
        ],
      }),
    ];

    engine.loadRules('exec_command', rules);
    const result = engine.evaluate('exec_command', { command: 'rm' });

    expect(result.decision).toBe('deny');
    expect(result.matchedRules).toContain('r1');
  });

  it('allows when no policy is loaded', () => {
    const result = engine.evaluate('unknown_tool', { x: 1 });
    expect(result.decision).toBe('allow');
  });

  it('compileAndEvaluate works without caching', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block delete',
        conditions: [
          { field: 'action', operator: 'equals', value: 'delete' },
        ],
      }),
    ];

    const result = engine.compileAndEvaluate(rules, { action: 'delete' });
    expect(result.decision).toBe('deny');
    expect(engine.cachedPolicyCount).toBe(0);
  });

  it('caches compiled policies', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Test',
        conditions: [
          { field: 'x', operator: 'equals', value: 'y' },
        ],
      }),
    ];

    engine.loadRules('tool1', rules);
    expect(engine.hasCachedPolicy('tool1')).toBe(true);
    expect(engine.cachedPolicyCount).toBeGreaterThan(0);

    engine.clearCache();
    expect(engine.cachedPolicyCount).toBe(0);
  });

  it('serializes and deserializes policies', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Test',
        conditions: [
          { field: 'cmd', operator: 'equals', value: 'rm' },
        ],
      }),
    ];

    const compiled = engine.compilePolicy(rules);
    const buffer = engine.serializePolicy(compiled);
    const restored = engine.deserializePolicy(buffer);

    engine.loadPolicy('tool1', restored);
    const result = engine.evaluate('tool1', { cmd: 'rm' });
    expect(result.decision).toBe('deny');
  });

  it('handles multiple rules with first-deny-wins', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Allow safe commands',
        action: 'allow',
        conditions: [
          { field: 'cmd', operator: 'equals', value: 'ls' },
        ],
      }),
      makeRule({
        id: 'r2',
        name: 'Block rm',
        action: 'block',
        conditions: [
          { field: 'cmd', operator: 'equals', value: 'rm' },
        ],
      }),
    ];

    engine.loadRules('exec', rules);

    expect(engine.evaluate('exec', { cmd: 'ls' }).decision).toBe('allow');
    expect(engine.evaluate('exec', { cmd: 'rm' }).decision).toBe('deny');
    expect(engine.evaluate('exec', { cmd: 'cat' }).decision).toBe('allow');
  });
});

describe('performance', () => {
  it('evaluates in sub-millisecond time', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        name: 'Block rm',
        conditions: [
          { field: 'command', operator: 'equals', value: 'rm' },
        ],
      }),
      makeRule({
        id: 'r2',
        name: 'Block format',
        conditions: [
          { field: 'command', operator: 'equals', value: 'format' },
        ],
      }),
      makeRule({
        id: 'r3',
        name: 'Block delete with force',
        conditions: [
          { field: 'command', operator: 'equals', value: 'delete' },
          { field: 'force', operator: 'equals', value: true },
        ],
      }),
    ];

    const compiled = compilePolicy(rules);

    // Warm up
    for (let i = 0; i < 100; i++) {
      evaluate(compiled, { command: 'ls' });
    }

    // Measure
    const iterations = 10_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      evaluate(compiled, { command: 'ls' });
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    // Sub-millisecond target
    expect(avgMs).toBeLessThan(1);
  });
});
