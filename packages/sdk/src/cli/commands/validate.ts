import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ConditionOperator, RuleSeverity, RuleAction } from '../../rules/types.js';

export interface ValidateOptions {
  path?: string;
  json?: boolean;
  verbose?: boolean;
}

interface ValidationError {
  file: string;
  ruleId?: string;
  field: string;
  message: string;
}

interface ValidateResult {
  valid: boolean;
  filesChecked: number;
  errors: ValidationError[];
  warnings: ValidationError[];
}

const VALID_OPERATORS: ConditionOperator[] = [
  'equals', 'not_equals', 'contains', 'not_contains',
  'starts_with', 'ends_with', 'matches',
  'greater_than', 'less_than', 'in', 'not_in',
];

const VALID_SEVERITIES: RuleSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const VALID_ACTIONS: RuleAction[] = ['block', 'warn', 'log', 'allow'];

function findYamlFiles(dirPath: string, recursive: boolean): string[] {
  const files: string[] = [];
  if (!existsSync(dirPath)) return files;
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && recursive) {
      files.push(...findYamlFiles(fullPath, recursive));
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();
      if (ext === '.yaml' || ext === '.yml') {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function validateCondition(cond: unknown, file: string, ruleId: string, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!cond || typeof cond !== 'object') {
    errors.push({ file, ruleId, field: `conditions[${index}]`, message: 'Condition must be an object' });
    return errors;
  }
  const c = cond as Record<string, unknown>;
  if (typeof c.field !== 'string' || c.field.length === 0) {
    errors.push({ file, ruleId, field: `conditions[${index}].field`, message: 'Required string field' });
  }
  if (!VALID_OPERATORS.includes(c.operator as ConditionOperator)) {
    errors.push({
      file, ruleId,
      field: `conditions[${index}].operator`,
      message: `Must be one of: ${VALID_OPERATORS.join(', ')}`,
    });
  }
  if (c.value === undefined) {
    errors.push({ file, ruleId, field: `conditions[${index}].value`, message: 'Required field' });
  }
  return errors;
}

function validateRule(rule: unknown, file: string, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!rule || typeof rule !== 'object') {
    errors.push({ file, field: `rules[${index}]`, message: 'Rule must be an object' });
    return errors;
  }
  const r = rule as Record<string, unknown>;
  const ruleId = (r.id as string) || `rules[${index}]`;

  if (typeof r.id !== 'string' || r.id.length === 0) {
    errors.push({ file, ruleId, field: 'id', message: 'Required non-empty string' });
  }
  if (typeof r.name !== 'string' || r.name.length === 0) {
    errors.push({ file, ruleId, field: 'name', message: 'Required non-empty string' });
  }
  if (r.severity !== undefined && !VALID_SEVERITIES.includes(r.severity as RuleSeverity)) {
    errors.push({ file, ruleId, field: 'severity', message: `Must be one of: ${VALID_SEVERITIES.join(', ')}` });
  }
  if (r.action !== undefined && !VALID_ACTIONS.includes(r.action as RuleAction)) {
    errors.push({ file, ruleId, field: 'action', message: `Must be one of: ${VALID_ACTIONS.join(', ')}` });
  }
  if (r.tools !== undefined && !Array.isArray(r.tools)) {
    errors.push({ file, ruleId, field: 'tools', message: 'Must be an array of strings' });
  }
  if (r.enabled !== undefined && typeof r.enabled !== 'boolean') {
    errors.push({ file, ruleId, field: 'enabled', message: 'Must be a boolean' });
  }

  if (r.conditions !== undefined) {
    if (!Array.isArray(r.conditions)) {
      errors.push({ file, ruleId, field: 'conditions', message: 'Must be an array' });
    } else {
      for (let i = 0; i < r.conditions.length; i++) {
        errors.push(...validateCondition(r.conditions[i], file, ruleId, i));
      }
    }
  }

  if (r.condition_groups !== undefined) {
    if (!Array.isArray(r.condition_groups)) {
      errors.push({ file, ruleId, field: 'condition_groups', message: 'Must be an array of arrays' });
    } else {
      for (let g = 0; g < r.condition_groups.length; g++) {
        const group = r.condition_groups[g];
        if (!Array.isArray(group)) {
          errors.push({ file, ruleId, field: `condition_groups[${g}]`, message: 'Must be an array' });
        } else {
          for (let i = 0; i < group.length; i++) {
            errors.push(...validateCondition(group[i], file, ruleId, i));
          }
        }
      }
    }
  }

  return errors;
}

function validateRuleFile(filePath: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    errors.push({ file: filePath, field: '', message: 'Cannot read file' });
    return { errors, warnings };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (e) {
    errors.push({ file: filePath, field: '', message: `YAML parse error: ${e instanceof Error ? e.message : String(e)}` });
    return { errors, warnings };
  }

  if (!parsed || typeof parsed !== 'object') {
    errors.push({ file: filePath, field: '', message: 'File must contain a YAML object' });
    return { errors, warnings };
  }

  const data = parsed as Record<string, unknown>;

  if (!data.rules || !Array.isArray(data.rules)) {
    errors.push({ file: filePath, field: 'rules', message: 'Missing or invalid "rules" array' });
    return { errors, warnings };
  }

  if (!data.version) {
    warnings.push({ file: filePath, field: 'version', message: 'Missing version field' });
  }
  if (!data.name) {
    warnings.push({ file: filePath, field: 'name', message: 'Missing name field' });
  }

  const ruleIds = new Set<string>();
  for (let i = 0; i < data.rules.length; i++) {
    const rule = data.rules[i] as Record<string, unknown>;
    errors.push(...validateRule(rule, filePath, i));

    if (rule && typeof rule === 'object' && typeof rule.id === 'string') {
      if (ruleIds.has(rule.id)) {
        errors.push({ file: filePath, ruleId: rule.id, field: 'id', message: 'Duplicate rule ID' });
      }
      ruleIds.add(rule.id);
    }
  }

  return { errors, warnings };
}

export async function validate(options: ValidateOptions): Promise<ValidateResult> {
  const targetPath = resolve(options.path || '.');

  let files: string[];
  if (existsSync(targetPath) && statSync(targetPath).isFile()) {
    files = [targetPath];
  } else {
    let rulesDir = targetPath;
    if (existsSync(join(targetPath, 'veto', 'rules'))) {
      rulesDir = join(targetPath, 'veto', 'rules');
    } else if (existsSync(join(targetPath, 'rules'))) {
      rulesDir = join(targetPath, 'rules');
    }
    files = findYamlFiles(rulesDir, true);
  }

  if (files.length === 0) {
    return { valid: true, filesChecked: 0, errors: [], warnings: [] };
  }

  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  for (const file of files) {
    const { errors, warnings } = validateRuleFile(file);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }

  const result: ValidateResult = {
    valid: allErrors.length === 0,
    filesChecked: files.length,
    errors: allErrors,
    warnings: allWarnings,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (allErrors.length === 0 && allWarnings.length === 0) {
      console.log(`Validated ${files.length} file(s): all valid`);
    } else {
      for (const err of allErrors) {
        const loc = [err.file, err.ruleId, err.field].filter(Boolean).join(':');
        console.error(`ERROR ${loc}: ${err.message}`);
      }
      for (const warn of allWarnings) {
        const loc = [warn.file, warn.ruleId, warn.field].filter(Boolean).join(':');
        console.warn(`WARN  ${loc}: ${warn.message}`);
      }
      console.log('');
      console.log(`${files.length} file(s), ${allErrors.length} error(s), ${allWarnings.length} warning(s)`);
    }
  }

  return result;
}
