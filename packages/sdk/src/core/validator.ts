/**
 * Validation engine for tool calls.
 *
 * This module handles running validators and aggregating their results.
 *
 * @module core/validator
 */

import type {
  NamedValidator,
  ValidationContext,
  ValidationResult,
  Validator,
} from '../types/config.js';
import { normalizeValidator } from '../types/config.js';
import type { Logger } from '../utils/logger.js';
import type {
  DecisionExplanation,
  ExplanationConfig,
  ExplanationEntry,
} from '../types/explanation.js';
import {
  DEFAULT_EXPLANATION_CONFIG,
  createEmptyExplanation,
  redactValue,
} from '../types/explanation.js';

/**
 * Options for the validation engine.
 */
export interface ValidationEngineOptions {
  /** Logger instance */
  logger: Logger;
  /** Default decision when no validators match */
  defaultDecision: 'allow' | 'deny' | 'modify';
  /** Explanation configuration (defaults to verbosity "none") */
  explanation?: ExplanationConfig;
}

/**
 * Result of running all validators.
 */
export interface AggregatedValidationResult {
  /** Final decision after running all validators */
  finalResult: ValidationResult;
  /** Results from individual validators */
  validatorResults: Array<{
    validatorName: string;
    result: ValidationResult;
    durationMs: number;
  }>;
  /** Total duration of validation in milliseconds */
  totalDurationMs: number;
  /** Decision explanation (present when verbosity is not "none") */
  explanation?: DecisionExplanation;
}

/**
 * Validation engine that runs multiple validators in sequence.
 */
export class ValidationEngine {
  private readonly validators: NamedValidator[] = [];
  private readonly logger: Logger;
  private readonly defaultDecision: 'allow' | 'deny' | 'modify';
  private explanationConfig: ExplanationConfig;

  constructor(options: ValidationEngineOptions) {
    this.logger = options.logger;
    this.defaultDecision = options.defaultDecision;
    this.explanationConfig = options.explanation ?? { ...DEFAULT_EXPLANATION_CONFIG };
  }

  /**
   * Update explanation configuration at runtime.
   */
  setExplanationConfig(config: ExplanationConfig): void {
    this.explanationConfig = config;
  }

  /**
   * Get the current explanation configuration.
   */
  getExplanationConfig(): ExplanationConfig {
    return this.explanationConfig;
  }

  /**
   * Add a validator to the engine.
   *
   * @param validator - Validator function or named validator
   */
  addValidator(validator: Validator | NamedValidator): void {
    const normalized = normalizeValidator(validator, this.validators.length);
    this.validators.push(normalized);
    this.sortValidators();
    this.logger.debug('Validator added', {
      name: normalized.name,
      priority: normalized.priority,
      totalValidators: this.validators.length,
    });
  }

  /**
   * Add multiple validators at once.
   *
   * @param validators - Array of validators to add
   */
  addValidators(validators: Array<Validator | NamedValidator>): void {
    for (const validator of validators) {
      const normalized = normalizeValidator(validator, this.validators.length);
      this.validators.push(normalized);
    }
    this.sortValidators();
    this.logger.debug('Validators added', {
      count: validators.length,
      totalValidators: this.validators.length,
    });
  }

  /**
   * Remove a validator by name.
   *
   * @param name - Name of the validator to remove
   * @returns True if the validator was found and removed
   */
  removeValidator(name: string): boolean {
    const index = this.validators.findIndex((v) => v.name === name);
    if (index !== -1) {
      this.validators.splice(index, 1);
      this.logger.debug('Validator removed', { name });
      return true;
    }
    return false;
  }

  /**
   * Clear all validators.
   */
  clearValidators(): void {
    this.validators.length = 0;
    this.logger.debug('All validators cleared');
  }

  /**
   * Get the current list of validators.
   */
  getValidators(): readonly NamedValidator[] {
    return this.validators;
  }

