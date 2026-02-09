import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Rule } from '../../rules/types.js';

export interface DeployOptions {
  path: string;
  target?: string;
  apiUrl?: string;
  apiKey?: string;
  dryRun?: boolean;
  json?: boolean;
  verbose?: boolean;
}

interface PolicyPayload {
  name: string;
  rules: Rule[];
  source: string;
}

export interface DeployResult {
  success: boolean;
  target: string;
  policies: { name: string; ruleCount: number; source: string }[];
  dryRun: boolean;
  error?: string;
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

function loadPolicies(policyPath: string): PolicyPayload[] {
  const resolved = resolve(policyPath);
  const policies: PolicyPayload[] = [];

  if (existsSync(resolved) && statSync(resolved).isFile()) {
    const content = readFileSync(resolved, 'utf-8');
    const parsed = parseYaml(content) as Record<string, unknown>;
    if (!parsed || !Array.isArray(parsed.rules)) {
      throw new Error(`Invalid policy file: ${resolved}`);
    }
    policies.push({
      name: (parsed.name as string) || basename(resolved, extname(resolved)),
      rules: parsed.rules as Rule[],
      source: resolved,
    });
    return policies;
  }

  let searchDir = resolved;
  if (existsSync(join(resolved, 'veto', 'rules'))) {
    searchDir = join(resolved, 'veto', 'rules');
  } else if (existsSync(join(resolved, 'rules'))) {
    searchDir = join(resolved, 'rules');
  }

  const files = findYamlFiles(searchDir);
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const parsed = parseYaml(content) as Record<string, unknown>;
    if (parsed && Array.isArray(parsed.rules)) {
      policies.push({
        name: (parsed.name as string) || basename(file, extname(file)),
        rules: parsed.rules as Rule[],
        source: file,
      });
    }
  }

  return policies;
}

export async function deploy(options: DeployOptions): Promise<DeployResult> {
  const apiUrl = options.apiUrl || process.env.VETO_API_URL;
  const apiKey = options.apiKey || process.env.VETO_API_KEY;
  const target = options.target || 'default';

  if (!apiKey && !options.dryRun) {
    const result: DeployResult = {
      success: false,
      target,
      policies: [],
      dryRun: false,
      error: 'API key required. Set VETO_API_KEY or use --api-key flag.',
    };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('Error: API key required. Set VETO_API_KEY or use --api-key flag.');
    }
    return result;
  }

  let policies: PolicyPayload[];
  try {
    policies = loadPolicies(options.path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const result: DeployResult = { success: false, target, policies: [], dryRun: options.dryRun || false, error: msg };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`Error: ${msg}`);
    }
    return result;
  }

  if (policies.length === 0) {
    const result: DeployResult = { success: false, target, policies: [], dryRun: options.dryRun || false, error: 'No policy files found' };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('Error: No policy files found');
    }
    return result;
  }

  const policySummary = policies.map(p => ({
    name: p.name,
    ruleCount: p.rules.length,
    source: p.source,
  }));

  if (options.dryRun) {
    const result: DeployResult = { success: true, target, policies: policySummary, dryRun: true };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Dry run: would deploy to target "${target}"`);
      for (const p of policySummary) {
        console.log(`  ${p.name} (${p.ruleCount} rules) from ${p.source}`);
      }
      console.log(`\n${policies.length} policy file(s) ready to deploy`);
    }
    return result;
  }

  const baseUrl = (apiUrl || 'http://localhost:3001').replace(/\/$/, '');

  try {
    for (const policy of policies) {
      const url = `${baseUrl}/v1/policies/deploy`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Veto-API-Key': apiKey!,
        },
        body: JSON.stringify({
          name: policy.name,
          rules: policy.rules,
          target,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Server returned ${response.status}: ${body}`);
      }

      if (options.verbose && !options.json) {
        console.log(`  Deployed ${policy.name} (${policy.rules.length} rules)`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const result: DeployResult = { success: false, target, policies: policySummary, dryRun: false, error: msg };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`Error deploying: ${msg}`);
    }
    return result;
  }

  const result: DeployResult = { success: true, target, policies: policySummary, dryRun: false };
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Deployed ${policies.length} policy file(s) to target "${target}"`);
    for (const p of policySummary) {
      console.log(`  ${p.name} (${p.ruleCount} rules)`);
    }
  }
  return result;
}
