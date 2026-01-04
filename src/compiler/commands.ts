// src/compiler/commands.ts
// Command parsing and matching for command-level policy enforcement

import micromatch from 'micromatch';
import type { CommandRule, CommandCheckResult, Policy } from '../types.js';

const { isMatch } = micromatch;

/**
 * Common command aliases - normalized for matching
 */
const COMMAND_ALIASES: Record<string, string[]> = {
  // npm
  'npm i': ['npm install'],
  'npm ci': ['npm clean-install'],
  'npm r': ['npm remove', 'npm uninstall'],
  'npm rm': ['npm remove', 'npm uninstall'],
  'npm un': ['npm uninstall'],
  'npm ls': ['npm list'],
  // yarn
  'yarn': ['yarn install'],
  // pnpm
  'pnpm i': ['pnpm install'],
  'pnpm rm': ['pnpm remove'],
  // bun
  'bun i': ['bun install'],
  'bun a': ['bun add'],
  'bun rm': ['bun remove'],
  // git
  'git co': ['git checkout'],
  'git ci': ['git commit'],
  'git st': ['git status'],
  'git br': ['git branch'],
};

/**
 * Expand command aliases to their full forms for matching
 */
function expandAliases(command: string): string[] {
  const normalized = command.toLowerCase().trim();
  const expanded = [normalized];
  
  for (const [alias, expansions] of Object.entries(COMMAND_ALIASES)) {
    if (normalized.startsWith(alias)) {
      const suffix = normalized.slice(alias.length);
      for (const expansion of expansions) {
        expanded.push(expansion + suffix);
      }
    }
  }
  
  return expanded;
}

/**
 * Split a complex command string into individual commands.
 * Handles: &&, ||, ;, |, and subshells
 */