  /**
   * Run all applicable validators for a tool call.
   *
   * Validators run in priority order. If any validator returns 'deny',
   * validation stops immediately and returns the denial.
   *
   * @param context - Validation context
   * @returns Aggregated validation result
   */
  async validate(context: ValidationContext): Promise<AggregatedValidationResult> {
    const startTime = performance.now();
    const validatorResults: AggregatedValidationResult['validatorResults'] = [];
    const verbosity = this.explanationConfig.verbosity;
    const collecting = verbosity !== 'none';
    const trace: ExplanationEntry[] = [];
    let evaluatedRules = 0;
    let matchedRules = 0;

    // Get validators that apply to this tool
    const applicableValidators = this.getApplicableValidators(context.toolName);

    this.logger.debug('Starting validation', {
      toolName: context.toolName,
      callId: context.callId,
      validatorCount: applicableValidators.length,
    });

    // If no validators, return default decision
    if (applicableValidators.length === 0) {
      const defaultResult: ValidationResult = { decision: this.defaultDecision };
      this.logger.debug('No applicable validators, using default decision', {
        decision: this.defaultDecision,
      });
      const totalDurationMs = performance.now() - startTime;
      const explanation = collecting
        ? createEmptyExplanation(this.defaultDecision, 'No applicable validators', totalDurationMs)
        : undefined;
      return {
        finalResult: defaultResult,
        validatorResults: [],
        totalDurationMs,
        explanation,
      };
    }

    let finalResult: ValidationResult = { decision: 'allow' };
    let currentContext = context;

    // Run validators in sequence
    for (const validator of applicableValidators) {
      const validatorStart = performance.now();
      evaluatedRules++;

      try {
        const result = await validator.validate(currentContext);
        const durationMs = performance.now() - validatorStart;

        validatorResults.push({
          validatorName: validator.name,
          result,
          durationMs,
        });

        this.logger.debug('Validator completed', {
          validatorName: validator.name,
          decision: result.decision,
          durationMs: Math.round(durationMs * 100) / 100,
        });

        // Collect trace entries when explanation is enabled
        if (collecting) {
          // A rule is considered "matched" if it changes the decision (deny or modify)
          const isMatch = result.decision === 'deny' || result.decision === 'modify';
          if (isMatch) matchedRules++;

          if (verbosity === 'verbose' || isMatch) {
            trace.push(
              ...this.buildTraceEntries(validator, result, currentContext)
            );
          }
        }

        // Handle different decisions
        if (result.decision === 'deny') {
          // Stop on first denial
          finalResult = result;
          this.logger.info('Tool call denied by validator', {
            toolName: context.toolName,
            callId: context.callId,
            validator: validator.name,
            reason: result.reason,
          });
          break;
        } else if (result.decision === 'modify' && result.modifiedArguments) {
          // Update context with modified arguments for next validator
          currentContext = {
            ...currentContext,
            arguments: result.modifiedArguments,
          };
          finalResult = result;
        } else if (result.decision === 'allow') {
          // Continue to next validator
          finalResult = result;
        }
      } catch (error) {
        const durationMs = performance.now() - validatorStart;
        const errorMessage = error instanceof Error ? error.message : String(error);

        this.logger.error(
          'Validator threw an error',
          {
            validatorName: validator.name,
            toolName: context.toolName,
            callId: context.callId,
          },
          error instanceof Error ? error : new Error(errorMessage)
        );

        const denyResult: ValidationResult = {
          decision: 'deny',
          reason: `Validator error: ${errorMessage}`,
        };

        // Treat validator errors as denials for safety
        validatorResults.push({
          validatorName: validator.name,
          result: denyResult,
          durationMs,
        });

        if (collecting) {
          matchedRules++;
          trace.push({
            ruleId: validator.name,
            ruleName: validator.description,
            constraint: 'validator.error',
            path: '',
            expected: 'no error',
            actual: errorMessage,
            result: 'fail',
            message: `Validator "${validator.name}" threw: ${errorMessage}`,
          });
        }

        finalResult = {
          decision: 'deny',
          reason: `Validator "${validator.name}" threw an error: ${errorMessage}`,
        };
        break;
      }
    }

    const totalDurationMs = performance.now() - startTime;

    this.logger.debug('Validation complete', {
      toolName: context.toolName,
      callId: context.callId,
      finalDecision: finalResult.decision,
      totalDurationMs: Math.round(totalDurationMs * 100) / 100,
    });

    // Build explanation
    let explanation: DecisionExplanation | undefined;
    if (collecting) {
      const redactPaths = this.explanationConfig.redactPaths ?? [];
      const redactedTrace = redactPaths.length > 0
        ? trace.map((entry) => ({
            ...entry,
            actual: redactValue(entry.actual, entry.path, redactPaths),
            expected: redactValue(entry.expected, entry.path, redactPaths),
          }))
        : trace;

      explanation = {
        decision: finalResult.decision,
        reason: finalResult.reason ?? 'No reason provided',
        verbosity,
        trace: redactedTrace,
        evaluatedRules,
        matchedRules,
        evaluationTimeMs: totalDurationMs,
        remediation: this.buildRemediation(finalResult, validatorResults),
      };

      // Attach explanation to the final result as well
      finalResult = { ...finalResult, explanation };
    }

    return {
      finalResult,
      validatorResults,
      totalDurationMs,
      explanation,
    };
  }

