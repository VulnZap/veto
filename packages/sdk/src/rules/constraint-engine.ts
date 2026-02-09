/**
 * Deterministic constraint engine v2.
 *
 * Evaluates constraints against tool call arguments locally, without
 * network calls. Supports nested path selectors, array wildcards,
 * strict type checking, and returns structured errors.
 *
 * Path resolution is iterative with a bounded depth limit.
 * Evaluation order is deterministic: alphabetical by path, then by
 * constraint type within each path.
 *
 * @module rules/constraint-engine
 */

import type { RuleCondition, ConditionOperator } from './types.js';
import {
  ConstraintErrorCode,
  constraintError,
  type ConstraintError,
} from './constraint-errors.js';

const MAX_PATH_DEPTH = 10;

const OPERATOR_ORDER: Record<ConditionOperator, number> = {
  equals: 0,
  not_equals: 1,
  contains: 2,
  not_contains: 3,
  starts_with: 4,
  ends_with: 5,
  matches: 6,
  greater_than: 7,
  less_than: 8,
  in: 9,
  not_in: 10,
};

export interface ConstraintEngineOptions {
  strict?: boolean;
}

export interface ConstraintResult {
  pass: boolean;
  errors: ConstraintError[];
}

/**
 * Resolve a dot-notation path against an object. Supports array
 * wildcard selectors (`[*]`).
 *
 * Returns an array of `{ path, value }` pairs. For non-wildcard paths
 * this is a single element. For wildcards each matching element gets
 * its own entry with the fully-qualified path.
 *
 * Resolution is iterative with a bounded depth of MAX_PATH_DEPTH.
 */
export function resolvePath(
  obj: unknown,
  path: string
): Array<{ path: string; value: unknown; found: boolean }> {
  const segments = parsePath(path);

  if (segments.length > MAX_PATH_DEPTH) {
    return [{ path, value: undefined, found: false }];
  }

  // Start with a single cursor at the root
  let cursors: Array<{ value: unknown; resolvedPath: string }> = [
    { value: obj, resolvedPath: '' },
  ];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const nextCursors: Array<{ value: unknown; resolvedPath: string }> = [];

    for (const cursor of cursors) {
      if (segment === '[*]') {
        // Array wildcard: fan out over array elements
        if (!Array.isArray(cursor.value)) {
          // Not an array — path not found through this cursor
          nextCursors.push({
            value: undefined,
            resolvedPath: cursor.resolvedPath + '[*]',
          });
          continue;
        }
        for (let idx = 0; idx < cursor.value.length; idx++) {
          nextCursors.push({
            value: cursor.value[idx],
            resolvedPath: cursor.resolvedPath + `[${idx}]`,
          });
        }
      } else {
        // Regular property access
        const parent = cursor.value;
        if (parent === null || parent === undefined || typeof parent !== 'object') {
          nextCursors.push({
            value: undefined,
            resolvedPath: cursor.resolvedPath
              ? cursor.resolvedPath + '.' + segment
              : segment,
          });
          continue;
        }
        const record = parent as Record<string, unknown>;
        const found = Object.prototype.hasOwnProperty.call(record, segment);
        nextCursors.push({
          value: found ? record[segment] : undefined,
          resolvedPath: cursor.resolvedPath
            ? cursor.resolvedPath + '.' + segment
            : segment,
        });
      }
    }

    cursors = nextCursors;
  }

  return cursors.map((c) => ({
    path: c.resolvedPath,
    value: c.value,
    found: c.value !== undefined,
  }));
}

/**
 * Parse a path string into segments. Handles dot notation and `[*]`.
 *
 * Examples:
 *   "a.b.c"           -> ["a", "b", "c"]
 *   "items[*].price"  -> ["items", "[*]", "price"]
 *   "a[*][*].b"       -> ["a", "[*]", "[*]", "b"]
 */