export function splitCommands(fullCommand: string): string[] {
  const commands: string[] = [];
  let current = '';
  let depth = 0;
  let inQuote: string | null = null;
  
  for (let i = 0; i < fullCommand.length; i++) {
    const char = fullCommand[i];
    const prev = i > 0 ? fullCommand[i - 1] : '';
    
    // Handle quotes
    if ((char === '"' || char === "'") && prev !== '\\') {
      if (inQuote === char) {
        inQuote = null;
      } else if (!inQuote) {
        inQuote = char;
      }
      current += char;
      continue;
    }
    
    // Handle parentheses/subshells
    if (!inQuote) {
      if (char === '(' || char === '{') {
        depth++;
      } else if (char === ')' || char === '}') {
        depth--;
      }
    }
    
    // Split on command separators (only at depth 0, outside quotes)
    if (depth === 0 && !inQuote) {
      // Check for && || ; |
      if (char === '&' && fullCommand[i + 1] === '&') {
        if (current.trim()) commands.push(current.trim());
        current = '';
        i++; // Skip next &
        continue;
      }
      if (char === '|' && fullCommand[i + 1] === '|') {
        if (current.trim()) commands.push(current.trim());
        current = '';
        i++; // Skip next |
        continue;
      }
      if (char === ';') {
        if (current.trim()) commands.push(current.trim());
        current = '';
        continue;
      }
      // Single pipe - still add the command before pipe
      if (char === '|' && fullCommand[i + 1] !== '|') {
        if (current.trim()) commands.push(current.trim());
        current = '';
        continue;
      }
    }
    
    current += char;
  }
  
  if (current.trim()) {
    commands.push(current.trim());
  }
  
  // Extract commands from subshells: bash -c "command", sh -c 'command'
  const expanded: string[] = [];
  for (const cmd of commands) {
    expanded.push(cmd);
    
    // Check for subshell patterns
    const subshellMatch = cmd.match(/^(?:bash|sh|zsh)\s+(?:-c\s+)?["'](.+)["']$/);
    if (subshellMatch) {
      // Recursively split the subshell command
      expanded.push(...splitCommands(subshellMatch[1]));
    }
  }
  
  return expanded;
}

/**
 * Normalize a command for pattern matching.
 * - Lowercase
 * - Collapse whitespace
 * - Trim
 */
export function normalizeCommand(command: string): string {
  return command
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a command matches a pattern.
 * Patterns use glob-style matching:
 * - "npm install" - exact match or prefix
 * - "npm *" - npm with any subcommand
 * - "npm install *" - npm install with any args
 * - "*lodash*" - any command containing lodash
 */
export function commandMatches(command: string, pattern: string): boolean {
  const normalizedCmd = normalizeCommand(command);
  const normalizedPattern = normalizeCommand(pattern);
  
  // Exact match fast path
  if (normalizedCmd === normalizedPattern) {
    return true;
  }
  
  // Check if pattern has wildcards
  if (!normalizedPattern.includes('*') && !normalizedPattern.includes('?')) {
    // No wildcards - check if command starts with pattern
    // "npm install lodash" should match "npm install"
    return normalizedCmd.startsWith(normalizedPattern + ' ') ||
           normalizedCmd === normalizedPattern;
  }
  
  // Handle patterns like "npm *" or "npm install*"
  // Convert to proper glob that matches from start
  
  // If pattern starts with *, it's a contains match
  if (normalizedPattern.startsWith('*')) {
    return isMatch(normalizedCmd, normalizedPattern, { nocase: true });
  }
  
  // Otherwise, pattern should match from the beginning
  // "npm install*" should match "npm install" and "npm install lodash"
  // but NOT "pnpm install"
  
  // For patterns like "npm *", we need to match "npm " followed by anything
  // For patterns like "npm install*", we need to match "npm install" followed by anything
  
  // Convert "npm *" to match "npm " + anything
  // Convert "npm install*" to match "npm install" + anything (including empty)
  
  // Split pattern into prefix (before first *) and rest
  const firstStarIdx = normalizedPattern.indexOf('*');
  const prefix = normalizedPattern.slice(0, firstStarIdx);
  const suffix = normalizedPattern.slice(firstStarIdx);
  
  // Check if command starts with prefix
  if (!normalizedCmd.startsWith(prefix)) {
    return false;
  }
  
  // For patterns ending with just "*", match the rest
  if (suffix === '*') {
    return true;
  }
  
  // For more complex patterns, use micromatch on the remaining part
  const remainingCmd = normalizedCmd.slice(prefix.length);
  return isMatch(remainingCmd, suffix, { nocase: true });
}

/**
 * Check a command string against all command rules in a policy.
 * Returns the first matching rule, or null if allowed.
 */
export function checkCommand(
  command: string,
  policy: Policy
): CommandCheckResult {
  if (!policy.commandRules || policy.commandRules.length === 0) {
    return { blocked: false };
  }
  
  // Split into individual commands
  const commands = splitCommands(command);
  
  for (const cmd of commands) {
    // Expand aliases
    const variations = expandAliases(cmd);
    
    for (const rule of policy.commandRules) {
      for (const pattern of rule.block) {
        for (const variation of variations) {
          if (commandMatches(variation, pattern)) {
            return {
              blocked: true,
              rule,
              matchedPattern: pattern,
            };
          }
        }
      }
    }
  }
  
  return { blocked: false };
}

/**
 * Check a command against multiple policies.
 * Returns the first blocking result.
 */
export function checkCommandAgainstPolicies(
  command: string,
  policies: Policy[]
): CommandCheckResult & { policy?: Policy } {
  for (const policy of policies) {
    const result = checkCommand(command, policy);
    if (result.blocked) {
      return { ...result, policy };
    }
  }
  return { blocked: false };
}

/**
 * Extract file targets from common shell commands.
 * Used for file-level policy checking on bash commands.
 */
export function extractFileTargets(
  command: string,
  action: 'delete' | 'modify' | 'execute' | 'read'
): string[] {
  const targets: string[] = [];
  const commands = splitCommands(command);
  
  for (const cmd of commands) {
    const normalized = normalizeCommand(cmd);
    const parts = normalized.split(' ').filter(Boolean);
    
    if (parts.length < 2) continue;
    
    const [executable, ...args] = parts;
    
    if (action === 'delete') {
      // rm, git rm
      if (executable === 'rm' || (executable === 'git' && args[0] === 'rm')) {
        const startIdx = executable === 'git' ? 1 : 0;
        for (let i = startIdx; i < args.length; i++) {
          const arg = args[i];
          // Skip flags
          if (!arg.startsWith('-')) {
            targets.push(arg);
          }
        }
      }
    }
    
    if (action === 'modify') {
      // mv, cp (source file)
      if (executable === 'mv' || executable === 'cp') {
        for (const arg of args) {
          if (!arg.startsWith('-')) {
            targets.push(arg);
            break; // Only first non-flag arg is source
          }
        }
      }
      // Direct file writes via redirects are harder to detect
      // The Edit/Write tools handle this directly
    }
    
    if (action === 'execute') {
      // Direct execution
      if (executable === 'node' || executable === 'python' || 
          executable === 'python3' || executable === 'bash' ||
          executable === 'sh' || executable === './' ||
          executable.startsWith('./')) {
        for (const arg of args) {
          if (!arg.startsWith('-')) {
            targets.push(arg);
            break;
          }
        }
      }
    }
    
    if (action === 'read') {
      // cat, head, tail, less, more
      if (['cat', 'head', 'tail', 'less', 'more'].includes(executable)) {
        let skipNext = false;
        for (let i = 0; i < args.length; i++) {
          const arg = args[i];
          if (skipNext) {
            skipNext = false;
            continue;
          }
          // Skip flags and their values
          if (arg.startsWith('-')) {
            // Flags like -n, -c that take a value
            if (['-n', '-c', '--lines', '--bytes'].includes(arg)) {
              skipNext = true;
            }
            continue;
          }
          targets.push(arg);
        }
      }
    }
  }
  
  return targets;
}
