// src/native/aider.ts
// Aider integration via .aider.conf.yml
// Aider supports read-only files via the 'read' config option

import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Policy } from '../types.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';
import { glob } from 'glob';

const AIDER_CONFIG_FILE = '.aider.conf.yml';
const AIDER_GLOBAL_CONFIG = join(homedir(), '.aider.conf.yml');

/**
 * Install veto-leash restrictions into Aider config
 * Uses the 'read' option to mark files as read-only
 */
export async function installAiderConfig(
  target: 'project' | 'global' = 'project'
): Promise<void> {
  console.log(`\n${COLORS.info}Installing veto-leash for Aider (${target})...${COLORS.reset}\n`);

  const policies = loadStoredPolicies();
  
  if (policies.length === 0) {
    console.log(`${COLORS.warning}${SYMBOLS.warning} No policies found. Add policies first:${COLORS.reset}`);
    console.log(`  ${COLORS.dim}leash add "protect .env"${COLORS.reset}\n`);
    return;
  }

  const configPath = target === 'global' ? AIDER_GLOBAL_CONFIG : AIDER_CONFIG_FILE;
  
  // Collect protected files based on policies
  const protectedFiles = await collectProtectedFiles(policies);
  
  if (protectedFiles.length === 0) {
    console.log(`${COLORS.warning}${SYMBOLS.warning} No matching files found in current directory${COLORS.reset}`);
    return;
  }

  // Generate YAML config
  const yamlContent = generateAiderYaml(protectedFiles, configPath);
  writeFileSync(configPath, yamlContent);
  
  console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Updated: ${configPath}`);
  console.log(`  ${COLORS.dim}Protected ${protectedFiles.length} files as read-only${COLORS.reset}`);

  console.log(`\n${COLORS.warning}${SYMBOLS.warning} Note: Aider 'read' makes files read-only, preventing modifications.${COLORS.reset}`);
  console.log(`For delete protection, use wrapper mode:`);
  console.log(`  ${COLORS.dim}leash aider "<restriction>"${COLORS.reset}\n`);
}

async function collectProtectedFiles(policies: Policy[]): Promise<string[]> {
  const files: string[] = [];
  
  for (const policy of policies) {
    // Only protect modify actions (read-only)
    if (policy.action !== 'modify' && policy.action !== 'delete') continue;
    
    for (const pattern of policy.include) {
      const matches = await glob(pattern, {
        dot: true,
        nodir: true,
        ignore: ['node_modules/**', '.git/**'],
      });
      files.push(...matches);
    }
  }
  
  // Dedupe
  return [...new Set(files)];
}

function generateAiderYaml(protectedFiles: string[], existingPath: string): string {
  let existing = '';
  let existingLines: string[] = [];
  
  if (existsSync(existingPath)) {
    existing = readFileSync(existingPath, 'utf-8');
    existingLines = existing.split('\n');
    
    // Remove existing veto-leash section
    const startIdx = existingLines.findIndex(l => l.includes('# veto-leash'));
    const endIdx = existingLines.findIndex((l, i) => i > startIdx && l.includes('# end veto-leash'));
    
    if (startIdx !== -1 && endIdx !== -1) {
      existingLines.splice(startIdx, endIdx - startIdx + 1);
    }
  }

  // Add veto-leash section
  const vetoSection = [
    '# veto-leash protected files (read-only)',
    'read:',
    ...protectedFiles.map(f => `  - ${f}`),
    '# end veto-leash',
  ];

  return [...existingLines.filter(l => l.trim()), '', ...vetoSection].join('\n');
}

/**
 * Uninstall veto-leash from Aider config
 */
export async function uninstallAiderConfig(
  target: 'project' | 'global' = 'project'
): Promise<void> {
  const configPath = target === 'global' ? AIDER_GLOBAL_CONFIG : AIDER_CONFIG_FILE;

  if (!existsSync(configPath)) {
    console.log(`${COLORS.dim}No Aider config found at ${configPath}${COLORS.reset}`);
    return;
  }

  const content = readFileSync(configPath, 'utf-8');
  const lines = content.split('\n');
  
  const startIdx = lines.findIndex(l => l.includes('# veto-leash'));
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('# end veto-leash'));
  
  if (startIdx !== -1 && endIdx !== -1) {
    lines.splice(startIdx, endIdx - startIdx + 1);
    const updated = lines.filter(l => l.trim()).join('\n');
    
    if (updated.trim()) {
      writeFileSync(configPath, updated);
    } else {
      require('fs').unlinkSync(configPath);
    }
    
    console.log(`${COLORS.success}${SYMBOLS.success} Removed veto-leash from ${configPath}${COLORS.reset}`);
  } else {
    console.log(`${COLORS.dim}No veto-leash config found in ${configPath}${COLORS.reset}`);
  }
}

function loadStoredPolicies(): Policy[] {
  const policiesFile = join(homedir(), '.config', 'veto-leash', 'policies.json');
  
  try {
    if (existsSync(policiesFile)) {
      const data = JSON.parse(readFileSync(policiesFile, 'utf-8'));
      return data.policies?.map((p: { policy: Policy }) => p.policy) || [];
    }
  } catch {
    // Ignore
  }
  return [];
}