function parsePath(path: string): string[] {
  const segments: string[] = [];
  let current = '';

  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '.') {
      if (current.length > 0) {
        segments.push(current);
        current = '';
      }
    } else if (ch === '[') {
      if (current.length > 0) {
        segments.push(current);
        current = '';
      }
      const closeBracket = path.indexOf(']', i);
      if (closeBracket === -1) {
        // Malformed — treat rest as literal
        current = path.slice(i);
        break;
      }
      const inner = path.slice(i, closeBracket + 1);
      segments.push(inner);
      i = closeBracket;
    } else {
      current += ch;
    }
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

/**
 * Evaluate a set of constraints against tool call arguments.
 *
 * Constraints are sorted deterministically before evaluation:
 * alphabetical by `field` path, then by operator order within
 * each path. Evaluation short-circuits on the first failure
 * unless `collectAll` is true.
 */
export function evaluateConstraints(
  args: Record<string, unknown>,
  conditions: RuleCondition[],
  options: ConstraintEngineOptions = {}
): ConstraintResult {
  const sorted = sortConditions(conditions);
  const errors: ConstraintError[] = [];

  for (const condition of sorted) {
    const resolved = resolvePath(args, condition.field);

    const hasWildcard = condition.field.includes('[*]');

    // Wildcard over empty array resolves to zero entries — vacuously true
    if (resolved.length === 0 && hasWildcard) {
      continue;
    }

    if (resolved.length === 0 || (!hasWildcard && !resolved[0].found)) {
      errors.push(
        constraintError(
          ConstraintErrorCode.PATH_NOT_FOUND,
          condition.field,
          'value at path',
          undefined,
          `Path "${condition.field}" not found in arguments`
        )
      );
      continue;
    }

    for (const entry of resolved) {
      if (!entry.found && hasWildcard) {
        // Wildcard resolved to no entries (empty array), skip
        continue;
      }
      if (!entry.found) {
        errors.push(
          constraintError(
            ConstraintErrorCode.PATH_NOT_FOUND,
            entry.path,
            'value at path',
            undefined,
            `Path "${entry.path}" not found in arguments`
          )
        );
        continue;
      }

      const err = evaluateSingleCondition(
        entry.path,
        entry.value,
        condition,
        options
      );
      if (err) {
        errors.push(err);
      }
    }
  }

  return { pass: errors.length === 0, errors };
}

/**
 * Sort conditions deterministically: alphabetical by field, then
 * by operator order for same field.
 */
function sortConditions(conditions: RuleCondition[]): RuleCondition[] {
  return [...conditions].sort((a, b) => {
    const fieldCmp = a.field.localeCompare(b.field);
    if (fieldCmp !== 0) return fieldCmp;
    return (OPERATOR_ORDER[a.operator] ?? 99) - (OPERATOR_ORDER[b.operator] ?? 99);
  });
}

/**
 * Evaluate a single condition against a resolved value.
 * Returns a ConstraintError if the condition fails, or null if it passes.
 */
function evaluateSingleCondition(
  resolvedPath: string,
  value: unknown,
  condition: RuleCondition,
  options: ConstraintEngineOptions
): ConstraintError | null {
  const { operator } = condition;
  const expected = condition.value;
  const strict = options.strict ?? false;

  switch (operator) {
    case 'equals':
      return checkEquals(resolvedPath, value, expected, strict);

    case 'not_equals':
      return checkNotEquals(resolvedPath, value, expected, strict);

    case 'contains':
      return checkContains(resolvedPath, value, expected, strict);

    case 'not_contains':
      return checkNotContains(resolvedPath, value, expected, strict);

    case 'starts_with':
      return checkStartsWith(resolvedPath, value, expected, strict);

    case 'ends_with':
      return checkEndsWith(resolvedPath, value, expected, strict);

    case 'matches':
      return checkMatches(resolvedPath, value, expected, strict);

    case 'greater_than':
      return checkGreaterThan(resolvedPath, value, expected, strict);

    case 'less_than':
      return checkLessThan(resolvedPath, value, expected, strict);

    case 'in':
      return checkIn(resolvedPath, value, expected);

    case 'not_in':
      return checkNotIn(resolvedPath, value, expected);
  }
}

// --- Operator implementations ---

