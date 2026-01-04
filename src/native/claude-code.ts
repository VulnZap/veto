// src/native/claude-code.ts
// Claude Code native hook integration
// Generates PreToolUse hooks that integrate directly with Claude Code's permission system

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type { Policy } from '../types.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLAUDE_CONFIG_DIR = join(homedir(), '.claude');
const CLAUDE_HOOKS_DIR = join(CLAUDE_CONFIG_DIR, 'hooks', 'veto-leash');
const CLAUDE_SETTINGS_FILE = join(CLAUDE_CONFIG_DIR, 'settings.json');

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: Array<{
      matcher: string;
      hooks: Array<{
        type: string;
        command: string;
      }>;
    }>;
  };
  [key: string]: unknown;
}

/**
 * Copy a directory recursively
 */
function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Install veto-leash as a Claude Code PreToolUse hook
 */
export async function installClaudeCodeHook(): Promise<void> {
  console.log(`\n${COLORS.info}Installing veto-leash for Claude Code...${COLORS.reset}\n`);

  // Create hooks directory
  mkdirSync(CLAUDE_HOOKS_DIR, { recursive: true });
  mkdirSync(join(CLAUDE_HOOKS_DIR, 'policies'), { recursive: true });

  // Copy the Node.js validator and its dependencies
  // The validator is at dist/native/validator.js relative to this file's location
  const distDir = dirname(__dirname); // Go up from dist/native to dist
  const validatorSrc = join(distDir, 'native', 'validator.js');
  const validatorDest = join(CLAUDE_HOOKS_DIR, 'validator.js');
  
  // Copy AST modules needed by validator
  const astSrcDir = join(distDir, 'ast');
  const astDestDir = join(CLAUDE_HOOKS_DIR, 'ast');
  const typesSrc = join(distDir, 'types.js');
  const typesDest = join(CLAUDE_HOOKS_DIR, 'types.js');
  
  // Copy WASM files for tree-sitter
  const wasmSrcDir = join(dirname(distDir), 'languages'); // languages/ at project root
  const wasmDestDir = join(CLAUDE_HOOKS_DIR, 'languages');
  
  // Track which validator we're using
  let useNodeValidator = false;
  
  try {
    copyFileSync(validatorSrc, validatorDest);
    console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Created validator: ${validatorDest}`);
    
    copyDirSync(astSrcDir, astDestDir);
    console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Copied AST modules`);
    
    copyFileSync(typesSrc, typesDest);
    
    if (existsSync(wasmSrcDir)) {
      copyDirSync(wasmSrcDir, wasmDestDir);
      console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Copied language parsers`);
    }
    
    useNodeValidator = true;
  } catch (err) {
    console.log(`  ${COLORS.warning}${SYMBOLS.warning}${COLORS.reset} Could not copy validator files: ${(err as Error).message}`);
    console.log(`  ${COLORS.dim}Falling back to Python validator${COLORS.reset}`);
    // Fall back to Python validator
    const pythonValidatorPath = join(CLAUDE_HOOKS_DIR, 'validator.py');
    writeFileSync(pythonValidatorPath, VALIDATOR_SCRIPT, { mode: 0o755 });
    console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Created validator: ${pythonValidatorPath}`);
  }

  // Update Claude settings
  let settings: ClaudeSettings = {};
  if (existsSync(CLAUDE_SETTINGS_FILE)) {
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8'));
    } catch {
      // Start fresh if parse fails
    }
  }

  // Ensure hooks structure exists
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = [];
  }

  // Check if veto-leash hook already exists
  const existingIndex = settings.hooks.PreToolUse.findIndex(
    (h) => h.hooks.some((cmd) => cmd.command.includes('veto-leash'))
  );

  // Choose validator command based on what was installed
  const validatorCommand = useNodeValidator
    ? `node "${validatorDest}"`
    : `python3 "${join(CLAUDE_HOOKS_DIR, 'validator.py')}"`;

  const hookEntry = {
    matcher: 'Bash|Write|Edit|MultiEdit',
    hooks: [
      {
        type: 'command',
        command: validatorCommand,
      },
    ],
  };

  if (existingIndex >= 0) {
    settings.hooks.PreToolUse[existingIndex] = hookEntry;
    console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Updated hook in settings`);
  } else {
    settings.hooks.PreToolUse.push(hookEntry);
    console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Added hook to settings`);
  }

  // Write settings back
  mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true });
  writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2));
  console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Updated: ${CLAUDE_SETTINGS_FILE}`);

  console.log(`\n${COLORS.success}${SYMBOLS.success} veto-leash installed for Claude Code${COLORS.reset}\n`);
  console.log(`To add a policy:`);
  console.log(`  ${COLORS.dim}leash add "don't delete test files"${COLORS.reset}\n`);
  console.log(`To remove:`);
  console.log(`  ${COLORS.dim}leash uninstall cc${COLORS.reset}\n`);
}

/**
 * Add a policy to Claude Code's veto-leash policies
 */
export async function addClaudeCodePolicy(policy: Policy, name: string): Promise<void> {
  const policiesDir = join(CLAUDE_HOOKS_DIR, 'policies');
  mkdirSync(policiesDir, { recursive: true });

  const policyFile = join(policiesDir, `${name}.json`);
  writeFileSync(policyFile, JSON.stringify(policy, null, 2));
  console.log(`${COLORS.success}${SYMBOLS.success}${COLORS.reset} Policy saved: ${policyFile}`);
}

/**
 * Uninstall veto-leash from Claude Code
 */
export async function uninstallClaudeCodeHook(): Promise<void> {
  console.log(`\n${COLORS.info}Removing veto-leash from Claude Code...${COLORS.reset}\n`);

  // Remove from settings
  if (existsSync(CLAUDE_SETTINGS_FILE)) {
    try {
      const settings: ClaudeSettings = JSON.parse(
        readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8')
      );
      
      if (settings.hooks?.PreToolUse) {
        settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
          (h) => !h.hooks.some((cmd) => cmd.command.includes('veto-leash'))
        );
        writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2));
        console.log(`  ${COLORS.success}${SYMBOLS.success}${COLORS.reset} Removed hook from settings`);
      }
    } catch {
      console.log(`  ${COLORS.warning}${SYMBOLS.warning}${COLORS.reset} Could not parse settings file`);
    }
  }

  console.log(`\n${COLORS.success}${SYMBOLS.success} veto-leash removed from Claude Code${COLORS.reset}\n`);
  console.log(`${COLORS.dim}Note: Policy files in ${CLAUDE_HOOKS_DIR} were preserved.${COLORS.reset}\n`);
}

/**
 * Python validator script that runs as a Claude Code PreToolUse hook.
 * Uses Python for maximum cross-platform compatibility.
 * 
 * Based on official Claude Code hooks documentation:
 * https://code.claude.com/docs/en/hooks-guide
 * 
 * Supports:
 * - File-level policies (include/exclude patterns)
 * - Command-level policies (commandRules with block patterns)
 * - Content-level policies (contentRules with regex patterns) [Phase 2]
 * 
 * Uses structured JSON output for reliable communication.
 */
const VALIDATOR_SCRIPT = `#!/usr/bin/env python3
"""
veto-leash validator for Claude Code PreToolUse hooks.

Input (via stdin): JSON with tool_name, tool_input, cwd, session_id
Output (via stdout): JSON with hookSpecificOutput.permissionDecision and systemMessage
Exit code: 0 always (decision communicated via JSON)

Supports:
- File-level policies (include/exclude patterns)
- Command-level policies (commandRules with block patterns)
- Content-level policies (contentRules with regex patterns)
"""

