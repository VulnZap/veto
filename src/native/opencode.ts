// src/native/opencode.ts
// OpenCode native permission integration
// Generates permission rules for OpenCode's opencode.json config
// Also installs native plugin for seamless tool interception

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type { Policy } from '../types.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENCODE_GLOBAL_CONFIG = join(
  homedir(),
  '.config',
  'opencode',
  'opencode.json'
);
const OPENCODE_PROJECT_CONFIG = 'opencode.json';
const OPENCODE_PLUGIN_DIR = join(homedir(), '.config', 'opencode', 'plugin');
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
 * Install veto-leash as OpenCode plugin + permission rules
 */
export async function installOpenCodePermissions(
  target: 'global' | 'project' = 'project'
): Promise<void> {
  console.log(
    `\n${COLORS.info}Installing veto-leash for OpenCode (${target})...${COLORS.reset}\n`
  );

  // === Step 1: Install native plugin ===
  try {
    mkdirSync(OPENCODE_PLUGIN_DIR, { recursive: true });
    
    // Copy the plugin file
    const pluginSrc = join(dirname(__dirname), 'opencode-plugin', 'veto-leash.ts');
    const pluginDest = join(OPENCODE_PLUGIN_DIR, 'veto-leash.ts');
    
    // Try to copy from source, fall back to generating inline
    if (existsSync(pluginSrc)) {
      copyFileSync(pluginSrc, pluginDest);
    } else {
      // Generate the plugin inline (for npm installs where src isn't available)
      writeFileSync(pluginDest, generatePluginSource());
    }
    console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Installed plugin: ${pluginDest}`);
  } catch (err) {
    console.log(`  ${COLORS.warning}${SYMBOLS.warning}${COLORS.reset} Could not install plugin: ${(err as Error).message}`);
  }

  // === Step 2: Load existing policies ===
  const storedPolicies = loadStoredPolicies();
  if (storedPolicies.policies.length === 0) {
    console.log(`\n${COLORS.success}${SYMBOLS.success} veto-leash plugin installed for OpenCode${COLORS.reset}\n`);
    console.log(`${COLORS.dim}Add policies with:${COLORS.reset}`);
    console.log(`  ${COLORS.dim}leash add "don't delete test files"${COLORS.reset}\n`);
    return;
  }

  // === Step 3: Update permission rules (belt-and-suspenders) ===
  const configPath =
    target === 'global' ? OPENCODE_GLOBAL_CONFIG : OPENCODE_PROJECT_CONFIG;

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
  console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Updated: ${configPath}`);

  console.log(
    `\n${COLORS.success}${SYMBOLS.success} veto-leash installed for OpenCode${COLORS.reset}\n`
  );
  console.log(`${COLORS.dim}Policies enforced via:${COLORS.reset}`);
  console.log(`  ${COLORS.dim}1. Native plugin (tool.execute.before hook)${COLORS.reset}`);
  console.log(`  ${COLORS.dim}2. Permission rules (bash deny patterns)${COLORS.reset}\n`);
  console.log(`${COLORS.dim}Restart OpenCode to activate.${COLORS.reset}\n`);
}

/**
 * Generate plugin source for npm installs where src directory isn't available
 * This is the full plugin with command, file path, and content checking
 */
