import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Rule, RuleCondition } from '../../rules/types.js';

export interface TestOptions {
  path?: string;
  json?: boolean;
  verbose?: boolean;
}

interface TestFixture {
  name: string;
  tool: string;
  arguments: Record<string, unknown>;
  expect: 'allow' | 'block';
}

interface TestFileSpec {
  name?: string;
  policy: string;
  tests: TestFixture[];
}

interface TestCaseResult {
  name: string;
  tool: string;
  expected: string;
  actual: string;
  passed: boolean;
  matchedRules: string[];
}

interface TestSuiteResult {
  file: string;
  policy: string;
  total: number;
  passed: number;
  failed: number;
  results: TestCaseResult[];
}

export interface TestResult {
  success: boolean;
  suites: TestSuiteResult[];
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
}

function findTestFiles(dirPath: string, recursive: boolean): string[] {
  const files: string[] = [];
  if (!existsSync(dirPath)) return files;
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && recursive) {
      files.push(...findTestFiles(fullPath, recursive));
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();
      if ((ext === '.yaml' || ext === '.yml') && (entry.includes('.test.') || entry.includes('_test.'))) {
        files.push(fullPath);
      }
    }
  }
  return files;
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
    case 'equals':
      return value === expected;
    case 'not_equals':
      return value !== expected;
    case 'contains':
      return typeof value === 'string' && typeof expected === 'string' && value.includes(expected);
    case 'not_contains':
      return typeof value === 'string' && typeof expected === 'string' && !value.includes(expected);
    case 'starts_with':
      return typeof value === 'string' && typeof expected === 'string' && value.startsWith(expected);
    case 'ends_with':
      return typeof value === 'string' && typeof expected === 'string' && value.endsWith(expected);
    case 'matches':
      return typeof value === 'string' && typeof expected === 'string' && new RegExp(expected).test(value);
    case 'greater_than':
      return typeof value === 'number' && typeof expected === 'number' && value > expected;
    case 'less_than':
      return typeof value === 'number' && typeof expected === 'number' && value < expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(value);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(value);
    default:
      return false;
  }
}

function evaluateRule(rule: Rule, toolName: string, args: Record<string, unknown>): boolean {
  if (!rule.enabled) return false;
  if (rule.tools && rule.tools.length > 0 && !rule.tools.includes(toolName)) return false;

  if (rule.conditions && rule.conditions.length > 0) {
    return rule.conditions.every(c => evaluateCondition(c, args));
  }

  if (rule.condition_groups && rule.condition_groups.length > 0) {
    return rule.condition_groups.some(group =>
      group.every(c => evaluateCondition(c, args))
    );
  }

  return true;
}

function simulateDecision(rules: Rule[], toolName: string, args: Record<string, unknown>): { decision: 'allow' | 'block'; matchedRules: string[] } {
  const matchedRules: string[] = [];
  let blocked = false;

  for (const rule of rules) {
    if (evaluateRule(rule, toolName, args)) {
      matchedRules.push(rule.id);
      if (rule.action === 'block') {
        blocked = true;
      }
    }
  }

  return { decision: blocked ? 'block' : 'allow', matchedRules };
}

function loadPolicyRules(policyPath: string, testFile: string): Rule[] {
  const resolvedPath = resolve(join(testFile, '..'), policyPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Policy file not found: ${resolvedPath}`);
  }
  const content = readFileSync(resolvedPath, 'utf-8');
  const parsed = parseYaml(content) as Record<string, unknown>;
  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error(`Invalid policy file: ${resolvedPath}`);
  }
  return parsed.rules as Rule[];
}

export async function test(options: TestOptions): Promise<TestResult> {
  const targetPath = resolve(options.path || '.');

  let testFiles: string[];
  if (existsSync(targetPath) && statSync(targetPath).isFile()) {
    testFiles = [targetPath];
  } else {
    let searchDir = targetPath;
    if (existsSync(join(targetPath, 'veto'))) {
      searchDir = join(targetPath, 'veto');
    }
    testFiles = findTestFiles(searchDir, true);
  }

  if (testFiles.length === 0) {
    const result: TestResult = { success: true, suites: [], totalTests: 0, totalPassed: 0, totalFailed: 0 };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('No test files found (files must match *.test.yaml or *_test.yaml)');
    }
    return result;
  }

  const suites: TestSuiteResult[] = [];
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of testFiles) {
    let spec: TestFileSpec;
    try {
      const content = readFileSync(file, 'utf-8');
      spec = parseYaml(content) as TestFileSpec;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!options.json) {
        console.error(`ERROR: Cannot parse ${file}: ${msg}`);
      }
      continue;
    }

    if (!spec.policy || !Array.isArray(spec.tests)) {
      if (!options.json) {
        console.error(`ERROR: ${file}: missing "policy" or "tests" fields`);
      }
      continue;
    }

    let rules: Rule[];
    try {
      rules = loadPolicyRules(spec.policy, file);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!options.json) {
        console.error(`ERROR: ${file}: ${msg}`);
      }
      continue;
    }

    const suite: TestSuiteResult = {
      file,
      policy: spec.policy,
      total: spec.tests.length,
      passed: 0,
      failed: 0,
      results: [],
    };

    for (const fixture of spec.tests) {
      const { decision, matchedRules } = simulateDecision(rules, fixture.tool, fixture.arguments);
      const passed = decision === fixture.expect;
      const caseResult: TestCaseResult = {
        name: fixture.name,
        tool: fixture.tool,
        expected: fixture.expect,
        actual: decision,
        passed,
        matchedRules,
      };
      suite.results.push(caseResult);
      if (passed) {
        suite.passed++;
        totalPassed++;
      } else {
        suite.failed++;
        totalFailed++;
      }
      totalTests++;
    }

    suites.push(suite);
  }

  const result: TestResult = {
    success: totalFailed === 0,
    suites,
    totalTests,
    totalPassed,
    totalFailed,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const suite of suites) {
      console.log(`\n${basename(suite.file)} (policy: ${suite.policy})`);
      for (const r of suite.results) {
        const icon = r.passed ? 'PASS' : 'FAIL';
        console.log(`  ${icon} ${r.name} [${r.tool}] expected=${r.expected} actual=${r.actual}`);
        if (options.verbose && r.matchedRules.length > 0) {
          console.log(`       matched: ${r.matchedRules.join(', ')}`);
        }
      }
    }
    console.log(`\n${totalTests} test(s), ${totalPassed} passed, ${totalFailed} failed`);
  }

  return result;
}
