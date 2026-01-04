// src/matcher.ts

import micromatch from 'micromatch';
import type { Policy, CommandCheckResult } from './types.js';
import { checkCommand, extractFileTargets } from './compiler/commands.js';

const { isMatch } = micromatch;

// Re-export command functions for convenience
export { checkCommand, extractFileTargets } from './compiler/commands.js';

const MATCH_OPTIONS = {
  basename: true, // *.test.ts matches src/foo.test.ts
  dot: true, // Match dotfiles
  nocase: true, // Case insensitive (important for Windows)
};

/**
 * Normalize a path for cross-platform pattern matching.
 * - Converts backslashes to forward slashes (Windows paths)
 * - Removes trailing slashes
 * - Normalizes . and .. segments
 */
export function normalizePath(p: string): string {
  // Convert Windows backslashes to forward slashes
  let normalized = p.replace(/\\/g, '/');
  
  // Remove trailing slash
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  
  // Simple normalization of . and ..
  const parts = normalized.split('/');
  const result: string[] = [];
  
  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }
  
  // Preserve leading slash for absolute paths
  if (normalized.startsWith('/')) {
    return '/' + result.join('/');
  }
  
  return result.join('/') || '.';
}

/**
 * Check if a target path is protected by the policy.
 * Returns true if the target matches include patterns and doesn't match exclude patterns.
 */
export function isProtected(target: string, policy: Policy): boolean {
  // Normalize the target path for cross-platform matching
  const normalizedTarget = normalizePath(target);
  
  const matchesInclude = policy.include.some((p) =>
    isMatch(normalizedTarget, p, MATCH_OPTIONS)
  );

  if (!matchesInclude) return false;

  const matchesExclude = policy.exclude.some((p) =>
    isMatch(normalizedTarget, p, MATCH_OPTIONS)
  );

  return !matchesExclude;
}

/**
 * Get all files in a list that would be protected by the policy.
 */
export function getProtectedFiles(files: string[], policy: Policy): string[] {
  return files.filter((f) => isProtected(f, policy));
}

/**
 * Get all files in a list that would be excluded (allowed) by the policy.
 */
export function getExcludedFiles(files: string[], policy: Policy): string[] {
  return files.filter((f) => {
    const matchesInclude = policy.include.some((p) =>
      isMatch(f, p, MATCH_OPTIONS)
    );
    if (!matchesInclude) return false;

    return policy.exclude.some((p) => isMatch(f, p, MATCH_OPTIONS));
  });
}

/**
 * Full policy check for a bash command.
 * Checks both file targets (for delete/modify actions) and command rules.
 */
export function checkBashCommand(
  command: string,
  policy: Policy
): { allowed: boolean; reason?: string; suggest?: string } {
  // First check command rules (fast path)
  const cmdResult = checkCommand(command, policy);
  if (cmdResult.blocked && cmdResult.rule) {
    return {
      allowed: false,
      reason: cmdResult.rule.reason,
      suggest: cmdResult.rule.suggest,
    };
  }

  // Then check file targets for file-based policies
  if (policy.include.length > 0) {
    const targets = extractFileTargets(command, policy.action);
    for (const target of targets) {
      if (isProtected(target, policy)) {
        return {
          allowed: false,
          reason: policy.description,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Check if a policy has any command rules.
 */
export function hasCommandRules(policy: Policy): boolean {
  return Array.isArray(policy.commandRules) && policy.commandRules.length > 0;
}

/**
 * Check if a policy is command-only (no file patterns).
 */
export function isCommandOnlyPolicy(policy: Policy): boolean {
  return policy.include.length === 0 && hasCommandRules(policy);
}