function checkEquals(
  path: string,
  actual: unknown,
  expected: unknown,
  strict: boolean
): ConstraintError | null {
  if (strict) {
    if (actual !== expected) {
      return constraintError(
        typeof actual !== typeof expected
          ? ConstraintErrorCode.TYPE_MISMATCH
          : ConstraintErrorCode.ENUM_VIOLATION,
        path,
        expected,
        actual,
        `Expected ${path} to equal ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
    return null;
  }
   
  if (actual != expected) {
    return constraintError(
      ConstraintErrorCode.ENUM_VIOLATION,
      path,
      expected,
      actual,
      `Expected ${path} to equal ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
  return null;
}

function checkNotEquals(
  path: string,
  actual: unknown,
  expected: unknown,
  strict: boolean
): ConstraintError | null {
  if (strict) {
    if (actual === expected) {
      return constraintError(
        ConstraintErrorCode.ENUM_VIOLATION,
        path,
        `not ${JSON.stringify(expected)}`,
        actual,
        `Expected ${path} to not equal ${JSON.stringify(expected)}`
      );
    }
    return null;
  }
   
  if (actual == expected) {
    return constraintError(
      ConstraintErrorCode.ENUM_VIOLATION,
      path,
      `not ${JSON.stringify(expected)}`,
      actual,
      `Expected ${path} to not equal ${JSON.stringify(expected)}`
    );
  }
  return null;
}

function checkContains(
  path: string,
  actual: unknown,
  expected: unknown,
  strict: boolean
): ConstraintError | null {
  if (strict && typeof actual !== 'string') {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'string',
      typeof actual,
      `Expected ${path} to be a string for "contains" check, got ${typeof actual}`
    );
  }
  const str = String(actual);
  const substr = String(expected);
  if (!str.includes(substr)) {
    return constraintError(
      ConstraintErrorCode.PATTERN_MISMATCH,
      path,
      `contains "${substr}"`,
      actual,
      `Expected ${path} to contain "${substr}"`
    );
  }
  return null;
}

function checkNotContains(
  path: string,
  actual: unknown,
  expected: unknown,
  strict: boolean
): ConstraintError | null {
  if (strict && typeof actual !== 'string') {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'string',
      typeof actual,
      `Expected ${path} to be a string for "not_contains" check, got ${typeof actual}`
    );
  }
  const str = String(actual);
  const substr = String(expected);
  if (str.includes(substr)) {
    return constraintError(
      ConstraintErrorCode.PATTERN_MISMATCH,
      path,
      `not contains "${substr}"`,
      actual,
      `Expected ${path} to not contain "${substr}"`
    );
  }
  return null;
}

function checkStartsWith(
  path: string,
  actual: unknown,
  expected: unknown,
  strict: boolean
): ConstraintError | null {
  if (strict && typeof actual !== 'string') {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'string',
      typeof actual,
      `Expected ${path} to be a string for "starts_with" check, got ${typeof actual}`
    );
  }
  const str = String(actual);
  const prefix = String(expected);
  if (!str.startsWith(prefix)) {
    return constraintError(
      ConstraintErrorCode.PATTERN_MISMATCH,
      path,
      `starts with "${prefix}"`,
      actual,
      `Expected ${path} to start with "${prefix}"`
    );
  }
  return null;
}

function checkEndsWith(
  path: string,
  actual: unknown,
  expected: unknown,
  strict: boolean
): ConstraintError | null {
  if (strict && typeof actual !== 'string') {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'string',
      typeof actual,
      `Expected ${path} to be a string for "ends_with" check, got ${typeof actual}`
    );
  }
  const str = String(actual);
  const suffix = String(expected);
  if (!str.endsWith(suffix)) {
    return constraintError(
      ConstraintErrorCode.PATTERN_MISMATCH,
      path,
      `ends with "${suffix}"`,
      actual,
      `Expected ${path} to end with "${suffix}"`
    );
  }
  return null;
}

