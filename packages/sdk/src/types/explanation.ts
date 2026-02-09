/**
 * Types for decision explainability.
 *
 * Provides transparent provenance for validation decisions: which rules
 * executed, what values were compared, and what remediation is possible.
 *
 * @module types/explanation
 */

/**
 * Verbosity level for explanation output.
 * - "none": No trace collected, just decision + reason (zero overhead)
 * - "simple": Decision + reason + summary of matched rules
 * - "verbose": Full trace with all constraint evaluations
 */
export type ExplanationVerbosity = 'none' | 'simple' | 'verbose';

/**
 * Result of a single constraint evaluation within a rule.
 */
export interface ExplanationEntry {
  /** ID of the rule that was evaluated */
  ruleId: string;
  /** Human-readable rule name */
  ruleName?: string;
  /** Constraint that was checked (e.g., "field.operator") */
  constraint: string;
  /** Dot-path to the argument value (e.g., "arguments.path") */
  path: string;
  /** Expected value from the rule condition */
  expected: unknown;
  /** Actual value from the tool call arguments */
  actual: unknown;
  /** Whether this check passed or failed */
  result: 'pass' | 'fail';
  /** Human-readable message describing the check outcome */
  message: string;
}

/**
 * Full decision explanation returned alongside a validation result.
 */
export interface DecisionExplanation {
  /** The final decision */
  decision: 'allow' | 'deny' | 'modify';
  /** Top-level reason for the decision */
  reason: string;
  /** Verbosity level used to generate this explanation */
  verbosity: ExplanationVerbosity;
  /** Ordered trace of constraint evaluations (empty when verbosity is "none") */
  trace: ExplanationEntry[];
  /** Number of rules that were evaluated */
  evaluatedRules: number;
  /** Number of rules that matched (contributed to the decision) */
  matchedRules: number;
  /** Total time spent on evaluation in milliseconds */
  evaluationTimeMs: number;
  /** Suggested remediation actions (e.g., "Remove sensitive path from arguments") */
  remediation?: string[];
}

/**
 * Configuration for explanation behavior.
 */
export interface ExplanationConfig {
  /** Verbosity level for explanation output */
  verbosity: ExplanationVerbosity;
  /** Dot-paths whose values should be replaced with '[REDACTED]' in trace output */
  redactPaths?: string[];
}

/**
 * Default explanation config: no overhead.
 */
export const DEFAULT_EXPLANATION_CONFIG: ExplanationConfig = {
  verbosity: 'none',
};

/**
 * Redact a value at a given path if the path is in the redact list.
 */
export function redactValue(
  value: unknown,
  path: string,
  redactPaths: string[]
): unknown {
  if (redactPaths.length === 0) return value;
  for (const redactPath of redactPaths) {
    if (path === redactPath || path.startsWith(redactPath + '.')) {
      return '[REDACTED]';
    }
  }
  return value;
}

/**
 * Create an empty explanation for "none" verbosity.
 */
export function createEmptyExplanation(
  decision: DecisionExplanation['decision'],
  reason: string,
  evaluationTimeMs: number
): DecisionExplanation {
  return {
    decision,
    reason,
    verbosity: 'none',
    trace: [],
    evaluatedRules: 0,
    matchedRules: 0,
    evaluationTimeMs,
  };
}
