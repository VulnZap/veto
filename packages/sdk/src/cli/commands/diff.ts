import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Rule } from '../../rules/types.js';

export interface DiffOptions {
  path1: string;
  path2: string;
  json?: boolean;
  verbose?: boolean;
}

interface RuleDiff {
  ruleId: string;
  status: 'added' | 'removed' | 'changed';
  fields?: FieldChange[];
}

interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface DiffResult {
  file1: string;
  file2: string;
  added: RuleDiff[];
  removed: RuleDiff[];
  changed: RuleDiff[];
  unchanged: number;
}

function loadRules(filePath: string): { rules: Rule[]; name: string } {
  const content = readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(content) as Record<string, unknown>;
  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error(`Invalid policy file: ${filePath}`);
  }
  return { rules: parsed.rules as Rule[], name: (parsed.name as string) || basename(filePath) };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of keys) {
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }
  return false;
}

function diffRules(oldRule: Rule, newRule: Rule): FieldChange[] {
  const changes: FieldChange[] = [];
  const fields: (keyof Rule)[] = ['name', 'description', 'enabled', 'severity', 'action', 'tools', 'conditions', 'condition_groups', 'tags'];
  for (const field of fields) {
    if (!deepEqual(oldRule[field], newRule[field])) {
      changes.push({ field, from: oldRule[field], to: newRule[field] });
    }
  }
  return changes;
}

export async function diff(options: DiffOptions): Promise<DiffResult> {
  const path1 = resolve(options.path1);
  const path2 = resolve(options.path2);

  const file1 = loadRules(path1);
  const file2 = loadRules(path2);

  const oldMap = new Map<string, Rule>();
  for (const rule of file1.rules) {
    oldMap.set(rule.id, rule);
  }

  const newMap = new Map<string, Rule>();
  for (const rule of file2.rules) {
    newMap.set(rule.id, rule);
  }

  const added: RuleDiff[] = [];
  const removed: RuleDiff[] = [];
  const changed: RuleDiff[] = [];
  let unchanged = 0;

  for (const id of newMap.keys()) {
    if (!oldMap.has(id)) {
      added.push({ ruleId: id, status: 'added' });
    }
  }

  for (const [id, rule] of oldMap) {
    if (!newMap.has(id)) {
      removed.push({ ruleId: id, status: 'removed' });
    } else {
      const fields = diffRules(rule, newMap.get(id)!);
      if (fields.length > 0) {
        changed.push({ ruleId: id, status: 'changed', fields });
      } else {
        unchanged++;
      }
    }
  }

  const result: DiffResult = { file1: path1, file2: path2, added, removed, changed, unchanged };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (added.length === 0 && removed.length === 0 && changed.length === 0) {
      console.log('No differences found');
    } else {
      for (const d of added) {
        console.log(`+ ${d.ruleId} (added)`);
        if (options.verbose) {
          const rule = newMap.get(d.ruleId)!;
          console.log(`    name: ${rule.name}`);
          console.log(`    action: ${rule.action}`);
          console.log(`    severity: ${rule.severity}`);
        }
      }
      for (const d of removed) {
        console.log(`- ${d.ruleId} (removed)`);
      }
      for (const d of changed) {
        console.log(`~ ${d.ruleId} (changed)`);
        if (d.fields) {
          for (const f of d.fields) {
            console.log(`    ${f.field}: ${JSON.stringify(f.from)} -> ${JSON.stringify(f.to)}`);
          }
        }
      }
      console.log('');
      console.log(`${added.length} added, ${removed.length} removed, ${changed.length} changed, ${unchanged} unchanged`);
    }
  }

  return result;
}
