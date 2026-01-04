// src/compiler/index.ts

import type { Policy } from '../types.js';
import { findBuiltin } from './builtins.js';
import { getFromCache, saveToCache } from './cache.js';
import { compileWithLLM } from './llm.js';

/**
 * Detect if the restriction is about command/tool preferences
 * rather than file protection
 */
function isCommandPreference(phrase: string): boolean {
  const commandKeywords = [
    /\b(prefer|use)\s+(pnpm|bun|yarn|npm)\b/,
    /\b(pnpm|bun|yarn)\s+(over|not|instead)/,
    /\bno\s+(sudo|force.?push|hard.?reset)\b/,
    /\b(vitest|jest|pytest)\s+(over|not|instead)/,
    /\buse\s+(vitest|pytest|docker.?compose)\b/,
    /\bno\s+curl\b/,
  ];
  
  return commandKeywords.some(pattern => pattern.test(phrase));
}

export async function compile(restriction: string): Promise<Policy> {
  const normalized = restriction.toLowerCase().trim();

  // Check if this is a command preference (not file-based)
  const isCommand = isCommandPreference(normalized);

  // Extract action from input
  let action: Policy['action'] = isCommand ? 'execute' : 'modify';
  let targetPhrase = normalized;

  const actionPatterns: Array<[RegExp, Policy['action']]> = [
    [/^(don'?t\s+)?(delete|remove|rm)\s+/, 'delete'],
    [/^(don'?t\s+)?(modify|edit|change|update|write|touch)\s+/, 'modify'],
    [/^(don'?t\s+)?(run|execute|running|executing)\s+/, 'execute'],
    [/^(don'?t\s+)?(read|view|access)\s+/, 'read'],
    [/^(protect|preserve|keep|save)\s+/, 'modify'],
    // Tool preferences default to execute
    [/^(prefer|use)\s+/, 'execute'],
    // "no running X" → execute, "no X" (files) → modify
    [/^no\s+(running|executing)\s+/, 'execute'],
    [/^no\s+/, isCommand ? 'execute' : 'modify'],
  ];

  for (const [pattern, act] of actionPatterns) {
    if (pattern.test(normalized)) {
      action = act;
      targetPhrase = normalized.replace(pattern, '').trim();
      break;
    }
  }

  // Strip filler words (but preserve tool names)
  if (!isCommand) {
    targetPhrase = targetPhrase
      .replace(/^(any|all|the)\s+/g, '')
      .replace(/\s+(files?|directories?|folders?)$/g, '')
      .trim();
  }

  // Layer 1: Builtins (instant)
  const builtin = findBuiltin(targetPhrase);
  if (builtin) {
    // Preserve commandRules from builtin
    return { action, ...builtin };
  }

  // Also try the original restriction for builtins
  const builtinOriginal = findBuiltin(normalized);
  if (builtinOriginal) {
    return { action, ...builtinOriginal };
  }

  // Layer 2: Cache (instant)
  const cached = getFromCache(normalized);
  if (cached) {
    return cached;
  }

  // Layer 3: LLM compilation (~100ms)
  const policy = await compileWithLLM(restriction, action);

  // Save to cache for next time
  saveToCache(normalized, policy);

  return policy;
}