function checkMatches(
  path: string,
  actual: unknown,
  expected: unknown,
  strict: boolean
): ConstraintError | null {
  if (strict && typeof actual !== 'string') {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'string',
      typeof actual,
      `Expected ${path} to be a string for "matches" check, got ${typeof actual}`
    );
  }
  const str = String(actual);
  const pattern = String(expected);
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return constraintError(
      ConstraintErrorCode.PATTERN_MISMATCH,
      path,
      `valid regex "${pattern}"`,
      actual,
      `Invalid regex pattern "${pattern}" for ${path}`
    );
  }
  if (!regex.test(str)) {
    return constraintError(
      ConstraintErrorCode.PATTERN_MISMATCH,
      path,
      `matches /${pattern}/`,
      actual,
      `Expected ${path} to match pattern /${pattern}/`
    );
  }
  return null;
}

function checkGreaterThan(
  path: string,
  actual: unknown,
  expected: unknown,
  strict: boolean
): ConstraintError | null {
  if (strict && typeof actual !== 'number') {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'number',
      typeof actual,
      `Expected ${path} to be a number for "greater_than" check, got ${typeof actual}`
    );
  }
  const numActual = strict ? (actual as number) : Number(actual);
  const numExpected = Number(expected);
  if (isNaN(numActual) || isNaN(numExpected)) {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'number',
      actual,
      `Cannot compare non-numeric values at ${path}`
    );
  }
  if (!(numActual > numExpected)) {
    return constraintError(
      ConstraintErrorCode.VALUE_OUT_OF_RANGE,
      path,
      `> ${numExpected}`,
      numActual,
      `Expected ${path} to be greater than ${numExpected}, got ${numActual}`
    );
  }
  return null;
}

function checkLessThan(
  path: string,
  actual: unknown,
  expected: unknown,
  strict: boolean
): ConstraintError | null {
  if (strict && typeof actual !== 'number') {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'number',
      typeof actual,
      `Expected ${path} to be a number for "less_than" check, got ${typeof actual}`
    );
  }
  const numActual = strict ? (actual as number) : Number(actual);
  const numExpected = Number(expected);
  if (isNaN(numActual) || isNaN(numExpected)) {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'number',
      actual,
      `Cannot compare non-numeric values at ${path}`
    );
  }
  if (!(numActual < numExpected)) {
    return constraintError(
      ConstraintErrorCode.VALUE_OUT_OF_RANGE,
      path,
      `< ${numExpected}`,
      numActual,
      `Expected ${path} to be less than ${numExpected}, got ${numActual}`
    );
  }
  return null;
}

function checkIn(
  path: string,
  actual: unknown,
  expected: unknown
): ConstraintError | null {
  if (!Array.isArray(expected)) {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'array for "in" operator',
      typeof expected,
      `"in" operator requires an array value at ${path}`
    );
  }
  if (!expected.includes(actual)) {
    return constraintError(
      ConstraintErrorCode.ENUM_VIOLATION,
      path,
      expected,
      actual,
      `Expected ${path} to be one of [${expected.map((v) => JSON.stringify(v)).join(', ')}], got ${JSON.stringify(actual)}`
    );
  }
  return null;
}

function checkNotIn(
  path: string,
  actual: unknown,
  expected: unknown
): ConstraintError | null {
  if (!Array.isArray(expected)) {
    return constraintError(
      ConstraintErrorCode.TYPE_MISMATCH,
      path,
      'array for "not_in" operator',
      typeof expected,
      `"not_in" operator requires an array value at ${path}`
    );
  }
  if (expected.includes(actual)) {
    return constraintError(
      ConstraintErrorCode.ENUM_VIOLATION,
      path,
      `not in [${expected.map((v) => JSON.stringify(v)).join(', ')}]`,
      actual,
      `Expected ${path} to not be one of [${expected.map((v) => JSON.stringify(v)).join(', ')}], got ${JSON.stringify(actual)}`
    );
  }
  return null;
}

/**
 * Create a NamedValidator that evaluates deterministic constraints locally.
 *
 * This validator checks `conditions` on each rule matched to the tool.
 * It does not make network calls.
 */
export function createConstraintValidator(
  options: ConstraintEngineOptions = {}
): {
  evaluate: (
    args: Record<string, unknown>,
    conditions: RuleCondition[]
  ) => ConstraintResult;
} {
  return {
    evaluate: (args, conditions) =>
      evaluateConstraints(args, conditions, options),
  };
}
