// src/native/cursor.ts
// Cursor CLI integration via hooks.json (v1.7+) and cli-config.json
// 
// Based on official Cursor docs:
// - https://cursor.com/docs/agent/hooks
// - https://cursor.com/docs/cli/reference/permissions
//
// Two integration methods:
// 1. hooks.json - Real-time hook scripts for beforeShellExecution, afterFileEdit
// 2. cli-config.json - Permission tokens like Shell(npm), Write(*.ts)

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Policy } from '../types.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';

const CURSOR_CONFIG_DIR = join(homedir(), '.cursor');
const CURSOR_HOOKS_FILE = join(CURSOR_CONFIG_DIR, 'hooks.json');
const CURSOR_CLI_CONFIG = join(CURSOR_CONFIG_DIR, 'cli-config.json');
const CURSOR_HOOKS_DIR = join(CURSOR_CONFIG_DIR, 'hooks', 'veto-leash');
const VETO_LEASH_CONFIG_DIR = join(homedir(), '.config', 'veto-leash');
const POLICIES_FILE = join(VETO_LEASH_CONFIG_DIR, 'policies.json');

// Also support project-level hooks
const PROJECT_CURSOR_DIR = '.cursor';
const PROJECT_HOOKS_FILE = join(PROJECT_CURSOR_DIR, 'hooks.json');

interface CursorHooksConfig {
  version: 1;
  hooks: {
    beforeShellExecution?: Array<{ command: string }>;
    afterFileEdit?: Array<{ command: string }>;
    [key: string]: Array<{ command: string }> | undefined;
  };
}

interface CursorCliConfig {
  permissions?: {
    allow?: string[];
    deny?: string[];
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
 * Install veto-leash for Cursor CLI
 * Creates hooks.json and validator script
 */
export async function installCursorHooks(
  target: 'global' | 'project' = 'global'
): Promise<void> {
  console.log(
    `\n${COLORS.info}Installing veto-leash for Cursor CLI (${target})...${COLORS.reset}\n`
  );

  // Create hooks directory
  mkdirSync(CURSOR_HOOKS_DIR, { recursive: true });

  // Write the validator script
  const validatorPath = join(CURSOR_HOOKS_DIR, 'validator.sh');
  writeFileSync(validatorPath, VALIDATOR_SCRIPT, { mode: 0o755 });
  console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Created validator: ${validatorPath}`);

  // Write policies to hooks dir for fast access
  const storedPolicies = loadStoredPolicies();
  const policiesPath = join(CURSOR_HOOKS_DIR, 'policies.json');
  writeFileSync(policiesPath, JSON.stringify(storedPolicies.policies.map(p => p.policy), null, 2));
  console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Synced ${storedPolicies.policies.length} policies`);

  // Update hooks.json
  const hooksPath = target === 'global' ? CURSOR_HOOKS_FILE : PROJECT_HOOKS_FILE;
  const hooksDir = target === 'global' ? CURSOR_CONFIG_DIR : PROJECT_CURSOR_DIR;
  
  mkdirSync(hooksDir, { recursive: true });
  
  let config: CursorHooksConfig = { version: 1, hooks: {} };
  if (existsSync(hooksPath)) {
    try {
      config = JSON.parse(readFileSync(hooksPath, 'utf-8'));
    } catch {
      // Start fresh
    }
  }

  // Add veto-leash hooks
  const hookCommand = `"${validatorPath}"`;
  
  // beforeShellExecution - check commands (CAN block via permission: deny)
  if (!config.hooks.beforeShellExecution) {
    config.hooks.beforeShellExecution = [];
  }
  const shellHookIdx = config.hooks.beforeShellExecution.findIndex(
    h => h.command.includes('veto-leash')
  );
  if (shellHookIdx >= 0) {
    config.hooks.beforeShellExecution[shellHookIdx] = { command: hookCommand };
  } else {
    config.hooks.beforeShellExecution.push({ command: hookCommand });
  }

  // NOTE: Cursor's afterFileEdit is OBSERVATION ONLY - cannot block file edits.
  // File protection is handled via cli-config.json Write() permissions instead.
  // See: https://cursor.com/docs/agent/hooks

  writeFileSync(hooksPath, JSON.stringify(config, null, 2));
  console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Updated: ${hooksPath}`);

  // Also update cli-config.json with permission rules
  await updateCliConfig(storedPolicies.policies.map(p => p.policy));

  console.log(`\n${COLORS.success}${SYMBOLS.success} veto-leash installed for Cursor CLI${COLORS.reset}\n`);
  console.log(`${COLORS.dim}Restart Cursor to activate hooks.${COLORS.reset}\n`);
}

/**
 * Update cli-config.json with permission rules
 */
async function updateCliConfig(policies: Policy[]): Promise<void> {
  let config: CursorCliConfig = {};
  
  if (existsSync(CURSOR_CLI_CONFIG)) {
    try {
      config = JSON.parse(readFileSync(CURSOR_CLI_CONFIG, 'utf-8'));
    } catch {
      // Start fresh
    }
  }

  if (!config.permissions) {
    config.permissions = { allow: [], deny: [] };
  }
  if (!config.permissions.deny) {
    config.permissions.deny = [];
  }

  // Remove existing veto-leash rules
  config.permissions.deny = config.permissions.deny.filter(
    r => !r.includes('/* veto-leash */')
  );

  // Add new rules from policies
  for (const policy of policies) {
    // Add command rules
    if (policy.commandRules) {
      for (const rule of policy.commandRules) {
        for (const pattern of rule.block) {
          // Convert command pattern to Cursor Shell() format
          // "npm install*" -> Shell(npm)
          const executable = pattern.split(' ')[0].replace('*', '');
          if (executable) {
            const cursorRule = `Shell(${executable}) /* veto-leash */`;
            if (!config.permissions.deny.includes(cursorRule)) {
              config.permissions.deny.push(cursorRule);
            }
          }
        }
      }
    }

    // Add file rules
    for (const pattern of policy.include) {
      // Convert glob to Cursor Write() format
      const cursorRule = `Write(${pattern}) /* veto-leash */`;
      if (!config.permissions.deny.includes(cursorRule)) {
        config.permissions.deny.push(cursorRule);
      }
    }
  }

  mkdirSync(CURSOR_CONFIG_DIR, { recursive: true });
  writeFileSync(CURSOR_CLI_CONFIG, JSON.stringify(config, null, 2));
  console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Updated: ${CURSOR_CLI_CONFIG}`);
}