import json
import sys
import os
import re
from pathlib import Path
from fnmatch import fnmatch

POLICIES_DIR = Path(__file__).parent / "policies"

# Common command aliases for matching
COMMAND_ALIASES = {
    "npm i": ["npm install"],
    "npm ci": ["npm clean-install"],
    "npm r": ["npm remove", "npm uninstall"],
    "npm rm": ["npm remove", "npm uninstall"],
    "pnpm i": ["pnpm install"],
    "bun i": ["bun install"],
    "bun a": ["bun add"],
    "git co": ["git checkout"],
}

def load_policies():
    """Load all policy files from the policies directory."""
    policies = []
    if POLICIES_DIR.exists():
        for f in POLICIES_DIR.glob("*.json"):
            try:
                policies.append(json.loads(f.read_text()))
            except:
                pass
    return policies

def normalize_path(p):
    """Normalize path for pattern matching."""
    return str(p).replace("\\\\", "/")

def normalize_command(cmd):
    """Normalize command for pattern matching."""
    return " ".join(cmd.lower().split())

def expand_command_aliases(command):
    """Expand command aliases to their full forms."""
    normalized = normalize_command(command)
    expanded = [normalized]
    
    for alias, expansions in COMMAND_ALIASES.items():
        if normalized.startswith(alias):
            suffix = normalized[len(alias):]
            for expansion in expansions:
                expanded.append(expansion + suffix)
    
    return expanded

