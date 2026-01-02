// src/native/windsurf.ts
// Windsurf native hook integration (Cascade Hooks)
// Very similar to Claude Code - supports pre_write_code, pre_run_command hooks

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Policy } from '../types.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';

const WINDSURF_USER_CONFIG = join(homedir(), '.codeium', 'windsurf', 'hooks.json');
const WINDSURF_WORKSPACE_CONFIG = '.windsurf/hooks.json';
const VETO_SCRIPTS_DIR = join(homedir(), '.codeium', 'windsurf', 'veto-leash');

interface WindsurfHooksConfig {
  hooks?: {
    pre_write_code?: Array<{ command: string; show_output?: boolean }>;
    pre_run_command?: Array<{ command: string; show_output?: boolean }>;
    pre_read_code?: Array<{ command: string; show_output?: boolean }>;
    [key: string]: unknown;
  };
}

/**
 * Install veto-leash as Windsurf Cascade hooks
 */
export async function installWindsurfHooks(
  target: 'user' | 'workspace' = 'user'
): Promise<void> {
  console.log(`\n${COLORS.info}Installing veto-leash for Windsurf (${target})...${COLORS.reset}\n`);

  // Create scripts directory and validator
  mkdirSync(VETO_SCRIPTS_DIR, { recursive: true });
  mkdirSync(join(VETO_SCRIPTS_DIR, 'policies'), { recursive: true });

  const validatorPath = join(VETO_SCRIPTS_DIR, 'validator.py');
  writeFileSync(validatorPath, VALIDATOR_SCRIPT, { mode: 0o755 });
  console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Created validator: ${validatorPath}`);

  // Determine config path
  const configPath = target === 'user' ? WINDSURF_USER_CONFIG : WINDSURF_WORKSPACE_CONFIG;
  const configDir = target === 'user' 
    ? join(homedir(), '.codeium', 'windsurf')
    : '.windsurf';

  // Load existing config
  let config: WindsurfHooksConfig = { hooks: {} };
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      // Start fresh
    }
  }

  if (!config.hooks) config.hooks = {};

  // Add veto-leash hooks
  const hookCommand = `python3 "${validatorPath}"`;

  // Helper to add hook if not exists
  const addHook = (hookName: string) => {
    if (!config.hooks![hookName]) {
      config.hooks![hookName] = [];
    }
    const hooks = config.hooks![hookName] as Array<{ command: string; show_output?: boolean }>;
    const exists = hooks.some(h => h.command.includes('veto-leash'));
    if (!exists) {
      hooks.unshift({ command: hookCommand, show_output: true });
    }
  };

  addHook('pre_write_code');
  addHook('pre_run_command');

  // Write config
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Updated: ${configPath}`);

  console.log(`\n${COLORS.success}${SYMBOLS.success} veto-leash installed for Windsurf${COLORS.reset}\n`);
  console.log(`Add policies with: ${COLORS.dim}leash add "don't delete test files"${COLORS.reset}\n`);
}

/**
 * Add a policy for Windsurf
 */
export async function addWindsurfPolicy(policy: Policy, name: string): Promise<void> {
  const policiesDir = join(VETO_SCRIPTS_DIR, 'policies');
  mkdirSync(policiesDir, { recursive: true });

  const policyFile = join(policiesDir, `${name}.json`);
  writeFileSync(policyFile, JSON.stringify(policy, null, 2));
  console.log(`${COLORS.success}${SYMBOLS.success}${COLORS.reset} Windsurf policy saved: ${policyFile}`);
}

/**
 * Uninstall veto-leash from Windsurf
 */
export async function uninstallWindsurfHooks(
  target: 'user' | 'workspace' = 'user'
): Promise<void> {
  const configPath = target === 'user' ? WINDSURF_USER_CONFIG : WINDSURF_WORKSPACE_CONFIG;

  if (!existsSync(configPath)) {
    console.log(`${COLORS.dim}No Windsurf config found at ${configPath}${COLORS.reset}`);
    return;
  }

  try {
    const config: WindsurfHooksConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

    if (config.hooks) {
      for (const hookName of Object.keys(config.hooks)) {
        const hooks = config.hooks[hookName];
        if (Array.isArray(hooks)) {
          config.hooks[hookName] = hooks.filter(
            (h: { command: string }) => !h.command.includes('veto-leash')
          );
        }
      }
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`${COLORS.success}${SYMBOLS.success} Removed veto-leash from Windsurf${COLORS.reset}`);
  } catch {
    console.log(`${COLORS.warning}${SYMBOLS.warning} Could not parse Windsurf config${COLORS.reset}`);
  }
}

/**
 * Python validator script for Windsurf Cascade hooks.
 * Handles pre_write_code and pre_run_command events.
 */
const VALIDATOR_SCRIPT = `#!/usr/bin/env python3
"""
veto-leash validator for Windsurf Cascade hooks.
Exit code 2 blocks the action.
"""

import json
import sys
import os
import re
from pathlib import Path
from fnmatch import fnmatch

POLICIES_DIR = Path(__file__).parent / "policies"

def load_policies():
    policies = []
    if POLICIES_DIR.exists():
        for f in POLICIES_DIR.glob("*.json"):
            try:
                policies.append(json.loads(f.read_text()))
            except:
                pass
    return policies

def normalize_path(p):
    return str(p).replace("\\\\", "/")

def matches_pattern(target, pattern):
    target = normalize_path(target)
    pattern = normalize_path(pattern)
    basename = os.path.basename(target)
    return fnmatch(target, pattern) or fnmatch(basename, pattern)

def is_protected(target, policy):
    matches_include = any(matches_pattern(target, p) for p in policy.get("include", []))
    if not matches_include:
        return False
    matches_exclude = any(matches_pattern(target, p) for p in policy.get("exclude", []))
    return not matches_exclude

def parse_command_targets(command, action):
    targets = []
    if action == "delete":
        rm_match = re.search(r'\\brm\\s+(?:-[rfiv]+\\s+)*(.+)', command)
        if rm_match:
            for arg in rm_match.group(1).split():
                if not arg.startswith('-'):
                    targets.append(arg)
        git_rm = re.search(r'\\bgit\\s+rm\\s+(?:-[rf]+\\s+)*(.+)', command)
        if git_rm:
            for arg in git_rm.group(1).split():
                if not arg.startswith('-'):
                    targets.append(arg)
    return targets

def main():
    try:
        input_data = json.load(sys.stdin)
    except:
        sys.exit(0)

    action_name = input_data.get("agent_action_name", "")
    tool_info = input_data.get("tool_info", {})
    policies = load_policies()

    if not policies:
        sys.exit(0)

    targets = []

    if action_name == "pre_write_code":
        file_path = tool_info.get("file_path", "")
        if file_path:
            targets.append(file_path)

    elif action_name == "pre_run_command":
        command = tool_info.get("command_line", "")
        for policy in policies:
            action = policy.get("action", "modify")
            targets.extend(parse_command_targets(command, action))

    for target in targets:
        for policy in policies:
            if is_protected(target, policy):
                desc = policy.get("description", "Protected file")
                print(f"veto-leash: BLOCKED", file=sys.stderr)
                print(f"  Target: {target}", file=sys.stderr)
                print(f"  Policy: {desc}", file=sys.stderr)
                print(f"  Filesystem unchanged.", file=sys.stderr)
                sys.exit(2)

    sys.exit(0)

if __name__ == "__main__":
    main()
`;
