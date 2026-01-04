#!/usr/bin/env node
/**
 * veto-leash validator for Claude Code PreToolUse hooks.
 * 
 * Input (via stdin): JSON with tool_name, tool_input, cwd, session_id
 * Output (via stdout): JSON with hookSpecificOutput.permissionDecision and systemMessage
 * Exit code: 0 always (decision communicated via JSON)
 * 
 * Supports:
 * - Command-level policies (commandRules with block patterns)
 * - Content-level policies (AST-based with zero false positives)
 * - File-level policies (include/exclude patterns)
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname, basename, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import type { Policy } from '../types.js';
import { checkContentAST } from '../ast/checker.js';
import { initParser, loadLanguage, detectLanguage } from '../ast/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Common command aliases for matching
const COMMAND_ALIASES: Record<string, string[]> = {
  'npm i': ['npm install'],
  'npm ci': ['npm clean-install'],
  'npm r': ['npm remove', 'npm uninstall'],
  'npm rm': ['npm remove', 'npm uninstall'],
  'pnpm i': ['pnpm install'],
  'bun i': ['bun install'],
  'bun a': ['bun add'],
  'git co': ['git checkout'],
};

interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
  session_id?: string;
}

interface HookOutput {
  hookSpecificOutput: {
    permissionDecision: 'allow' | 'deny';
  };
  systemMessage?: string;
}

function outputAllow(): void {
  const output: HookOutput = {
    hookSpecificOutput: { permissionDecision: 'allow' },
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

function outputDeny(reason: string, opts?: { suggest?: string; line?: number; match?: string }): void {
  let message = `veto-leash: BLOCKED\n\nReason: ${reason}`;
  if (opts?.line) message += `\nLine: ${opts.line}`;
  if (opts?.match) message += `\nMatch: ${opts.match}`;
  if (opts?.suggest) message += `\n\nSuggested alternative: ${opts.suggest}`;
  message += '\n\nThe action was blocked by a veto-leash policy. Please follow the suggested alternative or modify your approach.';

  const output: HookOutput = {
    hookSpecificOutput: { permissionDecision: 'deny' },
    systemMessage: message,
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

function loadPolicies(policiesDir: string): Policy[] {
  if (!existsSync(policiesDir)) return [];
  
  const policies: Policy[] = [];
  for (const file of readdirSync(policiesDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = readFileSync(join(policiesDir, file), 'utf-8');
      policies.push(JSON.parse(content) as Policy);
    } catch {
      // Skip invalid files
    }
  }
  return policies;
}

function normalizeCommand(cmd: string): string {
  return cmd.toLowerCase().split(/\s+/).join(' ');
}

function expandCommandAliases(command: string): string[] {
  const normalized = normalizeCommand(command);
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

function matchesGlob(text: string, pattern: string): boolean {
  // Simple glob matching: * matches any characters
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  );
  return regex.test(text);
}

function commandMatchesPattern(command: string, pattern: string): boolean {
  const cmd = normalizeCommand(command);
  const pat = normalizeCommand(pattern);

  // Exact match
  if (cmd === pat) return true;

  // No wildcards - prefix match
  if (!pat.includes('*') && !pat.includes('?')) {
    return cmd.startsWith(pat + ' ') || cmd === pat;
  }

  // Wildcards - glob match
  if (!pat.startsWith('*')) {
    const firstStar = pat.indexOf('*');
    const prefix = pat.slice(0, firstStar);
    if (!cmd.startsWith(prefix)) return false;
  }

  return matchesGlob(cmd, pat);
}

function checkCommandRules(command: string, policy: Policy): { reason: string; suggest?: string } | null {
  if (!policy.commandRules?.length) return null;

  const variations = expandCommandAliases(command);

  for (const rule of policy.commandRules) {
    for (const pattern of rule.block) {
      for (const variation of variations) {
        if (commandMatchesPattern(variation, pattern)) {
          return { reason: rule.reason, suggest: rule.suggest };
        }
      }
    }
  }

  return null;
}

function fileMatchesPatterns(filePath: string, patterns: string[]): boolean {
  if (!patterns.length) return true;

  const normalized = filePath.replace(/\\/g, '/');
  const name = basename(normalized);

  for (const pattern of patterns) {
    // Simple extension match: "*.ts"
    if (pattern.startsWith('*.') && !pattern.includes('/')) {
      if (name.endsWith(pattern.slice(1))) return true;
      continue;
    }

    // Full glob match
    if (matchesGlob(normalized, pattern) || matchesGlob(name, pattern)) return true;
  }

  return false;
}

function isProtected(target: string, policy: Policy): boolean {
  if (!policy.include.length) return false;

  const normalized = target.replace(/\\/g, '/');
  const name = basename(normalized);

  const matchesInclude = policy.include.some(
    (p) => matchesGlob(normalized, p) || matchesGlob(name, p)
  );
  if (!matchesInclude) return false;

  const matchesExclude = policy.exclude.some(
    (p) => matchesGlob(normalized, p) || matchesGlob(name, p)
  );
  return !matchesExclude;
}

function parseBashTargets(command: string, action: string): string[] {
  const targets: string[] = [];

  if (action === 'delete') {
    const rmMatch = command.match(/\brm\s+(?:-[rfiv]+\s+)*(.+)/);
    if (rmMatch) {
      for (const arg of rmMatch[1].split(/\s+/)) {
        if (!arg.startsWith('-')) targets.push(arg);
      }
    }

    const gitRmMatch = command.match(/\bgit\s+rm\s+(?:-[rf]+\s+)*(.+)/);
    if (gitRmMatch) {
      for (const arg of gitRmMatch[1].split(/\s+/)) {
        if (!arg.startsWith('-')) targets.push(arg);
      }
    }
  } else if (action === 'modify') {
    const mvMatch = command.match(/\b(mv|cp)\s+(?:-[a-z]+\s+)*(.+)/);
    if (mvMatch) {
      for (const arg of mvMatch[2].split(/\s+/)) {
        if (!arg.startsWith('-')) {
          targets.push(arg);
          break;
        }
      }
    }
  }

  return targets;
}

function getActionsForTool(toolName: string): string[] {
  const mapping: Record<string, string[]> = {
    Bash: ['delete', 'modify', 'execute'],
    Write: ['modify'],
    Edit: ['modify'],
    MultiEdit: ['modify'],
    Read: ['read'],
  };
  return mapping[toolName] || [];
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  try {
    const inputText = await readStdin();
    if (!inputText.trim()) {
      outputAllow();
      return;
    }

    let input: HookInput;
    try {
      input = JSON.parse(inputText) as HookInput;
    } catch {
      outputAllow();
      return;
    }

    const { tool_name: toolName, tool_input: toolInput, cwd } = input;

    // Determine policies directory (sibling to this script when installed)
    const policiesDir = join(__dirname, 'policies');
    const policies = loadPolicies(policiesDir);

    if (!policies.length) {
      outputAllow();
      return;
    }

    // === COMMAND-LEVEL CHECKING (for Bash tool) ===
    if (toolName === 'Bash') {
      const command = String(toolInput.command || '');
      for (const policy of policies) {
        const result = checkCommandRules(command, policy);
        if (result) {
          outputDeny(result.reason, { suggest: result.suggest });
          return;
        }
      }
    }

    // === CONTENT-LEVEL CHECKING WITH AST (for Write/Edit tools) ===
    if (['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
      const filePath = String(toolInput.file_path || '');
      let content = '';

      if (toolName === 'Write') {
        content = String(toolInput.content || '');
      } else if (toolName === 'Edit') {
        content = String(toolInput.new_string || '');
      } else if (toolName === 'MultiEdit') {
        const edits = toolInput.edits as Array<{ new_string?: string }> || [];
        content = edits.map((e) => e.new_string || '').join('\n');
      }

      if (filePath && content) {
        // Check if file is a supported language for AST
        const language = detectLanguage(filePath);
        
        if (language) {
          // Initialize parser and load language
          await initParser();
          await loadLanguage(language);

          // Check each policy with AST
          for (const policy of policies) {
            const result = await checkContentAST(content, filePath, policy);
            if (!result.allowed && result.match) {
              outputDeny(result.match.reason, {
                suggest: result.match.suggest,
                line: result.match.line,
                match: result.match.text.slice(0, 50),
              });
              return;
            }
          }
        }

        // Fallback: check regex contentRules for non-AST files or as backup
        for (const policy of policies) {
          if (!policy.contentRules?.length) continue;

          for (const rule of policy.contentRules) {
            if (!fileMatchesPatterns(filePath, rule.fileTypes)) continue;

            try {
              const regex = new RegExp(rule.pattern, 'm');
              const match = regex.exec(content);
              if (match) {
                const beforeMatch = content.slice(0, match.index);
                const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
                outputDeny(rule.reason, {
                  suggest: rule.suggest,
                  line: lineNum,
                  match: match[0].slice(0, 50),
                });
                return;
              }
            } catch {
              // Invalid regex, skip
            }
          }
        }
      }
    }

    // === FILE-LEVEL CHECKING ===
    const targets: string[] = [];

    if (toolName === 'Bash') {
      const command = String(toolInput.command || '');
      for (const policy of policies) {
        targets.push(...parseBashTargets(command, policy.action));
      }
    } else if (['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
      const filePath = String(toolInput.file_path || '');
      if (filePath) targets.push(filePath);
    }

    for (const target of targets) {
      let relTarget: string;
      try {
        if (isAbsolute(target)) {
          relTarget = relative(cwd, target);
        } else {
          relTarget = target;
        }
      } catch {
        relTarget = target;
      }

      for (const policy of policies) {
        const toolActions = getActionsForTool(toolName);
        if (toolActions.includes(policy.action)) {
          if (isProtected(relTarget, policy)) {
            outputDeny(`${policy.description}: ${relTarget}`);
            return;
          }
        }
      }
    }

    outputAllow();
  } catch (error) {
    // Fail open on errors
    outputAllow();
  }
}

main();