def command_matches_pattern(command, pattern):
    """Check if command matches a glob pattern."""
    cmd = normalize_command(command)
    pat = normalize_command(pattern)
    
    # Exact match
    if cmd == pat:
        return True
    
    # No wildcards - prefix match
    if "*" not in pat and "?" not in pat:
        return cmd.startswith(pat + " ") or cmd == pat
    
    # Wildcards - use fnmatch
    # For patterns starting with non-wildcard, require prefix match first
    if not pat.startswith("*"):
        first_star = pat.find("*")
        prefix = pat[:first_star] if first_star >= 0 else pat
        if not cmd.startswith(prefix):
            return False
    
    return fnmatch(cmd, pat)

def check_command_rules(command, policy):
    """Check command against policy's commandRules."""
    command_rules = policy.get("commandRules", [])
    if not command_rules:
        return None
    
    variations = expand_command_aliases(command)
    
    for rule in command_rules:
        block_patterns = rule.get("block", [])
        for pattern in block_patterns:
            for variation in variations:
                if command_matches_pattern(variation, pattern):
                    return {
                        "pattern": pattern,
                        "reason": rule.get("reason", "Blocked by policy"),
                        "suggest": rule.get("suggest"),
                    }
    
    return None

def file_matches_patterns(file_path, patterns):
    """Check if file path matches any of the file type patterns."""
    if not patterns:
        return True  # No patterns = matches all
    
    normalized = normalize_path(file_path)
    basename = os.path.basename(normalized)
    
    for pattern in patterns:
        # Simple extension match: "*.ts"
        if pattern.startswith("*.") and "/" not in pattern:
            if basename.endswith(pattern[1:]):
                return True
            continue
        
        # Full glob match
        if fnmatch(normalized, pattern) or fnmatch(basename, pattern):
            return True
    
    return False

def check_content_rules(file_path, content, policy):
    """Check file content against policy's contentRules."""
    content_rules = policy.get("contentRules", [])
    if not content_rules:
        return None
    
    for rule in content_rules:
        file_types = rule.get("fileTypes", [])
        
        # Check if file type matches
        if not file_matches_patterns(file_path, file_types):
            continue
        
        # Check regex pattern against content
        pattern = rule.get("pattern", "")
        if not pattern:
            continue
        
        try:
            regex = re.compile(pattern, re.MULTILINE)
            match = regex.search(content)
            if match:
                # Find line number
                before_match = content[:match.start()]
                line_num = before_match.count("\\n") + 1
                
                return {
                    "pattern": pattern,
                    "match": match.group(0)[:50],  # Truncate long matches
                    "line": line_num,
                    "reason": rule.get("reason", "Blocked by content rule"),
                    "suggest": rule.get("suggest"),
                }
        except re.error:
            # Invalid regex, skip
            continue
    
    return None

def matches_pattern(target, pattern):
    """Check if target matches a glob pattern."""
    target = normalize_path(target)
    pattern = normalize_path(pattern)
    basename = os.path.basename(target)
    return fnmatch(target, pattern) or fnmatch(basename, pattern)

def is_protected(target, policy):
    """Check if target is protected by policy."""
    includes = policy.get("include", [])
    if not includes:
        return False
    
    matches_include = any(matches_pattern(target, p) for p in includes)
    if not matches_include:
        return False
    
    matches_exclude = any(
        matches_pattern(target, p) for p in policy.get("exclude", [])
    )
    return not matches_exclude

