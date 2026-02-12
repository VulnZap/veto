import type {
  ArgumentConstraint,
  LocalValidationResult,
  ConstraintCheckResult,
} from './types.js';
import { isSafePattern } from './regex-safety.js';

export function validateDeterministic(
  _toolName: string,
  args: Record<string, unknown>,
  constraints: ArgumentConstraint[]
): LocalValidationResult {
  const startTime = Date.now();
  const validations: { argument: string; status: 'pass' | 'fail'; reason?: string }[] = [];

  for (const constraint of constraints) {
    if (!constraint.enabled) continue;

    const value = args[constraint.argumentName];

    if (value === undefined || value === null) {
      if (constraint.required) {
        return {
          decision: 'deny',
          reason: `Required argument '${constraint.argumentName}' is missing`,
          failedArgument: constraint.argumentName,
          validations,
          latencyMs: Date.now() - startTime,
        };
      }
      if (constraint.notNull && value === null) {
        return {
          decision: 'deny',
          reason: `Argument '${constraint.argumentName}' cannot be null`,
          failedArgument: constraint.argumentName,
          validations,
          latencyMs: Date.now() - startTime,
        };
      }
      continue;
    }

    const result = checkConstraints(value, constraint);

    validations.push({
      argument: constraint.argumentName,
      status: result.pass ? 'pass' : 'fail',
      reason: result.reason,
    });

    if (!result.pass) {
      return {
        decision: 'deny',
        reason: `Argument '${constraint.argumentName}' failed: ${result.reason}`,
        failedArgument: constraint.argumentName,
        validations,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  return {
    decision: 'allow',
    validations,
    latencyMs: Date.now() - startTime,
  };
}

function checkConstraints(
  value: unknown,
  constraint: ArgumentConstraint
): ConstraintCheckResult {
  if (typeof value === 'number') {
    return checkNumberConstraints(value, constraint);
  }

  if (typeof value === 'string') {
    return checkStringConstraints(value, constraint);
  }

  if (Array.isArray(value)) {
    return checkArrayConstraints(value, constraint);
  }

  return { pass: true };
}

function checkNumberConstraints(
  value: number,
  constraint: ArgumentConstraint
): ConstraintCheckResult {
  if (constraint.greaterThan !== undefined && value <= constraint.greaterThan) {
    return {
      pass: false,
      reason: `value ${value} must be greater than ${constraint.greaterThan}`,
    };
  }

  if (constraint.lessThan !== undefined && value >= constraint.lessThan) {
    return {
      pass: false,
      reason: `value ${value} must be less than ${constraint.lessThan}`,
    };
  }

  if (constraint.greaterThanOrEqual !== undefined && value < constraint.greaterThanOrEqual) {
    return {
      pass: false,
      reason: `value ${value} must be >= ${constraint.greaterThanOrEqual}`,
    };
  }

  if (constraint.lessThanOrEqual !== undefined && value > constraint.lessThanOrEqual) {
    return {
      pass: false,
      reason: `value ${value} must be <= ${constraint.lessThanOrEqual}`,
    };
  }

  if (constraint.minimum !== undefined && value < constraint.minimum) {
    return {
      pass: false,
      reason: `value ${value} must be >= ${constraint.minimum}`,
    };
  }

  if (constraint.maximum !== undefined && value > constraint.maximum) {
    return {
      pass: false,
      reason: `value ${value} must be <= ${constraint.maximum}`,
    };
  }

  return { pass: true };
}

function checkStringConstraints(
  value: string,
  constraint: ArgumentConstraint
): ConstraintCheckResult {
  if (constraint.minLength !== undefined && value.length < constraint.minLength) {
    return {
      pass: false,
      reason: `length ${value.length} is less than minimum ${constraint.minLength}`,
    };
  }

  if (constraint.maxLength !== undefined && value.length > constraint.maxLength) {
    return {
      pass: false,
      reason: `length ${value.length} exceeds maximum ${constraint.maxLength}`,
    };
  }

  if (constraint.regex !== undefined) {
    if (constraint.regex.length > 256) {
      return {
        pass: false,
        reason: `regex pattern too long (${constraint.regex.length} chars, max 256)`,
      };
    }
    try {
      const regex = new RegExp(constraint.regex);
      if (!isSafePattern(constraint.regex)) {
        return {
          pass: false,
          reason: `regex pattern is potentially unsafe (ReDoS risk): ${constraint.regex}`,
        };
      }
      if (!regex.test(value)) {
        return {
          pass: false,
          reason: `value does not match pattern ${constraint.regex}`,
        };
      }
    } catch {
      return {
        pass: false,
        reason: `invalid regex pattern: ${constraint.regex}`,
      };
    }
  }

  if (constraint.enum !== undefined && !constraint.enum.includes(value)) {
    return {
      pass: false,
      reason: `value "${value}" is not in allowed values: ${constraint.enum.join(', ')}`,
    };
  }

  return { pass: true };
}

function checkArrayConstraints(
  value: unknown[],
  constraint: ArgumentConstraint
): ConstraintCheckResult {
  if (constraint.minItems !== undefined && value.length < constraint.minItems) {
    return {
      pass: false,
      reason: `array has ${value.length} items, minimum is ${constraint.minItems}`,
    };
  }

  if (constraint.maxItems !== undefined && value.length > constraint.maxItems) {
    return {
      pass: false,
      reason: `array has ${value.length} items, maximum is ${constraint.maxItems}`,
    };
  }

  return { pass: true };
}
