// src/native/cursor.ts
// Cursor integration via .cursorrules
// Cursor doesn't have a hook/permission system - only AI instruction rules
// We generate .cursorrules that instruct the AI to respect restrictions

import { existsSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import type { Policy } from '../types.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';

const CURSORRULES_FILE = '.cursorrules';

/**
 * Install veto-leash instructions into .cursorrules
 * Note: This only provides AI guidance, not enforcement.
 * For actual enforcement, use wrapper mode: leash cursor "..."
 */
export async function installCursorRules(): Promise<void> {
  console.log(`\n${COLORS.info}Installing veto-leash for Cursor...${COLORS.reset}\n`);

  const policies = loadStoredPolicies();
  
  if (policies.length === 0) {
    console.log(`${COLORS.warning}${SYMBOLS.warning} No policies found. Add policies first:${COLORS.reset}`);
    console.log(`  ${COLORS.dim}leash add "don't delete test files"${COLORS.reset}\n`);
    return;
  }

  const rulesContent = generateCursorRules(policies);
  
  // Append or create .cursorrules
  if (existsSync(CURSORRULES_FILE)) {
    const existing = readFileSync(CURSORRULES_FILE, 'utf-8');
    if (existing.includes('# veto-leash restrictions')) {
      // Update existing section
      const updated = existing.replace(
        /# veto-leash restrictions[\s\S]*?# end veto-leash/,
        rulesContent
      );
      writeFileSync(CURSORRULES_FILE, updated);
      console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Updated .cursorrules`);
    } else {
      // Append
      appendFileSync(CURSORRULES_FILE, '\n\n' + rulesContent);
      console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Appended to .cursorrules`);
    }
  } else {
    writeFileSync(CURSORRULES_FILE, rulesContent);
    console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Created .cursorrules`);
  }

  console.log(`\n${COLORS.warning}${SYMBOLS.warning} Note: Cursor rules are AI guidance only, not enforcement.${COLORS.reset}`);
  console.log(`For actual enforcement, use wrapper mode:`);
  console.log(`  ${COLORS.dim}leash cursor "<restriction>"${COLORS.reset}\n`);
}

function generateCursorRules(policies: Policy[]): string {
  const lines = ['# veto-leash restrictions'];
  lines.push('# These are mandatory restrictions you MUST follow.');
  lines.push('');
  
  for (const policy of policies) {
    lines.push(`## ${policy.description}`);
    lines.push(`Action: ${policy.action}`);
    lines.push('');
    lines.push('DO NOT perform the following action on these files:');
    lines.push('');
    
    for (const pattern of policy.include) {
      lines.push(`- ${pattern}`);
    }
    
    if (policy.exclude.length > 0) {
      lines.push('');
      lines.push('EXCEPT these files are allowed:');
      for (const pattern of policy.exclude) {
        lines.push(`- ${pattern}`);
      }
    }
    lines.push('');
  }
  
  lines.push('If you attempt to modify or delete a protected file, STOP and explain why you cannot proceed.');
  lines.push('# end veto-leash');
  
  return lines.join('\n');
}

/**
 * Uninstall veto-leash from .cursorrules
 */
export async function uninstallCursorRules(): Promise<void> {
  if (!existsSync(CURSORRULES_FILE)) {
    console.log(`${COLORS.dim}No .cursorrules file found${COLORS.reset}`);
    return;
  }

  const content = readFileSync(CURSORRULES_FILE, 'utf-8');
  const updated = content.replace(
    /\n*# veto-leash restrictions[\s\S]*?# end veto-leash\n*/,
    ''
  );

  if (updated.trim()) {
    writeFileSync(CURSORRULES_FILE, updated);
    console.log(`${COLORS.success}${SYMBOLS.success} Removed veto-leash from .cursorrules${COLORS.reset}`);
  } else {
    // File would be empty, delete it
    require('fs').unlinkSync(CURSORRULES_FILE);
    console.log(`${COLORS.success}${SYMBOLS.success} Removed .cursorrules${COLORS.reset}`);
  }
}

function loadStoredPolicies(): Policy[] {
  const policiesFile = join(
    require('os').homedir(),
    '.config',
    'veto-leash',
    'policies.json'
  );
  
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
