/**
 * Type definitions for the natural language policy generator.
 *
 * @module generator/types
 */

import type { ConditionOperator, RuleAction, RuleSeverity } from '../rules/types.js';
import type { CustomProvider } from '../custom/types.js';

/**
 * Constraint type parsed from natural language.
 */
export type ConstraintType =
  | 'string_pattern'
  | 'string_enum'
  | 'string_length'
  | 'number_range'
  | 'number_exact'
  | 'boolean_exact'
  | 'array_contains'
  | 'array_length'
  | 'field_required'
  | 'field_absent';

/**
 * A single parsed constraint from natural language intent.
 */
export interface ParsedConstraint {
  field: string;
  type: ConstraintType;
  operator: ConditionOperator;
  value: unknown;
}

/**
 * Structured intent parsed from a natural language description.
 */
export interface GeneratorIntent {
  toolName: string;
  description: string;
  action: RuleAction;
  severity: RuleSeverity;
  constraints: ParsedConstraint[];
  tags: string[];
}

/**
 * A generated policy in the canonical rule set format.
 */
export interface GeneratedPolicy {
  version: string;
  name: string;
  description: string;
  rules: GeneratedRule[];
}

/**
 * A single generated rule within a policy.
 */
export interface GeneratedRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: RuleSeverity;
  action: RuleAction;
  tools: string[];
  conditions: GeneratedCondition[];
}

/**
 * A condition within a generated rule.
 */
export interface GeneratedCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

/**
 * A generated test case for validating a policy.
 */
export interface GeneratedTestCase {
  name: string;
  description: string;
  toolCall: {
    tool: string;
    arguments: Record<string, unknown>;
  };
  expectedDecision: 'allow' | 'block';
}

/**
 * Complete output from the generator including policy and optional tests.
 */
export interface GeneratorOutput {
  policy: GeneratedPolicy;
  testCases: GeneratedTestCase[];
  yaml: string;
}

/**
 * Configuration for the policy generator.
 */
export interface GeneratorConfig {
  provider: CustomProvider;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
}

/**
 * LLM response schema for intent parsing.
 */
export interface LLMIntentResponse {
  toolName: string;
  description: string;
  action: string;
  severity: string;
  constraints: Array<{
    field: string;
    type: string;
    operator: string;
    value: unknown;
  }>;
  tags: string[];
}

/**
 * Error thrown when policy generation fails.
 */
export class GeneratorError extends Error {
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'GeneratorError';
    this.cause = cause;
  }
}

/**
 * Error thrown when LLM output fails schema validation.
 */
export class GeneratorValidationError extends GeneratorError {
  readonly rawOutput: string;

  constructor(message: string, rawOutput: string) {
    super(message);
    this.name = 'GeneratorValidationError';
    this.rawOutput = rawOutput;
  }
}
