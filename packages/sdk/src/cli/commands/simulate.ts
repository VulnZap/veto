import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Rule, RuleCondition } from '../../rules/types.js';

export interface SimulateOptions {
  policy: string;
  input: string;
  json?: boolean;
  verbose?: boolean;
}

interface SimulateInput {
  tool: string;
  arguments: Record<string, unknown>;
}

interface RuleMatch {
  ruleId: string;
  name: string;
  action: string;
  severity: string;
  conditionsMatched: string[];
}

export interface SimulateResult {
  decision: 'allow' | 'block';
  tool: string;
  matchedRules: RuleMatch[];
  totalRulesEvaluated: number;
  explanation: string;
}

function evaluateCondition(cond: RuleCondition, args: Record<string, unknown>): boolean {
  const fieldParts = cond.field.split('.');
  let current: unknown = { arguments: args };
  for (const part of fieldParts) {
    if (current === null || current === undefined || typeof current !== 'object') return false;
    current = (current as Record<string, unknown>)[part];
  }

  const value = current;
  const expected = cond.value;

  switch (cond.operator) {
    case 'equals': return value === expected;
    case 'not_equals': return value !== expected;
    case 'contains': return typeof value === 'string' && typeof expected === 'string' && value.includes(expected);
    case 'not_contains': return typeof value === 'string' && typeof expected === 'string' && !value.includes(expected);
    case 'starts_with': return typeof value === 'string' && typeof expected === 'string' && value.startsWith(expected);
    case 'ends_with': return typeof value === 'string' && typeof expected === 'string' && value.endsWith(expected);
    case 'matches': return typeof value === 'string' && typeof expected === 'string' && new RegExp(expected).test(value);
    case 'greater_than': return typeof value === 'number' && typeof expected === 'number' && value > expected;
    case 'less_than': return typeof value === 'number' && typeof expected === 'number' && value < expected;
    case 'in': return Array.isArray(expected) && expected.includes(value);
    case 'not_in': return Array.isArray(expected) && !expected.includes(value);
    default: return false;
  }
}

function findYamlFiles(dirPath: string): string[] {
  const files: string[] = [];
  if (!existsSync(dirPath)) return files;
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...findYamlFiles(fullPath));
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();
      if ((ext === '.yaml' || ext === '.yml') && !entry.includes('.test.') && !entry.includes('_test.')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function loadRules(policyPath: string): Rule[] {
  const resolved = resolve(policyPath);

  if (existsSync(resolved) && statSync(resolved).isFile()) {
    const content = readFileSync(resolved, 'utf-8');
    const parsed = parseYaml(content) as Record<string, unknown>;
    if (!parsed || !Array.isArray(parsed.rules)) {
      throw new Error(`Invalid policy file: ${resolved}`);
    }
    return parsed.rules as Rule[];
  }

  let searchDir = resolved;
  if (existsSync(join(resolved, 'veto', 'rules'))) {
    searchDir = join(resolved, 'veto', 'rules');
  } else if (existsSync(join(resolved, 'rules'))) {
    searchDir = join(resolved, 'rules');
  }

  const files = findYamlFiles(searchDir);
  const allRules: Rule[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const parsed = parseYaml(content) as Record<string, unknown>;
    if (parsed && Array.isArray(parsed.rules)) {
      allRules.push(...(parsed.rules as Rule[]));
    }
  }
  return allRules;
}

function loadInput(inputPath: string): SimulateInput {
  const resolved = resolve(inputPath);
  const content = readFileSync(resolved, 'utf-8');
  const parsed = parseYaml(content) as Record<string, unknown>;
  if (!parsed || typeof parsed.tool !== 'string' || !parsed.arguments || typeof parsed.arguments !== 'object') {
    throw new Error(`Invalid input file. Expected fields: tool (string), arguments (object)`);
  }
  return { tool: parsed.tool as string, arguments: parsed.arguments as Record<string, unknown> };
}

export async function simulate(options: SimulateOptions): Promise<SimulateResult> {
  const rules = loadRules(options.policy);
  const input = loadInput(options.input);

  const matchedRules: RuleMatch[] = [];
  let blocked = false;
  let totalEvaluated = 0;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.tools && rule.tools.length > 0 && !rule.tools.includes(input.tool)) continue;
    totalEvaluated++;

    const conditionsMatched: string[] = [];
    let ruleMatches = false;

    if (rule.conditions && rule.conditions.length > 0) {
      const allMatch = rule.conditions.every((c) => {
        const matches = evaluateCondition(c, input.arguments);
        if (matches) conditionsMatched.push(`${c.field} ${c.operator} ${JSON.stringify(c.value)}`);
        return matches;
      });
      ruleMatches = allMatch;
    } else if (rule.condition_groups && rule.condition_groups.length > 0) {
      ruleMatches = rule.condition_groups.some(group =>
        group.every(c => {
          const matches = evaluateCondition(c, input.arguments);
          if (matches) conditionsMatched.push(`${c.field} ${c.operator} ${JSON.stringify(c.value)}`);
          return matches;
        })
      );
    } else {
      ruleMatches = true;
    }

    if (ruleMatches) {
      matchedRules.push({
        ruleId: rule.id,
        name: rule.name,
        action: rule.action,
        severity: rule.severity,
        conditionsMatched,
      });
      if (rule.action === 'block') {
        blocked = true;
      }
    }
  }

  const decision = blocked ? 'block' as const : 'allow' as const;
  const explanation = blocked
    ? `Blocked by ${matchedRules.filter(r => r.action === 'block').map(r => r.ruleId).join(', ')}`
    : matchedRules.length > 0
      ? `Allowed (${matchedRules.length} rule(s) matched but none block)`
      : `Allowed (no rules matched)`;

  const result: SimulateResult = {
    decision,
    tool: input.tool,
    matchedRules,
    totalRulesEvaluated: totalEvaluated,
    explanation,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Decision: ${decision.toUpperCase()}`);
    console.log(`Tool: ${input.tool}`);
    console.log(`Rules evaluated: ${totalEvaluated}`);
    console.log(`Rules matched: ${matchedRules.length}`);
    if (matchedRules.length > 0) {
      console.log('');
      for (const m of matchedRules) {
        console.log(`  ${m.action === 'block' ? 'BLOCK' : m.action.toUpperCase()} ${m.ruleId} (${m.name}) [${m.severity}]`);
        if (options.verbose && m.conditionsMatched.length > 0) {
          for (const c of m.conditionsMatched) {
            console.log(`    matched: ${c}`);
          }
        }
      }
    }
    console.log('');
    console.log(explanation);
  }

  return result;
}
