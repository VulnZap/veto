// src/native/index.ts
// Agent registry and unified interface for native integrations

import type { Policy } from '../types.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';

// Import all agent integrations
import {
  installClaudeCodeHook,
  addClaudeCodePolicy,
  uninstallClaudeCodeHook,
} from './claude-code.js';
import {
  installOpenCodePermissions,
  uninstallOpenCodePermissions,
  savePolicy as saveOpenCodePolicy,
} from './opencode.js';
import {
  installWindsurfHooks,
  addWindsurfPolicy,
  uninstallWindsurfHooks,
} from './windsurf.js';
import {
  installCursorRules,
  uninstallCursorRules,
} from './cursor.js';
import {
  installAiderConfig,
  uninstallAiderConfig,
} from './aider.js';

export interface AgentInfo {
  id: string;
  name: string;
  aliases: string[];
  hasNativeHooks: boolean;
  description: string;
}

export const AGENTS: AgentInfo[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    aliases: ['cc', 'claude', 'claude-code'],
    hasNativeHooks: true,
    description: 'PreToolUse hooks for Bash/Write/Edit',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    aliases: ['oc', 'opencode'],
    hasNativeHooks: true,
    description: 'permission.bash rules in opencode.json',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    aliases: ['ws', 'windsurf', 'cascade'],
    hasNativeHooks: true,
    description: 'Cascade hooks for pre_write_code/pre_run_command',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    aliases: ['cursor'],
    hasNativeHooks: false,
    description: '.cursorrules AI guidance (not enforcement)',
  },
  {
    id: 'aider',
    name: 'Aider',
    aliases: ['aider'],
    hasNativeHooks: false,
    description: '.aider.conf.yml read-only files',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    aliases: ['codex', 'codex-cli'],
    hasNativeHooks: false,
    description: 'OS sandbox - use watchdog mode',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    aliases: ['copilot', 'gh-copilot'],
    hasNativeHooks: false,
    description: 'No hook system - use wrapper mode',
  },
];

/**
 * Resolve agent alias to agent ID
 */
export function resolveAgent(input: string): AgentInfo | null {
  const normalized = input?.toLowerCase().trim();
  if (!normalized) return null;

  for (const agent of AGENTS) {
    if (agent.aliases.includes(normalized)) {
      return agent;
    }
  }
  return null;
}

/**
 * Install native integration for an agent
 */
export async function installAgent(
  agentId: string,
  options: { global?: boolean } = {}
): Promise<boolean> {
  const agent = resolveAgent(agentId);
  
  if (!agent) {
    console.error(`${COLORS.error}${SYMBOLS.error} Unknown agent: ${agentId}${COLORS.reset}`);
    printSupportedAgents();
    return false;
  }

  switch (agent.id) {
    case 'claude-code':
      await installClaudeCodeHook();
      return true;
      
    case 'opencode':
      await installOpenCodePermissions(options.global ? 'global' : 'project');
      return true;
      
    case 'windsurf':
      await installWindsurfHooks(options.global ? 'user' : 'workspace');
      return true;
      
    case 'cursor':
      await installCursorRules();
      return true;
      
    case 'aider':
      await installAiderConfig(options.global ? 'global' : 'project');
      return true;
      
    case 'codex':
      console.log(`\n${COLORS.warning}${SYMBOLS.warning} Codex CLI uses OS-level sandboxing.${COLORS.reset}`);
      console.log(`Use watchdog mode for file protection:`);
      console.log(`  ${COLORS.dim}leash watch "protect test files"${COLORS.reset}\n`);
      return false;
      
    case 'copilot':
      console.log(`\n${COLORS.warning}${SYMBOLS.warning} GitHub Copilot has no hook system.${COLORS.reset}`);
      console.log(`Use wrapper mode or watchdog:`);
      console.log(`  ${COLORS.dim}leash watch "protect .env"${COLORS.reset}\n`);
      return false;
      
    default:
      console.error(`${COLORS.error}${SYMBOLS.error} No native integration for ${agent.name}${COLORS.reset}`);
      return false;
  }
}

/**
 * Uninstall native integration for an agent
 */
export async function uninstallAgent(
  agentId: string,
  options: { global?: boolean } = {}
): Promise<boolean> {
  const agent = resolveAgent(agentId);
  
  if (!agent) {
    console.error(`${COLORS.error}${SYMBOLS.error} Unknown agent: ${agentId}${COLORS.reset}`);
    return false;
  }

  switch (agent.id) {
    case 'claude-code':
      await uninstallClaudeCodeHook();
      return true;
      
    case 'opencode':
      await uninstallOpenCodePermissions(options.global ? 'global' : 'project');
      return true;
      
    case 'windsurf':
      await uninstallWindsurfHooks(options.global ? 'user' : 'workspace');
      return true;
      
    case 'cursor':
      await uninstallCursorRules();
      return true;
      
    case 'aider':
      await uninstallAiderConfig(options.global ? 'global' : 'project');
      return true;
      
    default:
      console.log(`${COLORS.dim}No native integration to remove for ${agent.name}${COLORS.reset}`);
      return false;
  }
}

/**
 * Add a policy to all installed native integrations
 */
export async function addPolicyToAgents(
  policy: Policy,
  name: string
): Promise<void> {
  // Always save to veto-leash config
  saveOpenCodePolicy(name, policy);

  // Claude Code
  await addClaudeCodePolicy(policy, name);

  // Windsurf
  await addWindsurfPolicy(policy, name);
}

function printSupportedAgents(): void {
  console.log(`\nSupported agents:`);
  for (const agent of AGENTS) {
    const hookStatus = agent.hasNativeHooks ? COLORS.success + 'native' : COLORS.dim + 'wrapper';
    console.log(`  ${COLORS.dim}${agent.aliases[0].padEnd(12)}${COLORS.reset} ${agent.name} (${hookStatus}${COLORS.reset})`);
  }
  console.log('');
}

// Re-export individual modules
export * from './claude-code.js';
export * from './opencode.js';
export * from './windsurf.js';
export * from './cursor.js';
export * from './aider.js';