/**
 * Uninstall veto-leash from Cursor CLI
 */
export async function uninstallCursorHooks(
  target: 'global' | 'project' = 'global'
): Promise<void> {
  console.log(`\n${COLORS.info}Removing veto-leash from Cursor CLI...${COLORS.reset}\n`);

  // Remove from hooks.json
  const hooksPath = target === 'global' ? CURSOR_HOOKS_FILE : PROJECT_HOOKS_FILE;
  
  if (existsSync(hooksPath)) {
    try {
      const config: CursorHooksConfig = JSON.parse(readFileSync(hooksPath, 'utf-8'));
      
      if (config.hooks.beforeShellExecution) {
        config.hooks.beforeShellExecution = config.hooks.beforeShellExecution.filter(
          h => !h.command.includes('veto-leash')
        );
      }
      // Also clean up any legacy afterFileEdit hooks (no longer used)
      if (config.hooks.afterFileEdit) {
        config.hooks.afterFileEdit = config.hooks.afterFileEdit.filter(
          h => !h.command.includes('veto-leash')
        );
      }
      
      writeFileSync(hooksPath, JSON.stringify(config, null, 2));
      console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Removed hooks from ${hooksPath}`);
    } catch {
      console.log(`  ${COLORS.warning}${SYMBOLS.warning}${COLORS.reset} Could not parse ${hooksPath}`);
    }
  }

  // Remove from cli-config.json
  if (existsSync(CURSOR_CLI_CONFIG)) {
    try {
      const config: CursorCliConfig = JSON.parse(readFileSync(CURSOR_CLI_CONFIG, 'utf-8'));
      
      if (config.permissions?.deny) {
        config.permissions.deny = config.permissions.deny.filter(
          r => !r.includes('/* veto-leash */')
        );
      }
      
      writeFileSync(CURSOR_CLI_CONFIG, JSON.stringify(config, null, 2));
      console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Removed permissions from ${CURSOR_CLI_CONFIG}`);
    } catch {
      // Ignore
    }
  }

  console.log(`\n${COLORS.success}${SYMBOLS.success} veto-leash removed from Cursor CLI${COLORS.reset}\n`);
}

