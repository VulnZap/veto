/**
 * CLI command for inspecting decision explanations.
 *
 * Runs a validation against loaded rules and pretty-prints
 * the explanation trace.
 *
 * @module cli/explain
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { DecisionExplanation, ExplanationVerbosity } from '../types/explanation.js';
import type { Rule, RuleSet } from '../rules/types.js';
import { ValidationEngine } from '../core/validator.js';
import { createLogger } from '../utils/logger.js';

export interface ExplainOptions {
  toolName: string;
  argsJson: string;
  configDir?: string;
  verbosity?: ExplanationVerbosity;
  redactPaths?: string[];
  quiet?: boolean;
}

export interface ExplainResult {
  success: boolean;
  explanation?: DecisionExplanation;
  error?: string;
}

/**
 * Run a validation and return the explanation.
 */
export async function explain(options: ExplainOptions): Promise<ExplainResult> {
  const verbosity = options.verbosity ?? 'verbose';
  const configDir = resolve(options.configDir ?? './veto');
  const logger = createLogger(options.quiet ? 'silent' : 'info');

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(options.argsJson) as Record<string, unknown>;
  } catch {
    return { success: false, error: 'Invalid JSON arguments' };
  }

  // Load rules
  const configPath = join(configDir, 'veto.config.yaml');
  let rulesDir = join(configDir, 'rules');

  if (existsSync(configPath)) {
    try {
      const config = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      const rulesConfig = config.rules as Record<string, unknown> | undefined;
      if (rulesConfig?.directory) {
        rulesDir = resolve(configDir, rulesConfig.directory as string);
      }
    } catch {
      // use default rules dir
    }
  }

  const rules = loadRulesFromDir(rulesDir);
  if (rules.length === 0) {
    return { success: false, error: `No rules found in ${rulesDir}` };
  }

  // Build a validation engine with explanation enabled
  const engine = new ValidationEngine({
    logger,
    defaultDecision: 'allow',
    explanation: {
      verbosity,
      redactPaths: options.redactPaths,
    },
  });

  // Add a local rule evaluator that checks conditions
  const applicableRules = rules.filter(
    (r) => r.enabled && (!r.tools || r.tools.length === 0 || r.tools.includes(options.toolName))
  );

  engine.addValidator({
    name: 'rule-evaluator',
    description: 'Evaluates loaded YAML rules locally',
    priority: 50,
    validate: () => {
      if (applicableRules.length === 0) {
        return { decision: 'allow', reason: 'No applicable rules' };
      }

      // Check conditions locally
      for (const rule of applicableRules) {
        if (rule.action === 'block') {
          const conditionsMet = evaluateConditions(rule, args);
          if (conditionsMet) {
            return {
              decision: 'deny',
              reason: rule.description ?? `Rule ${rule.id} matched`,
              metadata: { matched_rules: [rule.id] },
            };
          }
        }
      }

      return { decision: 'allow', reason: 'All rules passed' };
    },
  });

  const result = await engine.validate({
    toolName: options.toolName,
    arguments: args,
    callId: 'explain-' + Date.now(),
    timestamp: new Date(),
    callHistory: [],
  });

  if (!options.quiet && result.explanation) {
    printExplanation(result.explanation);
  }

  return {
    success: true,
    explanation: result.explanation,
  };
}

function evaluateConditions(rule: Rule, args: Record<string, unknown>): boolean {
  if (!rule.conditions || rule.conditions.length === 0) return true;

  for (const condition of rule.conditions) {
    const value = getNestedValue(args, condition.field);
    if (!evaluateCondition(value, condition.operator, condition.value)) {
      return false;
    }
  }
  return true;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.replace(/^arguments\./, '').split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case 'equals': return actual === expected;
    case 'not_equals': return actual !== expected;
    case 'contains': return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
    case 'not_contains': return typeof actual === 'string' && typeof expected === 'string' && !actual.includes(expected);
    case 'starts_with': return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
    case 'ends_with': return typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected);
    case 'greater_than': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'less_than': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'not_in': return Array.isArray(expected) && !expected.includes(actual);
    case 'matches': {
      if (typeof actual !== 'string' || typeof expected !== 'string') return false;
      try { return new RegExp(expected).test(actual); } catch { return false; }
    }
    default: return false;
  }
}

function loadRulesFromDir(dir: string): Rule[] {
  if (!existsSync(dir)) return [];
  const rules: Rule[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        rules.push(...loadRulesFromDir(fullPath));
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (ext === '.yaml' || ext === '.yml') {
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const parsed = parseYaml(content) as RuleSet | Rule[] | Record<string, unknown>;

            if (Array.isArray(parsed)) {
              rules.push(...(parsed as Rule[]));
            } else if (parsed && typeof parsed === 'object' && 'rules' in parsed) {
              rules.push(...((parsed as RuleSet).rules ?? []));
            } else if (parsed && typeof parsed === 'object' && 'id' in parsed) {
              rules.push(parsed as unknown as Rule);
            }
          } catch {
            // skip unparseable files
          }
        }
      }
    }
  } catch {
    // directory not readable
  }

  return rules;
}

/**
 * Pretty-print a decision explanation to stdout.
 */
export function printExplanation(explanation: DecisionExplanation): void {
  const decisionLabel = explanation.decision === 'allow' ? 'ALLOW' : explanation.decision === 'deny' ? 'DENY' : 'MODIFY';
  const decisionColor = explanation.decision === 'allow' ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  const dim = '\x1b[2m';
  const bold = '\x1b[1m';

  console.log('');
  console.log(`${bold}Decision:${reset} ${decisionColor}${decisionLabel}${reset}`);
  console.log(`${bold}Reason:${reset}   ${explanation.reason}`);
  console.log(`${dim}Verbosity: ${explanation.verbosity} | Rules evaluated: ${explanation.evaluatedRules} | Rules matched: ${explanation.matchedRules} | Time: ${explanation.evaluationTimeMs.toFixed(2)}ms${reset}`);

  if (explanation.trace.length > 0) {
    console.log('');
    console.log(`${bold}Trace:${reset}`);
    for (const entry of explanation.trace) {
      const icon = entry.result === 'pass' ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
      console.log(`  ${icon} ${entry.ruleId}${entry.ruleName ? ` (${entry.ruleName})` : ''}`);
      console.log(`        ${dim}constraint: ${entry.constraint}${reset}`);
      console.log(`        ${dim}path:       ${entry.path}${reset}`);
      console.log(`        ${dim}expected:   ${JSON.stringify(entry.expected)}${reset}`);
      console.log(`        ${dim}actual:     ${JSON.stringify(entry.actual)}${reset}`);
      console.log(`        ${entry.message}`);
    }
  }

  if (explanation.remediation && explanation.remediation.length > 0) {
    console.log('');
    console.log(`${bold}Remediation:${reset}`);
    for (const suggestion of explanation.remediation) {
      console.log(`  - ${suggestion}`);
    }
  }

  console.log('');
}