  /**
   * Build trace entries from a validator result.
   *
   * Note: Both 'deny' and 'modify' decisions are classified as 'fail' in the trace
   * because they represent matched rules that changed the decision outcome.
   *
   * Trace entries include fine-grained paths when validators provide metadata
   * about which fields were checked (via metadata.checked_fields or metadata.field_path).
   */
  private buildTraceEntries(
    validator: NamedValidator,
    result: ValidationResult,
    context: ValidationContext
  ): ExplanationEntry[] {
    const entries: ExplanationEntry[] = [];
    // 'deny' and 'modify' are both decision-changing outcomes, so they are 'fail' in trace
    // Only 'allow' is a 'pass' (no action needed)
    const traceResult: 'pass' | 'fail' = result.decision === 'allow' ? 'pass' : 'fail';

    // Extract fine-grained paths from metadata if available
    const checkedFields = result.metadata?.checked_fields as string[] | undefined;
    const fieldPath = result.metadata?.field_path as string | undefined;

    // If the result has metadata with matched_rules, produce entries per rule
    const matchedRuleIds = result.metadata?.matched_rules as string[] | undefined;
    if (matchedRuleIds && matchedRuleIds.length > 0) {
      for (const ruleId of matchedRuleIds) {
        // Use fine-grained path if available, otherwise fall back to coarse path
        const entryPath = fieldPath ?? (checkedFields?.[0] ? `arguments.${checkedFields[0]}` : 'arguments');
        entries.push({
          ruleId,
          ruleName: validator.description,
          constraint: `${validator.name}.rule_match`,
          path: entryPath,
          expected: `rule ${ruleId} passes`,
          actual: result.reason ?? result.decision,
          result: traceResult,
          message: result.reason ?? `Rule ${ruleId} ${traceResult === 'pass' ? 'passed' : 'failed'}`,
        });
      }
    } else if (checkedFields && checkedFields.length > 0) {
      // Emit one entry per checked field for fine-grained redaction support
      for (const field of checkedFields) {
        const fieldValue = this.getFieldValue(context.arguments, field);
        entries.push({
          ruleId: validator.name,
          ruleName: validator.description,
          constraint: `${validator.name}.field_check`,
          path: `arguments.${field}`,
          expected: 'valid',
          actual: fieldValue,
          result: traceResult,
          message: result.reason ?? `Validator ${validator.name} checked field ${field}`,
        });
      }
    } else {
      // Single entry for the validator with field_path if available
      const entryPath = fieldPath ?? 'arguments';
      entries.push({
        ruleId: validator.name,
        ruleName: validator.description,
        constraint: `${validator.name}.decision`,
        path: entryPath,
        expected: 'allow',
        actual: result.decision,
        result: traceResult,
        message: result.reason ?? `Validator ${validator.name} returned ${result.decision}`,
      });
    }

    return entries;
  }

  /**
   * Get a nested field value from arguments.
   */
  private getFieldValue(args: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = args;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * Build remediation suggestions from the validation results.
   */
  private buildRemediation(
    finalResult: ValidationResult,
    validatorResults: AggregatedValidationResult['validatorResults']
  ): string[] | undefined {
    if (finalResult.decision === 'allow') return undefined;

    const suggestions: string[] = [];
    for (const vr of validatorResults) {
      if (vr.result.decision === 'deny' && vr.result.reason) {
        suggestions.push(`Fix: ${vr.result.reason}`);
      }
    }
    return suggestions.length > 0 ? suggestions : undefined;
  }

  /**
   * Sort validators by priority (lower runs first).
   */
  private sortValidators(): void {
    this.validators.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /**
   * Get validators that apply to a specific tool.
   */
  private getApplicableValidators(toolName: string): NamedValidator[] {
    return this.validators.filter((validator) => {
      // If no filter specified, validator applies to all tools
      if (!validator.toolFilter || validator.toolFilter.length === 0) {
        return true;
      }
      // Check if tool name is in the filter list
      return validator.toolFilter.includes(toolName);
    });
  }
}

/**
 * Create a simple validator that always allows.
 * Useful as a placeholder or for testing.
 */
export function createPassthroughValidator(): NamedValidator {
  return {
    name: 'passthrough',
    description: 'Allows all tool calls without validation',
    priority: 1000, // Run last
    validate: () => ({ decision: 'allow' }),
  };
}

/**
 * Create a validator that denies specific tools.
 *
 * @param toolNames - Names of tools to deny
 * @param reason - Reason for denial
 */
export function createBlocklistValidator(
  toolNames: string[],
  reason = 'Tool is blocked'
): NamedValidator {
  return {
    name: 'blocklist',
    description: `Blocks tools: ${toolNames.join(', ')}`,
    priority: 1, // Run first
    toolFilter: toolNames,
    validate: (context) => ({
      decision: 'deny',
      reason: `${reason}: ${context.toolName}`,
    }),
  };
}

/**
 * Create a validator that only allows specific tools.
 *
 * @param toolNames - Names of tools to allow
 * @param reason - Reason for denial of other tools
 */
export function createAllowlistValidator(
  toolNames: string[],
  reason = 'Tool is not in allowlist'
): NamedValidator {
  const toolSet = new Set(toolNames);
  return {
    name: 'allowlist',
    description: `Only allows tools: ${toolNames.join(', ')}`,
    priority: 1, // Run first
    validate: (context) => {
      if (toolSet.has(context.toolName)) {
        return { decision: 'allow' };
      }
      return {
        decision: 'deny',
        reason: `${reason}: ${context.toolName}`,
      };
    },
  };
}
