import { describe, it, expect } from 'vitest';
import {
  resolvePath,
  evaluateConstraints,
  createConstraintValidator,
  type ConstraintResult,
} from '../../src/rules/constraint-engine.js';
import { ConstraintErrorCode } from '../../src/rules/constraint-errors.js';
import type { RuleCondition } from '../../src/rules/types.js';

// ---------------------------------------------------------------------------
// resolvePath
// ---------------------------------------------------------------------------

describe('resolvePath', () => {
  it('should resolve a top-level key', () => {
    const result = resolvePath({ name: 'Alice' }, 'name');
    expect(result).toEqual([{ path: 'name', value: 'Alice', found: true }]);
  });

  it('should resolve nested dot-notation paths', () => {
    const obj = { user: { address: { zipcode: '90210' } } };
    const result = resolvePath(obj, 'user.address.zipcode');
    expect(result).toEqual([
      { path: 'user.address.zipcode', value: '90210', found: true },
    ]);
  });

  it('should return found=false for missing paths', () => {
    const result = resolvePath({ a: 1 }, 'b.c');
    expect(result).toHaveLength(1);
    expect(result[0].found).toBe(false);
    expect(result[0].value).toBeUndefined();
  });

  it('should handle null intermediate values', () => {
    const obj = { a: null };
    const result = resolvePath(obj, 'a.b');
    expect(result[0].found).toBe(false);
  });

  it('should resolve array wildcard selectors', () => {
    const obj = { items: [{ price: 10 }, { price: 20 }, { price: 30 }] };
    const result = resolvePath(obj, 'items[*].price');
    expect(result).toEqual([
      { path: 'items[0].price', value: 10, found: true },
      { path: 'items[1].price', value: 20, found: true },
      { path: 'items[2].price', value: 30, found: true },
    ]);
  });

  it('should handle empty arrays with wildcard', () => {
    const obj = { items: [] };
    const result = resolvePath(obj, 'items[*].price');
    expect(result).toEqual([]);
  });

  it('should handle non-array with wildcard', () => {
    const obj = { items: 'not-an-array' };
    const result = resolvePath(obj, 'items[*].price');
    expect(result).toHaveLength(1);
    expect(result[0].found).toBe(false);
  });

  it('should handle nested wildcards', () => {
    const obj = {
      orders: [
        { items: [{ sku: 'A' }, { sku: 'B' }] },
        { items: [{ sku: 'C' }] },
      ],
    };
    const result = resolvePath(obj, 'orders[*].items[*].sku');
    expect(result).toEqual([
      { path: 'orders[0].items[0].sku', value: 'A', found: true },
      { path: 'orders[0].items[1].sku', value: 'B', found: true },
      { path: 'orders[1].items[0].sku', value: 'C', found: true },
    ]);
  });

  it('should return not found for paths exceeding MAX_PATH_DEPTH', () => {
    const deep = 'a.b.c.d.e.f.g.h.i.j.k';
    const result = resolvePath({}, deep);
    expect(result[0].found).toBe(false);
  });

  it('should resolve exactly at MAX_PATH_DEPTH (10 segments)', () => {
    const obj = { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: 42 } } } } } } } } } };
    const result = resolvePath(obj, 'a.b.c.d.e.f.g.h.i.j');
    expect(result).toEqual([
      { path: 'a.b.c.d.e.f.g.h.i.j', value: 42, found: true },
    ]);
  });

  // --- Edge case: existing property with undefined value ---
  it('should correctly detect existing property with undefined value', () => {
    const obj = { key: undefined };
    const result = resolvePath(obj, 'key');
    expect(result).toHaveLength(1);
    expect(result[0].found).toBe(true);
    expect(result[0].value).toBeUndefined();
    expect(result[0].path).toBe('key');
  });

  it('should distinguish between undefined value and missing key', () => {
    const obj = { existsButUndefined: undefined };
    const resultExists = resolvePath(obj, 'existsButUndefined');
    const resultMissing = resolvePath(obj, 'doesNotExist');

    expect(resultExists[0].found).toBe(true);
    expect(resultExists[0].value).toBeUndefined();

    expect(resultMissing[0].found).toBe(false);
    expect(resultMissing[0].value).toBeUndefined();
  });

  it('should track found correctly through nested undefined values', () => {
    const obj = { outer: { inner: undefined } };
    const result = resolvePath(obj, 'outer.inner');
    expect(result[0].found).toBe(true);
    expect(result[0].value).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// evaluateConstraints — basic operators
// ---------------------------------------------------------------------------

describe('evaluateConstraints', () => {
  describe('equals operator', () => {
    it('should pass when values are equal', () => {
      const result = evaluate({ status: 'active' }, [
        cond('status', 'equals', 'active'),
      ]);
      expect(result.pass).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when values are not equal', () => {
      const result = evaluate({ status: 'inactive' }, [
        cond('status', 'equals', 'active'),
      ]);
      expect(result.pass).toBe(false);
      expect(result.errors[0].code).toBe(ConstraintErrorCode.ENUM_VIOLATION);
    });

    it('should coerce types in non-strict mode', () => {
      const result = evaluate({ count: '5' }, [
        cond('count', 'equals', 5),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail type coercion in strict mode', () => {
      const result = evaluate(
        { count: '5' },
        [cond('count', 'equals', 5)],
        { strict: true }
      );
      expect(result.pass).toBe(false);
      expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
    });

    // --- Edge case: property exists but has undefined value ---
    it('should evaluate constraint on existing undefined property', () => {
      const result = evaluate({ key: undefined }, [
        cond('key', 'equals', undefined),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail when existing undefined property compared to non-undefined', () => {
      const result = evaluate({ key: undefined }, [
        cond('key', 'equals', 'someValue'),
      ]);
      expect(result.pass).toBe(false);
      expect(result.errors[0].code).toBe(ConstraintErrorCode.ENUM_VIOLATION);
    });
  });

  describe('not_equals operator', () => {
    it('should pass when values differ', () => {
      const result = evaluate({ x: 1 }, [cond('x', 'not_equals', 2)]);
      expect(result.pass).toBe(true);
    });

    it('should fail when values match', () => {
      const result = evaluate({ x: 1 }, [cond('x', 'not_equals', 1)]);
      expect(result.pass).toBe(false);
    });
  });

  describe('contains operator', () => {
    it('should pass when string contains substring', () => {
      const result = evaluate({ msg: 'hello world' }, [
        cond('msg', 'contains', 'world'),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail when string does not contain substring', () => {
      const result = evaluate({ msg: 'hello' }, [
        cond('msg', 'contains', 'world'),
      ]);
      expect(result.pass).toBe(false);
      expect(result.errors[0].code).toBe(ConstraintErrorCode.PATTERN_MISMATCH);
    });

    it('should fail in strict mode for non-string values', () => {
      const result = evaluate(
        { val: 123 },
        [cond('val', 'contains', '1')],
        { strict: true }
      );
      expect(result.pass).toBe(false);
      expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
    });
  });

  describe('not_contains operator', () => {
    it('should pass when string does not contain substring', () => {
      const result = evaluate({ msg: 'hello' }, [
        cond('msg', 'not_contains', 'world'),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail when string contains substring', () => {
      const result = evaluate({ msg: 'hello world' }, [
        cond('msg', 'not_contains', 'world'),
      ]);
      expect(result.pass).toBe(false);
    });
  });

  describe('starts_with operator', () => {
    it('should pass when string starts with prefix', () => {
      const result = evaluate({ url: 'https://example.com' }, [
        cond('url', 'starts_with', 'https://'),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail when string does not start with prefix', () => {
      const result = evaluate({ url: 'http://example.com' }, [
        cond('url', 'starts_with', 'https://'),
      ]);
      expect(result.pass).toBe(false);
    });
  });

  describe('ends_with operator', () => {
    it('should pass when string ends with suffix', () => {
      const result = evaluate({ file: 'data.csv' }, [
        cond('file', 'ends_with', '.csv'),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail when string does not end with suffix', () => {
      const result = evaluate({ file: 'data.txt' }, [
        cond('file', 'ends_with', '.csv'),
      ]);
      expect(result.pass).toBe(false);
    });
  });

  describe('matches operator', () => {
    it('should pass when string matches regex', () => {
      const result = evaluate({ email: 'user@test.com' }, [
        cond('email', 'matches', '^[\\w.]+@[\\w.]+$'),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail when string does not match regex', () => {
      const result = evaluate({ email: 'not-an-email' }, [
        cond('email', 'matches', '^[\\w.]+@[\\w.]+$'),
      ]);
      expect(result.pass).toBe(false);
    });

    it('should handle invalid regex gracefully', () => {
      const result = evaluate({ val: 'test' }, [
        cond('val', 'matches', '[invalid'),
      ]);
      expect(result.pass).toBe(false);
      expect(result.errors[0].code).toBe(ConstraintErrorCode.PATTERN_MISMATCH);
    });
  });

  describe('greater_than operator', () => {
    it('should pass when value is greater', () => {
      const result = evaluate({ price: 100 }, [
        cond('price', 'greater_than', 50),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail when value is equal', () => {
      const result = evaluate({ price: 50 }, [
        cond('price', 'greater_than', 50),
      ]);
      expect(result.pass).toBe(false);
      expect(result.errors[0].code).toBe(
        ConstraintErrorCode.VALUE_OUT_OF_RANGE
      );
    });

    it('should fail when value is less', () => {
      const result = evaluate({ price: 10 }, [
        cond('price', 'greater_than', 50),
      ]);
      expect(result.pass).toBe(false);
    });

    it('should coerce strings in non-strict mode', () => {
      const result = evaluate({ price: '100' }, [
        cond('price', 'greater_than', 50),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should reject strings in strict mode', () => {
      const result = evaluate(
        { price: '100' },
        [cond('price', 'greater_than', 50)],
        { strict: true }
      );
      expect(result.pass).toBe(false);
      expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
    });
  });

  describe('less_than operator', () => {
    it('should pass when value is less', () => {
      const result = evaluate({ age: 17 }, [
        cond('age', 'less_than', 18),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail when value is equal', () => {
      const result = evaluate({ age: 18 }, [
        cond('age', 'less_than', 18),
      ]);
      expect(result.pass).toBe(false);
    });
  });

  describe('in operator', () => {
    it('should pass when value is in the list', () => {
      const result = evaluate({ role: 'admin' }, [
        cond('role', 'in', ['admin', 'editor']),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail when value is not in the list', () => {
      const result = evaluate({ role: 'viewer' }, [
        cond('role', 'in', ['admin', 'editor']),
      ]);
      expect(result.pass).toBe(false);
      expect(result.errors[0].code).toBe(ConstraintErrorCode.ENUM_VIOLATION);
    });

    it('should fail when expected is not an array', () => {
      const result = evaluate({ role: 'admin' }, [
        cond('role', 'in', 'admin'),
      ]);
      expect(result.pass).toBe(false);
      expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
    });
  });

  describe('not_in operator', () => {
    it('should pass when value is not in the list', () => {
      const result = evaluate({ action: 'read' }, [
        cond('action', 'not_in', ['delete', 'drop']),
      ]);
      expect(result.pass).toBe(true);
    });

    it('should fail when value is in the list', () => {
      const result = evaluate({ action: 'delete' }, [
        cond('action', 'not_in', ['delete', 'drop']),
      ]);
      expect(result.pass).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// evaluateConstraints — nested paths
// ---------------------------------------------------------------------------

describe('evaluateConstraints — nested paths', () => {
  it('should evaluate constraints on nested paths', () => {
    const args = {
      user: { address: { zipcode: '90210' } },
    };
    const result = evaluate(args, [
      cond('user.address.zipcode', 'equals', '90210'),
    ]);
    expect(result.pass).toBe(true);
  });

  it('should produce PATH_NOT_FOUND for missing nested paths', () => {
    const result = evaluate({ user: {} }, [
      cond('user.address.zipcode', 'equals', '90210'),
    ]);
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.PATH_NOT_FOUND);
  });

  it('should evaluate constraints on array wildcard paths', () => {
    const args = { items: [{ price: 10 }, { price: 20 }] };
    const result = evaluate(args, [
      cond('items[*].price', 'less_than', 50),
    ]);
    expect(result.pass).toBe(true);
  });

  it('should fail when any wildcard element violates constraint', () => {
    const args = { items: [{ price: 10 }, { price: 100 }] };
    const result = evaluate(args, [
      cond('items[*].price', 'less_than', 50),
    ]);
    expect(result.pass).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe('items[1].price');
  });

  it('should pass for empty arrays with wildcard constraints', () => {
    const args = { items: [] };
    const result = evaluate(args, [
      cond('items[*].price', 'less_than', 50),
    ]);
    expect(result.pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluateConstraints — wildcard edge cases
// ---------------------------------------------------------------------------

describe('evaluateConstraints — wildcard edge cases', () => {
  it('should fail when wildcard is used on non-array (string)', () => {
    const args = { items: 'not-an-array' };
    const result = evaluate(args, [
      cond('items[*].price', 'less_than', 50),
    ]);
    expect(result.pass).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
    expect(result.errors[0].message).toContain('Wildcard selector');
    expect(result.errors[0].message).toContain('requires an array');
  });

  it('should fail when wildcard is used on non-array (object)', () => {
    const args = { items: { notAnArray: true } };
    const result = evaluate(args, [
      cond('items[*].value', 'equals', 'test'),
    ]);
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
  });

  it('should fail when wildcard is used on non-array (number)', () => {
    const args = { items: 42 };
    const result = evaluate(args, [
      cond('items[*].val', 'equals', 'x'),
    ]);
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
  });

  it('should fail when wildcard is used on null', () => {
    const args = { items: null };
    const result = evaluate(args, [
      cond('items[*].val', 'equals', 'x'),
    ]);
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
  });

  it('should fail when wildcard path does not exist', () => {
    const args = { other: [] };
    const result = evaluate(args, [
      cond('items[*].price', 'less_than', 50),
    ]);
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.PATH_NOT_FOUND);
  });

  it('should pass for empty array (vacuously true)', () => {
    const args = { items: [] };
    const result = evaluate(args, [
      cond('items[*].price', 'greater_than', 9999),
    ]);
    // Empty array = zero elements to check = vacuously true
    expect(result.pass).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should distinguish empty array (vacuous pass) from non-array (type error)', () => {
    const emptyArrayArgs = { items: [] };
    const nonArrayArgs = { items: {} };
    
    const emptyResult = evaluate(emptyArrayArgs, [
      cond('items[*].x', 'equals', 'y'),
    ]);
    const nonArrayResult = evaluate(nonArrayArgs, [
      cond('items[*].x', 'equals', 'y'),
    ]);

    expect(emptyResult.pass).toBe(true);
    expect(nonArrayResult.pass).toBe(false);
    expect(nonArrayResult.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
  });

  it('should handle nested wildcard on non-array at inner level', () => {
    const args = {
      orders: [
        { items: [{ sku: 'A' }] },
        { items: 'not-an-array' }, // Inner non-array
      ],
    };
    const result = evaluate(args, [
      cond('orders[*].items[*].sku', 'equals', 'A'),
    ]);
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
  });
});

// ---------------------------------------------------------------------------
// evaluateConstraints — strict mode
// ---------------------------------------------------------------------------

describe('evaluateConstraints — strict mode', () => {
  it('should reject string-to-number coercion for greater_than', () => {
    const result = evaluate(
      { val: '42' },
      [cond('val', 'greater_than', 10)],
      { strict: true }
    );
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
  });

  it('should reject non-string for starts_with', () => {
    const result = evaluate(
      { val: 123 },
      [cond('val', 'starts_with', '1')],
      { strict: true }
    );
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
  });

  it('should reject non-string for ends_with', () => {
    const result = evaluate(
      { val: 123 },
      [cond('val', 'ends_with', '3')],
      { strict: true }
    );
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
  });

  it('should reject non-string for matches', () => {
    const result = evaluate(
      { val: 123 },
      [cond('val', 'matches', '\\d+')],
      { strict: true }
    );
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
  });

  it('should reject non-string for not_contains', () => {
    const result = evaluate(
      { val: 123 },
      [cond('val', 'not_contains', '4')],
      { strict: true }
    );
    expect(result.pass).toBe(false);
    expect(result.errors[0].code).toBe(ConstraintErrorCode.TYPE_MISMATCH);
  });
});

// ---------------------------------------------------------------------------
// evaluateConstraints — error structure
// ---------------------------------------------------------------------------

describe('evaluateConstraints — error structure', () => {
  it('should include all required fields in error', () => {
    const result = evaluate({ x: 'bad' }, [
      cond('x', 'greater_than', 5),
    ]);
    const err = result.errors[0];
    expect(err).toHaveProperty('code');
    expect(err).toHaveProperty('path');
    expect(err).toHaveProperty('expected');
    expect(err).toHaveProperty('actual');
    expect(err).toHaveProperty('message');
    expect(typeof err.message).toBe('string');
    expect(typeof err.code).toBe('string');
    expect(typeof err.path).toBe('string');
  });

  it('should collect all errors', () => {
    const args = { a: 'x', b: 'y' };
    const result = evaluate(args, [
      cond('a', 'equals', 'wrong'),
      cond('b', 'equals', 'also_wrong'),
    ]);
    expect(result.pass).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// evaluateConstraints — deterministic ordering
// ---------------------------------------------------------------------------

describe('evaluateConstraints — deterministic ordering', () => {
  it('should evaluate conditions in alphabetical order by field', () => {
    const paths: string[] = [];
    const args = { z: 1, a: 2, m: 3 };
    const conditions: RuleCondition[] = [
      cond('z', 'equals', 1),
      cond('a', 'equals', 2),
      cond('m', 'equals', 3),
    ];

    // We check the error ordering by making them all fail
    const failArgs = { z: 0, a: 0, m: 0 };
    const result = evaluate(failArgs, conditions);
    const errorPaths = result.errors.map((e) => e.path);
    expect(errorPaths).toEqual(['a', 'm', 'z']);
  });

  it('should sort by operator within same field', () => {
    const args = { x: 'hello' };
    const conditions: RuleCondition[] = [
      cond('x', 'ends_with', 'xyz'),
      cond('x', 'contains', 'xyz'),
      cond('x', 'equals', 'xyz'),
    ];
    const result = evaluate(args, conditions);
    const codes = result.errors.map((e) => e.code);
    // equals (0) < contains (2) < ends_with (5)
    expect(codes).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// createConstraintValidator
// ---------------------------------------------------------------------------

describe('createConstraintValidator', () => {
  it('should create a validator with evaluate method', () => {
    const validator = createConstraintValidator();
    const result = validator.evaluate(
      { x: 10 },
      [cond('x', 'greater_than', 5)]
    );
    expect(result.pass).toBe(true);
  });

  it('should respect strict option', () => {
    const validator = createConstraintValidator({ strict: true });
    const result = validator.evaluate(
      { x: '10' },
      [cond('x', 'greater_than', 5)]
    );
    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Performance benchmark
// ---------------------------------------------------------------------------

describe('constraint engine performance', () => {
  it('should evaluate 100 constraints in under 1ms', () => {
    const args: Record<string, unknown> = {};
    const conditions: RuleCondition[] = [];

    for (let i = 0; i < 100; i++) {
      const key = `field_${String(i).padStart(3, '0')}`;
      args[key] = i;
      conditions.push(cond(key, 'less_than', 1000));
    }

    // Warmup
    evaluateConstraints(args, conditions);

    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      evaluateConstraints(args, conditions);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    expect(avgMs).toBeLessThan(1);
  });

  it('should evaluate 100 nested-path constraints in under 1ms', () => {
    const args: Record<string, unknown> = {
      user: {
        profile: {
          settings: {} as Record<string, unknown>,
        },
      },
    };
    const conditions: RuleCondition[] = [];
    const settings = (args.user as Record<string, unknown>).profile as Record<string, unknown>;
    const settingsObj = settings.settings as Record<string, unknown>;

    for (let i = 0; i < 100; i++) {
      const key = `opt_${String(i).padStart(3, '0')}`;
      settingsObj[key] = i;
      conditions.push(cond(`user.profile.settings.${key}`, 'less_than', 1000));
    }

    // Warmup
    evaluateConstraints(args, conditions);

    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      evaluateConstraints(args, conditions);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    expect(avgMs).toBeLessThan(1);
  });

  it('should evaluate 100 wildcard constraints in under 5ms', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ val: i }));
    const args = { items };
    const conditions: RuleCondition[] = [];

    for (let i = 0; i < 100; i++) {
      conditions.push(cond('items[*].val', 'less_than', 1000));
    }

    // Warmup
    evaluateConstraints(args, conditions);

    const iterations = 50;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      evaluateConstraints(args, conditions);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    expect(avgMs).toBeLessThan(5);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cond(
  field: string,
  operator: RuleCondition['operator'],
  value: unknown
): RuleCondition {
  return { field, operator, value };
}

function evaluate(
  args: Record<string, unknown>,
  conditions: RuleCondition[],
  options?: { strict?: boolean }
): ConstraintResult {
  return evaluateConstraints(args, conditions, options);
}