/**
 * Add a policy for Cursor
 */
export async function addCursorPolicy(policy: Policy, name: string): Promise<void> {
  const policiesPath = join(CURSOR_HOOKS_DIR, 'policies.json');
  
  let policies: Policy[] = [];
  if (existsSync(policiesPath)) {
    try {
      policies = JSON.parse(readFileSync(policiesPath, 'utf-8'));
    } catch {
      // Start fresh
    }
  }

  // Check for duplicate by description
  const existingIdx = policies.findIndex(p => p.description === policy.description);
  if (existingIdx >= 0) {
    policies[existingIdx] = policy;
  } else {
    policies.push(policy);
  }

  mkdirSync(CURSOR_HOOKS_DIR, { recursive: true });
  writeFileSync(policiesPath, JSON.stringify(policies, null, 2));
}

function loadStoredPolicies(): StoredPolicies {
  try {
    if (existsSync(POLICIES_FILE)) {
      return JSON.parse(readFileSync(POLICIES_FILE, 'utf-8'));
    }
  } catch {
    // Ignore
  }
  return { policies: [] };
}

/**
 * Bash validator script for Cursor hooks.
 * 
 * Input (stdin): JSON with command, cwd, hook_event_name
 * Output (stdout): JSON with permission, user_message, agent_message
 */
const VALIDATOR_SCRIPT = `#!/bin/bash
# veto-leash validator for Cursor CLI hooks
# Based on: https://cursor.com/docs/agent/hooks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
POLICIES_FILE="$SCRIPT_DIR/policies.json"

# Read JSON input
input=$(cat)

# Parse hook event
hook_event=$(echo "$input" | jq -r '.hook_event_name // empty')

# Check if policies file exists
if [ ! -f "$POLICIES_FILE" ]; then
  echo '{"permission": "allow"}'
  exit 0
fi

# Load policies
policies=$(cat "$POLICIES_FILE")
policy_count=$(echo "$policies" | jq 'length')

if [ "$policy_count" -eq 0 ]; then
  echo '{"permission": "allow"}'
  exit 0
fi

# Helper: Check if command matches pattern
command_matches() {
  local cmd="$1"
  local pattern="$2"
  
  # Lowercase both
  cmd=$(echo "$cmd" | tr '[:upper:]' '[:lower:]')
  pattern=$(echo "$pattern" | tr '[:upper:]' '[:lower:]')
  
  # Exact match
  if [ "$cmd" = "$pattern" ]; then
    return 0
  fi
  
  # Prefix match (pattern without wildcard)
  if [[ ! "$pattern" == *"*"* ]]; then
    if [[ "$cmd" == "$pattern "* ]] || [ "$cmd" = "$pattern" ]; then
      return 0
    fi
  fi
  
  # Wildcard match
  # shellcheck disable=SC2053
  if [[ "$cmd" == $pattern ]]; then
    return 0
  fi
  
  return 1
}

# Handle beforeShellExecution
if [ "$hook_event" = "beforeShellExecution" ]; then
  command=$(echo "$input" | jq -r '.command // empty')
  
  if [ -z "$command" ]; then
    echo '{"permission": "allow"}'
    exit 0
  fi
  
  # Check each policy's commandRules
  for i in $(seq 0 $((policy_count - 1))); do
    policy=$(echo "$policies" | jq ".[$i]")
    rules=$(echo "$policy" | jq -r '.commandRules // []')
    rule_count=$(echo "$rules" | jq 'length')
    
    for j in $(seq 0 $((rule_count - 1))); do
      rule=$(echo "$rules" | jq ".[$j]")
      blocks=$(echo "$rule" | jq -r '.block[]' 2>/dev/null || echo "")
      
      for pattern in $blocks; do
        if command_matches "$command" "$pattern"; then
          reason=$(echo "$rule" | jq -r '.reason // "Blocked by policy"')
          suggest=$(echo "$rule" | jq -r '.suggest // empty')
          
          if [ -n "$suggest" ]; then
            msg="veto-leash: Command blocked. $reason. Try: $suggest"
          else
            msg="veto-leash: Command blocked. $reason"
          fi
          
          echo "{\"permission\": \"deny\", \"user_message\": \"$msg\", \"agent_message\": \"$msg\"}"
          exit 0
        fi
      done
    done
  done
fi

# NOTE: Cursor's afterFileEdit hook is OBSERVATION ONLY and cannot block edits.
# File protection is handled via cli-config.json Write() permissions.
# See: https://cursor.com/docs/agent/hooks

# Allow by default
echo '{"permission": "allow"}'
`;