def parse_bash_targets(command, action):
    """Extract file targets from bash commands."""
    targets = []
    
    if action == "delete":
        rm_match = re.search(r'\\brm\\s+(?:-[rfiv]+\\s+)*(.+)', command)
        if rm_match:
            for arg in rm_match.group(1).split():
                if not arg.startswith('-'):
                    targets.append(arg)
        
        git_rm_match = re.search(r'\\bgit\\s+rm\\s+(?:-[rf]+\\s+)*(.+)', command)
        if git_rm_match:
            for arg in git_rm_match.group(1).split():
                if not arg.startswith('-'):
                    targets.append(arg)
    
    elif action == "modify":
        mv_match = re.search(r'\\b(mv|cp)\\s+(?:-[a-z]+\\s+)*(.+)', command)
        if mv_match:
            for arg in mv_match.group(2).split():
                if not arg.startswith('-'):
                    targets.append(arg)
                    break
    
    return targets

def get_action_for_tool(tool_name):
    """Map Claude Code tool names to veto-leash actions."""
    return {
        "Bash": ["delete", "modify", "execute"],
        "Write": ["modify"],
        "Edit": ["modify"],
        "MultiEdit": ["modify"],
        "Read": ["read"],
    }.get(tool_name, [])

def output_allow():
    """Output JSON to allow the action."""
    print(json.dumps({
        "hookSpecificOutput": {
            "permissionDecision": "allow"
        }
    }))
    sys.exit(0)

def output_deny(reason, suggest=None, line=None, match=None):
    """Output JSON to deny the action with explanation."""
    message = f"veto-leash: BLOCKED\\n\\nReason: {reason}"
    if line:
        message += f"\\nLine: {line}"
    if match:
        message += f"\\nMatch: {match}"
    if suggest:
        message += f"\\n\\nSuggested alternative: {suggest}"
    message += "\\n\\nThe action was blocked by a veto-leash policy. Please follow the suggested alternative or modify your approach."
    
    print(json.dumps({
        "hookSpecificOutput": {
            "permissionDecision": "deny"
        },
        "systemMessage": message
    }))
    sys.exit(0)

def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        output_allow()
        return
    
    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})
    cwd = input_data.get("cwd", os.getcwd())
    
    policies = load_policies()
    if not policies:
        output_allow()
        return
    
    # === COMMAND-LEVEL CHECKING (for Bash tool) ===
    if tool_name == "Bash":
        command = tool_input.get("command", "")
        
        for policy in policies:
            result = check_command_rules(command, policy)
            if result:
                output_deny(result["reason"], result.get("suggest"))
                return
    
    # === CONTENT-LEVEL CHECKING (for Write/Edit tools) ===
    if tool_name in ("Write", "Edit", "MultiEdit"):
        file_path = tool_input.get("file_path", "")
        content = tool_input.get("content", "")
        
        # For Edit, the content is the new_string being inserted
        if tool_name == "Edit":
            content = tool_input.get("new_string", "")
        
        # For MultiEdit, check all edits
        if tool_name == "MultiEdit":
            edits = tool_input.get("edits", [])
            content = "\\n".join(edit.get("new_string", "") for edit in edits)
        
        if file_path and content:
            for policy in policies:
                result = check_content_rules(file_path, content, policy)
                if result:
                    output_deny(
                        result["reason"],
                        result.get("suggest"),
                        result.get("line"),
                        result.get("match")
                    )
                    return
    
    # === FILE-LEVEL CHECKING ===
    targets = []
    
    if tool_name == "Bash":
        command = tool_input.get("command", "")
        for policy in policies:
            action = policy.get("action", "modify")
            targets.extend(parse_bash_targets(command, action))
    
    elif tool_name in ("Write", "Edit", "MultiEdit"):
        file_path = tool_input.get("file_path", "")
        if file_path:
            targets.append(file_path)
    
    for target in targets:
        try:
            target_path = Path(target)
            if not target_path.is_absolute():
                target_path = Path(cwd) / target
            rel_target = str(target_path.relative_to(cwd))
        except:
            rel_target = target
        
        for policy in policies:
            tool_actions = get_action_for_tool(tool_name)
            policy_action = policy.get("action", "modify")
            
            if policy_action in tool_actions:
                if is_protected(rel_target, policy):
                    output_deny(
                        f"{policy.get('description', 'Protected file')}: {rel_target}"
                    )
                    return
    
    output_allow()

if __name__ == "__main__":
    main()
`;