function generatePluginSource(): string {
  return `/**
 * veto-leash OpenCode Plugin
 * Auto-generated - do not edit directly
 */
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const POLICIES_FILE = join(homedir(), ".config", "veto-leash", "policies.json")

function loadPolicies() {
  try {
    if (existsSync(POLICIES_FILE)) {
      const data = JSON.parse(readFileSync(POLICIES_FILE, "utf-8"))
      return data.policies?.map((p) => p.policy) || []
    }
  } catch {}
  return []
}

function matchGlob(text, pattern) {
  const normalized = text.toLowerCase()
  const pat = pattern.toLowerCase()
  if (pat === "*") return true
  if (!pat.includes("*") && !pat.includes("?")) {
    return normalized === pat || normalized.startsWith(pat + " ")
  }
  const regex = new RegExp("^" + pat.replace(/\\*/g, ".*").replace(/\\?/g, ".") + "$")
  return regex.test(normalized)
}

function checkCommand(command, policies) {
  for (const policy of policies) {
    if (!policy.commandRules) continue
    for (const rule of policy.commandRules) {
      for (const pattern of rule.block) {
        if (matchGlob(command, pattern)) {
          return { blocked: true, reason: rule.reason, suggest: rule.suggest }
        }
      }
    }
  }
  return { blocked: false }
}

function checkFilePath(filePath, policies, action) {
  const normalizedPath = filePath.replace(/\\\\/g, "/")
  const basename = normalizedPath.split("/").pop() || ""
  
  for (const policy of policies) {
    const policyAction = policy.action
    if (action === "edit" && policyAction !== "modify") continue
    if (action === "read" && policyAction !== "read") continue
    
    const matchesInclude = policy.include.some(p => matchGlob(normalizedPath, p) || matchGlob(basename, p))
    if (!matchesInclude) continue
    
    const matchesExclude = policy.exclude.some(p => matchGlob(normalizedPath, p) || matchGlob(basename, p))
    if (matchesExclude) continue
    
    return { blocked: true, reason: policy.description + ": " + filePath }
  }
  return { blocked: false }
}

function checkContent(content, filePath, policies) {
  const basename = filePath.split("/").pop() || ""
  
  for (const policy of policies) {
    if (!policy.contentRules) continue
    
    for (const rule of policy.contentRules) {
      const matchesType = rule.fileTypes.some(ft => {
        if (ft.startsWith("*.")) return basename.endsWith(ft.slice(1))
        return matchGlob(basename, ft)
      })
      if (!matchesType) continue
      
      try {
        const regex = new RegExp(rule.pattern, "gm")
        const match = regex.exec(content)
        if (match) {
          const beforeMatch = content.slice(0, match.index)
          const line = (beforeMatch.match(/\\n/g) || []).length + 1
          return { blocked: true, reason: rule.reason, suggest: rule.suggest, line }
        }
      } catch {}
    }
  }
  return { blocked: false }
}

export const VetoLeash = async ({ client }) => {
  const policies = loadPolicies()
  if (policies.length === 0) return {}
  
  await client.app.log({ service: "veto-leash", level: "info", message: \`Loaded \${policies.length} policies\` })
  
  return {
    "tool.execute.before": async (input, output) => {
      const tool = input.tool
      const args = output.args
      
      // Check Bash commands
      if (tool === "bash" && args.command) {
        const result = checkCommand(String(args.command), policies)
        if (result.blocked) {
          await client.tui.showToast({ message: \`Blocked: \${result.reason}\`, variant: "error" })
          throw new Error(\`veto-leash: \${result.reason}\${result.suggest ? ". Try: " + result.suggest : ""}\`)
        }
      }
      
      // Check file paths
      if ((tool === "edit" || tool === "write" || tool === "read") && args.filePath) {
        const action = tool === "read" ? "read" : "edit"
        const result = checkFilePath(String(args.filePath), policies, action)
        if (result.blocked) {
          await client.tui.showToast({ message: \`Blocked: \${result.reason}\`, variant: "error" })
          throw new Error(\`veto-leash: \${result.reason}\`)
        }
      }
      
      // Check content
      if ((tool === "edit" || tool === "write") && args.filePath) {
        const content = String(args.content || args.newString || "")
        if (content) {
          const result = checkContent(content, String(args.filePath), policies)
          if (result.blocked) {
            const lineInfo = result.line ? \` (line \${result.line})\` : ""
            await client.tui.showToast({ message: \`Blocked\${lineInfo}: \${result.reason}\`, variant: "error" })
            throw new Error(\`veto-leash: \${result.reason}\${lineInfo}\${result.suggest ? ". Try: " + result.suggest : ""}\`)
          }
        }
      }
    },
  }
}

export default VetoLeash
`;
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
  
  console.log(`${COLORS.dim}To remove: leash remove <number> or leash remove "<name>"${COLORS.reset}\n`);
}

/**
 * Remove a policy by index (1-based) or name
 */
export function removePolicy(target: string): boolean {
  const stored = loadStoredPolicies();
  
  if (stored.policies.length === 0) {
    console.log(`${COLORS.error}${SYMBOLS.error} No policies to remove${COLORS.reset}`);
    return false;
  }
  
  let indexToRemove = -1;
  
  // Try as number first (1-based index)
  const num = parseInt(target, 10);
  if (!isNaN(num) && num >= 1 && num <= stored.policies.length) {
    indexToRemove = num - 1;
  } else {
    // Try as name
    indexToRemove = stored.policies.findIndex(
      (p) => p.restriction.toLowerCase() === target.toLowerCase() ||
             slugify(p.restriction) === target.toLowerCase()
    );
  }
  
  if (indexToRemove < 0) {
    console.log(`${COLORS.error}${SYMBOLS.error} Policy not found: ${target}${COLORS.reset}`);
    console.log(`${COLORS.dim}Use 'leash list' to see available policies${COLORS.reset}`);
    return false;
  }
  
  const removed = stored.policies[indexToRemove];
  stored.policies.splice(indexToRemove, 1);
  
  // Save updated list
  writeFileSync(POLICIES_FILE, JSON.stringify(stored, null, 2));
  
  // Also remove from Claude Code hooks if installed
  const policySlug = slugify(removed.restriction);
  const claudePolicyPath = join(homedir(), '.claude', 'hooks', 'veto-leash', 'policies', `${policySlug}.json`);
  if (existsSync(claudePolicyPath)) {
    unlinkSync(claudePolicyPath);
  }
  
  console.log(`${COLORS.success}${SYMBOLS.success} Removed: "${removed.restriction}"${COLORS.reset}`);
  return true;
}

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
