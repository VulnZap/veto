/**
 * Stable error taxonomy for deterministic constraint evaluation.
 *
 * Each error code maps to a specific failure type. Codes are stable
 * across versions and safe to match against in downstream systems.
 *
 * @module rules/constraint-errors
 */

export const ConstraintErrorCode = {
  TYPE_MISMATCH: 'CONSTRAINT_TYPE_MISMATCH',
  VALUE_OUT_OF_RANGE: 'CONSTRAINT_VALUE_OUT_OF_RANGE',
  PATTERN_MISMATCH: 'CONSTRAINT_PATTERN_MISMATCH',
  REQUIRED_MISSING: 'CONSTRAINT_REQUIRED_MISSING',
  PATH_NOT_FOUND: 'CONSTRAINT_PATH_NOT_FOUND',
  ARRAY_BOUNDS: 'CONSTRAINT_ARRAY_BOUNDS',
  ENUM_VIOLATION: 'CONSTRAINT_ENUM_VIOLATION',
} as const;

export type ConstraintErrorCode =
  (typeof ConstraintErrorCode)[keyof typeof ConstraintErrorCode];

export interface ConstraintError {
  code: ConstraintErrorCode;
  path: string;
  expected: unknown;
  actual: unknown;
  message: string;
}

export function constraintError(
  code: ConstraintErrorCode,
  path: string,
  expected: unknown,
  actual: unknown,
  message: string
): ConstraintError {
  return { code, path, expected, actual, message };
}