// ============================================================================
// Legacy .cursorrules support (for older Cursor versions without hooks)
// ============================================================================

const CURSORRULES_FILE = '.cursorrules';

/**
 * Install veto-leash instructions into .cursorrules
 * Note: This only provides AI guidance, not enforcement.
 */
export async function installCursorRules(): Promise<void> {
  console.log(`\n${COLORS.info}Installing veto-leash .cursorrules (legacy mode)...${COLORS.reset}\n`);

  const policies = loadStoredPolicies().policies.map(p => p.policy);
  
  if (policies.length === 0) {
    console.log(`${COLORS.warning}${SYMBOLS.warning} No policies found. Add policies first:${COLORS.reset}`);
    console.log(`  ${COLORS.dim}leash add "don't delete test files"${COLORS.reset}\n`);
    return;
  }

  const rulesContent = generateCursorRules(policies);
  
  if (existsSync(CURSORRULES_FILE)) {
    const existing = readFileSync(CURSORRULES_FILE, 'utf-8');
    if (existing.includes('# veto-leash restrictions')) {
      const updated = existing.replace(
        /# veto-leash restrictions[\s\S]*?# end veto-leash/,
        rulesContent
      );
      writeFileSync(CURSORRULES_FILE, updated);
      console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Updated .cursorrules`);
    } else {
      writeFileSync(CURSORRULES_FILE, existing + '\n\n' + rulesContent);
      console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Appended to .cursorrules`);
    }
  } else {
    writeFileSync(CURSORRULES_FILE, rulesContent);
    console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Created .cursorrules`);
  }

  console.log(`\n${COLORS.warning}${SYMBOLS.warning} Note: .cursorrules is AI guidance only.${COLORS.reset}`);
  console.log(`For actual enforcement with Cursor 1.7+, use:`);
  console.log(`  ${COLORS.dim}leash install cursor${COLORS.reset}\n`);
}

function generateCursorRules(policies: Policy[]): string {
  const lines = ['# veto-leash restrictions'];
  lines.push('# These are mandatory restrictions you MUST follow.');
  lines.push('');
  
  for (const policy of policies) {
    lines.push(`## ${policy.description}`);
    lines.push(`Action: ${policy.action}`);
    lines.push('');
    
    if (policy.include.length > 0) {
      lines.push('DO NOT perform this action on these files:');
      for (const pattern of policy.include) {
        lines.push(`- ${pattern}`);
      }
    }
    
    if (policy.commandRules && policy.commandRules.length > 0) {
      lines.push('');
      lines.push('DO NOT run these commands:');
      for (const rule of policy.commandRules) {
        for (const pattern of rule.block) {
          lines.push(`- ${pattern}`);
        }
        if (rule.suggest) {
          lines.push(`  Instead use: ${rule.suggest}`);
        }
      }
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
  
  lines.push('If blocked, STOP and explain why you cannot proceed.');
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
    unlinkSync(CURSORRULES_FILE);
    console.log(`${COLORS.success}${SYMBOLS.success} Removed .cursorrules${COLORS.reset}`);
  }
}
