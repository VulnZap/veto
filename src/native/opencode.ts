// src/native/opencode.ts
// OpenCode native permission integration
// Generates permission rules for OpenCode's opencode.json config

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Policy } from '../types.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';

const OPENCODE_GLOBAL_CONFIG = join(
  homedir(),
  '.config',
  'opencode',
  'opencode.json'
);
const OPENCODE_PROJECT_CONFIG = 'opencode.json';
const VETO_LEASH_CONFIG_DIR = join(homedir(), '.config', 'veto-leash');
const POLICIES_FILE = join(VETO_LEASH_CONFIG_DIR, 'policies.json');

interface OpenCodeConfig {
  $schema?: string;
  permission?: {
    edit?: string | Record<string, string>;
    bash?: string | Record<string, string>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface StoredPolicies {
  policies: Array<{
    restriction: string;
    policy: Policy;
  }>;
}

/**
 * Convert a veto-leash policy to OpenCode permission rules
 */
function policyToOpenCodeRules(policy: Policy): Record<string, string> {
  const rules: Record<string, string> = {};

  // === COMMAND RULES (Phase 1) ===
  // Convert commandRules to OpenCode bash permission rules
  if (policy.commandRules && policy.commandRules.length > 0) {
    for (const rule of policy.commandRules) {
      for (const pattern of rule.block) {
        // Convert veto-leash command patterns to OpenCode format
        // "npm install*" -> "npm install*" (same format)
        rules[pattern] = 'deny';
      }
    }
  }

  // === FILE RULES ===
  // Generate bash permission rules based on action and patterns
  if (policy.action === 'delete' && policy.include.length > 0) {
    // Block rm commands for protected files
    for (const pattern of policy.include) {
      // Convert glob to OpenCode wildcard format
      const ocPattern = pattern
        .replace(/\*\*\//g, '*/')  // **/ -> */
        .replace(/\*\*/g, '*');    // ** -> *
      
      rules[`rm ${ocPattern}`] = 'deny';
      rules[`rm -f ${ocPattern}`] = 'deny';
      rules[`rm -rf ${ocPattern}`] = 'deny';
      rules[`rm -r ${ocPattern}`] = 'deny';
      rules[`git rm ${ocPattern}`] = 'deny';
      rules[`git rm -f ${ocPattern}`] = 'deny';
    }
    
    // Allow excluded patterns
    for (const pattern of policy.exclude) {
      const ocPattern = pattern
        .replace(/\*\*\//g, '*/')
        .replace(/\*\*/g, '*');
      
      rules[`rm ${ocPattern}`] = 'allow';
      rules[`rm -f ${ocPattern}`] = 'allow';
      rules[`rm -rf ${ocPattern}`] = 'allow';
    }
  }

  if (policy.action === 'modify' && policy.include.length > 0) {
    // Block modification commands for protected files
    for (const pattern of policy.include) {
      const ocPattern = pattern
        .replace(/\*\*\//g, '*/')
        .replace(/\*\*/g, '*');
      
      rules[`mv ${ocPattern} *`] = 'deny';
      rules[`cp * ${ocPattern}`] = 'deny';
    }
  }

  if (policy.action === 'execute' && policy.include.length > 0) {
    // Block execution for protected patterns
    for (const pattern of policy.include) {
      const ocPattern = pattern
        .replace(/\*\*\//g, '*/')
        .replace(/\*\*/g, '*');
      
      // For migrations, block common migration commands
      if (pattern.includes('migrat')) {
        rules['*migrate*'] = 'deny';
        rules['prisma migrate*'] = 'deny';
        rules['npx prisma migrate*'] = 'deny';
        rules['drizzle-kit *'] = 'deny';
      }
    }
  }

  return rules;
}

/**
 * Install veto-leash permissions into OpenCode config
 */
export async function installOpenCodePermissions(
  target: 'global' | 'project' = 'project'
): Promise<void> {
  console.log(
    `\n${COLORS.info}Installing veto-leash for OpenCode (${target})...${COLORS.reset}\n`
  );

  // Load existing policies
  const storedPolicies = loadStoredPolicies();
  if (storedPolicies.policies.length === 0) {
    console.log(
      `${COLORS.warning}${SYMBOLS.warning} No policies found. Add policies first:${COLORS.reset}`
    );
    console.log(`  ${COLORS.dim}leash add "don't delete test files"${COLORS.reset}\n`);
    return;
  }

  // Determine config file path
  const configPath =
    target === 'global' ? OPENCODE_GLOBAL_CONFIG : OPENCODE_PROJECT_CONFIG;

  // Load existing config
  let config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
  };

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      // Keep default if parse fails
    }
  }

  // Ensure permission object exists
  if (!config.permission) {
    config.permission = {};
  }

  // Convert existing bash permission to object if it's a string
  if (typeof config.permission.bash === 'string') {
    const oldValue = config.permission.bash;
    config.permission.bash = { '*': oldValue };
  } else if (!config.permission.bash) {
    config.permission.bash = {};
  }

  // Generate and merge rules from all policies
  for (const { policy } of storedPolicies.policies) {
    const rules = policyToOpenCodeRules(policy);
    config.permission.bash = {
      ...(config.permission.bash as Record<string, string>),
      ...rules,
    };
  }

  // Write config
  if (target === 'global') {
    mkdirSync(join(homedir(), '.config', 'opencode'), { recursive: true });
  }
  
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(
    `  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Updated: ${configPath}`
  );

  console.log(
    `\n${COLORS.success}${SYMBOLS.success} veto-leash permissions installed for OpenCode${COLORS.reset}\n`
  );
  console.log(`${COLORS.dim}Policies are now enforced via OpenCode's native permission system.${COLORS.reset}`);
  console.log(`${COLORS.dim}OpenCode will deny matching commands automatically.${COLORS.reset}\n`);
}

/**
 * Show what permissions would be generated without installing
 */
export function previewOpenCodePermissions(): void {
  const storedPolicies = loadStoredPolicies();
  
  if (storedPolicies.policies.length === 0) {
    console.log(`\n${COLORS.warning}No policies stored. Add policies first.${COLORS.reset}\n`);
    return;
  }

  console.log(`\n${COLORS.bold}OpenCode Permission Preview${COLORS.reset}`);
  console.log('═'.repeat(30) + '\n');

  const allRules: Record<string, string> = {};
  
  for (const { restriction, policy } of storedPolicies.policies) {
    console.log(`${COLORS.dim}Policy:${COLORS.reset} "${restriction}"`);
    console.log(`${COLORS.dim}Action:${COLORS.reset} ${policy.action}\n`);
    
    const rules = policyToOpenCodeRules(policy);
    Object.assign(allRules, rules);
  }

  console.log(`${COLORS.bold}Generated Rules:${COLORS.reset}`);
  console.log(JSON.stringify({ permission: { bash: allRules } }, null, 2));
  console.log(`\n${COLORS.dim}Run 'leash install oc' to apply.${COLORS.reset}\n`);
}

/**
 * Remove veto-leash permissions from OpenCode config
 */
export async function uninstallOpenCodePermissions(
  target: 'global' | 'project' = 'project'
): Promise<void> {
  const configPath =
    target === 'global' ? OPENCODE_GLOBAL_CONFIG : OPENCODE_PROJECT_CONFIG;

  if (!existsSync(configPath)) {
    console.log(`${COLORS.dim}No config file found at ${configPath}${COLORS.reset}`);
    return;
  }

  try {
    const config: OpenCodeConfig = JSON.parse(
      readFileSync(configPath, 'utf-8')
    );

    // Remove veto-leash rules (those with deny for rm/mv/cp patterns)
    if (config.permission?.bash && typeof config.permission.bash === 'object') {
      const bash = config.permission.bash as Record<string, string>;
      for (const key of Object.keys(bash)) {
        if (
          key.startsWith('rm ') ||
          key.startsWith('git rm ') ||
          key.startsWith('mv ') ||
          key.startsWith('cp ')
        ) {
          delete bash[key];
        }
      }
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(
      `${COLORS.success}${SYMBOLS.success} Removed veto-leash rules from ${configPath}${COLORS.reset}`
    );
  } catch {
    console.log(
      `${COLORS.warning}${SYMBOLS.warning} Could not parse config file${COLORS.reset}`
    );
  }
}

/**
 * Load stored policies from veto-leash config
 */
function loadStoredPolicies(): StoredPolicies {
  try {
    if (existsSync(POLICIES_FILE)) {
      return JSON.parse(readFileSync(POLICIES_FILE, 'utf-8'));
    }
  } catch {
    // Return empty if can't load
  }
  return { policies: [] };
}

/**
 * Save a policy to the stored policies file
 */
export function savePolicy(restriction: string, policy: Policy): void {
  const stored = loadStoredPolicies();
  
  // Check for duplicate
  const existingIndex = stored.policies.findIndex(
    (p) => p.restriction === restriction
  );
  
  if (existingIndex >= 0) {
    stored.policies[existingIndex] = { restriction, policy };
  } else {
    stored.policies.push({ restriction, policy });
  }

  mkdirSync(VETO_LEASH_CONFIG_DIR, { recursive: true });
  writeFileSync(POLICIES_FILE, JSON.stringify(stored, null, 2));
}

/**
 * List all stored policies
 */
export function listPolicies(): void {
  const stored = loadStoredPolicies();
  
  if (stored.policies.length === 0) {
    console.log(`\n${COLORS.dim}No policies stored.${COLORS.reset}\n`);
    return;
  }

  console.log(`\n${COLORS.bold}Stored Policies${COLORS.reset}`);
  console.log('═'.repeat(20) + '\n');

  for (let i = 0; i < stored.policies.length; i++) {
    const { restriction, policy } = stored.policies[i];
    console.log(`${i + 1}. ${COLORS.info}"${restriction}"${COLORS.reset}`);
    console.log(`   ${COLORS.dim}Action:${COLORS.reset} ${policy.action}`);
    console.log(`   ${COLORS.dim}Description:${COLORS.reset} ${policy.description}\n`);
  }
}
