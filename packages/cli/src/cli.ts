#!/usr/bin/env node
// src/cli.ts

import { compile } from './compiler/index.js';
import { VetoDaemon } from './wrapper/daemon.js';
import { createWrapperDir, cleanupWrapperDir } from './wrapper/shims.js';
import { spawnAgent } from './wrapper/spawn.js';
import { COLORS, SYMBOLS, createSpinner } from './ui/colors.js';
import { clearCache } from './compiler/cache.js';
import {
  installAgent,
  uninstallAgent,
  addPolicyToAgents,
  listPolicies,
  removePolicy,
  AGENTS,
  detectInstalledAgents,
} from './native/index.js';
import { startWatchdog, stopWatchdog } from './watchdog/index.js';
import { runSync } from './commands/sync.js';
import { CLIError, ValidationError, ConfigError, AgentError } from './errors.js';

import {
  findVetoConfig,
  loadVetoConfig,
  compileVetoConfig,
  createVetoConfig,
  hasVetoConfig,
} from './config/loader.js';
import { printAuditLog, clearAuditLog } from './audit/index.js';
import { runInteractiveInit } from './commands/init-interactive.js';
import { login as cloudLogin, printCloudStatus } from './cloud/index.js';
import { getActiveSessions } from './wrapper/sessions.js';
import type { Policy } from './types.js';

// Read version from package.json at build time
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;

async function main() {
  const args = process.argv.slice(2);

  // Handle flags
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`veto v${VERSION}`);
    process.exit(0);
  }

  const command = args[0];

  // Route commands
  switch (command) {
    case 'watch':
      await runWatchdog(args.slice(1).join(' '));
      break;
    case 'explain':
      await runExplain(args.slice(1).join(' '));
      break;
    case 'status':
      runStatus();
      break;
    case 'install':
      await runInstall(args[1]);
      break;
    case 'add':
      await runAdd(args.slice(1));
      break;
    case 'list':
      runList();
      break;
    case 'remove':
    case 'rm':
      runRemove(args.slice(1).join(' '));
      break;
    case 'uninstall':
      await runUninstall(args[1]);
      break;
    case 'init':
      await runInteractiveInit();
      break;
    case 'sync':
      await runSync(args[1]);
      break;
    case 'audit':
      await runAudit(args.includes('--clear'), args.includes('--tail'));
      break;
    case 'login':
      await cloudLogin();
      break;
    case 'cloud':
      printCloudStatus();
      break;
    case 'clear':
      runClear();
      break;
    default:
      // Default: wrap agent
      await runWrapper(command, args.slice(1).join(' '));
  }
}

async function runWrapper(agent: string, restriction: string) {
  if (!restriction) {
    console.error(
      `${COLORS.error}${SYMBOLS.error} Error: No restriction provided${COLORS.reset}\n`
    );
    console.log('Usage: veto <agent> "<restriction>"\n');
    console.log("Example: veto cc \"don't delete test files\"");
    throw new ValidationError('No restriction provided');
  }

  // Check for API key (only needed if not using builtins)
  // We'll check later if LLM is actually needed

  // Compile restriction
  const spinner = createSpinner('Compiling restriction...');
  let policy: Policy;

  try {
    policy = await compile(restriction);
    spinner.stop();
  } catch (err) {
    spinner.stop();
    if ((err as Error).message === 'GEMINI_API_KEY not set') {
      console.error(
        `${COLORS.error}${SYMBOLS.error} Error: GEMINI_API_KEY not set${COLORS.reset}\n`
      );
      console.log('  Get a free API key (15 requests/min, 1M tokens/month):');
      console.log('  https://aistudio.google.com/apikey\n');
      console.log('  Then run:');
      console.log('  export GEMINI_API_KEY="your-key"\n');
      throw new ConfigError('GEMINI_API_KEY not set');
    }
    console.error(
      `${COLORS.error}${SYMBOLS.error} Error: Failed to compile restriction${COLORS.reset}\n`
    );
    console.log(`  ${(err as Error).message}\n`);
    throw new CLIError('Failed to compile restriction');
  }

  // Print startup message
  console.log(
    `\n${COLORS.success}${SYMBOLS.success} veto active${COLORS.reset}\n`
  );
  console.log(`  ${COLORS.dim}Policy:${COLORS.reset} ${policy.description}`);
  console.log(`  ${COLORS.dim}Action:${COLORS.reset} ${policy.action}\n`);
  
  // Show file patterns if present
  if (policy.include.length > 0) {
    console.log(`  ${COLORS.dim}Protecting files:${COLORS.reset}`);
    console.log(`    ${policy.include.slice(0, 5).join('  ')}`);
    if (policy.include.length > 5) {
      console.log(
        `    ${COLORS.dim}...and ${policy.include.length - 5} more${COLORS.reset}`
      );
    }
    if (policy.exclude.length > 0) {
      console.log(`\n  ${COLORS.dim}Allowing (exceptions):${COLORS.reset}`);
      console.log(`    ${policy.exclude.join('  ')}`);
    }
  }
  
  // Show command rules if present
  if (policy.commandRules && policy.commandRules.length > 0) {
    console.log(`  ${COLORS.dim}Blocking commands:${COLORS.reset}`);
    for (const rule of policy.commandRules) {
      console.log(`    ${COLORS.error}${rule.block.slice(0, 3).join(', ')}${COLORS.reset}`);
      if (rule.suggest) {
        console.log(`    ${COLORS.dim}→ Use:${COLORS.reset} ${rule.suggest}`);
      }
    }
  }

  // Show content rules if present (Phase 2)
  if (policy.contentRules && policy.contentRules.length > 0) {
    console.log(`  ${COLORS.dim}Checking content for:${COLORS.reset}`);
    for (const rule of policy.contentRules.slice(0, 3)) {
      console.log(`    ${COLORS.error}${rule.reason}${COLORS.reset}`);
    }
    if (policy.contentRules.length > 3) {
      console.log(`    ${COLORS.dim}...and ${policy.contentRules.length - 3} more rules${COLORS.reset}`);
    }
  }
  
  console.log(`\n  Press Ctrl+C to exit\n`);

  // Start daemon
  const daemon = new VetoDaemon(policy, agent, restriction);
  const port = await daemon.start();

  // Create wrapper scripts
  const wrapperDir = createWrapperDir(port, policy);

  // Handle cleanup
  const cleanup = () => {
    daemon.stop();
    cleanupWrapperDir(wrapperDir);
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  // Spawn agent
  spawnAgent(agent, wrapperDir, port, (code) => {
    cleanup();
    process.exit(code);
  });
}

async function runExplain(restriction: string) {
  if (!restriction) {
    console.error(
      `${COLORS.error}${SYMBOLS.error} Error: No restriction provided${COLORS.reset}`
    );
    throw new ValidationError('No restriction provided');
  }

  const spinner = createSpinner('Analyzing restriction...');
  let policy: Policy;

  try {
    policy = await compile(restriction);
    spinner.stop();
  } catch (err) {
    spinner.stop();
    if ((err as Error).message === 'GEMINI_API_KEY not set') {
      console.error(
        `${COLORS.error}${SYMBOLS.error} Error: GEMINI_API_KEY not set${COLORS.reset}\n`
      );
      console.log('  Get a free API key: https://aistudio.google.com/apikey\n');
      throw new ConfigError('GEMINI_API_KEY not set');
    }
    throw err;
  }

  console.log(`\n${COLORS.bold}Policy Preview${COLORS.reset}`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');
  console.log(`Restriction: "${restriction}"\n`);
  console.log(`Action: ${policy.action}\n`);
  
  // Show file patterns if present
  if (policy.include.length > 0) {
    console.log(`${COLORS.bold}File Patterns:${COLORS.reset}`);
    console.log(
      `  ${COLORS.dim}include:${COLORS.reset} ${policy.include.join(', ')}`
    );
    console.log(
      `  ${COLORS.dim}exclude:${COLORS.reset} ${policy.exclude.join(', ') || '(none)'}`
    );
  }
  
  // Show command rules if present
  if (policy.commandRules && policy.commandRules.length > 0) {
    console.log(`${COLORS.bold}Command Rules:${COLORS.reset}`);
    for (const rule of policy.commandRules) {
      console.log(`  ${COLORS.error}block:${COLORS.reset} ${rule.block.join(', ')}`);
      if (rule.suggest) {
        console.log(`  ${COLORS.success}suggest:${COLORS.reset} ${rule.suggest}`);
      }
      console.log(`  ${COLORS.dim}reason:${COLORS.reset} ${rule.reason}`);
      console.log('');
    }
  }

  // Show content rules if present (Phase 2)
  if (policy.contentRules && policy.contentRules.length > 0) {
    console.log(`${COLORS.bold}Content Rules:${COLORS.reset}`);
    for (const rule of policy.contentRules) {
      console.log(`  ${COLORS.error}pattern:${COLORS.reset} ${rule.pattern}`);
      console.log(`  ${COLORS.dim}fileTypes:${COLORS.reset} ${rule.fileTypes.join(', ')}`);
      if (rule.suggest) {
        console.log(`  ${COLORS.success}suggest:${COLORS.reset} ${rule.suggest}`);
      }
      console.log(`  ${COLORS.dim}reason:${COLORS.reset} ${rule.reason}`);
      console.log('');
    }
  }
  
  console.log(`${COLORS.dim}Description:${COLORS.reset} ${policy.description}`);
  console.log(`\nRun 'veto <agent> "${restriction}"' to enforce.\n`);
}

async function runWatchdog(restriction: string) {
  if (!restriction) {
    console.error(
      `${COLORS.error}${SYMBOLS.error} Error: No restriction provided${COLORS.reset}`
    );
    throw new ValidationError('No restriction provided');
  }

  // Compile restriction
  const spinner = createSpinner('Compiling restriction...');
  let policy: Policy;

  try {
    policy = await compile(restriction);
    spinner.stop();
  } catch (err) {
    spinner.stop();
    if ((err as Error).message === 'GEMINI_API_KEY not set') {
      console.error(
        `${COLORS.error}${SYMBOLS.error} Error: GEMINI_API_KEY not set${COLORS.reset}\n`
      );
      console.log('  Get a free API key: https://aistudio.google.com/apikey\n');
      throw new ConfigError('GEMINI_API_KEY not set');
    }
    throw err;
  }

  // Start watchdog
  const snapshotSpinner = createSpinner('Creating file snapshots...');
  const session = await startWatchdog(process.cwd(), policy, restriction);
  snapshotSpinner.stop();

  // Print startup message
  console.log(
    `\n${COLORS.success}${SYMBOLS.success} veto watchdog active${COLORS.reset}\n`
  );
  console.log(`  ${COLORS.dim}Policy:${COLORS.reset} ${policy.description}`);
  console.log(`  ${COLORS.dim}Action:${COLORS.reset} ${policy.action}`);
  console.log(`  ${COLORS.dim}Files protected:${COLORS.reset} ${session.snapshot.files.size}\n`);
  console.log(`  ${COLORS.dim}Protecting:${COLORS.reset}`);
  console.log(`    ${policy.include.slice(0, 5).join('  ')}`);
  if (policy.include.length > 5) {
    console.log(
      `    ${COLORS.dim}...and ${policy.include.length - 5} more patterns${COLORS.reset}`
    );
  }
  console.log(`\n  ${COLORS.info}Watching for changes. Auto-restore on violation.${COLORS.reset}`);
  console.log(`  Press Ctrl+C to exit\n`);

  // Handle cleanup
  process.on('SIGINT', async () => {
    await stopWatchdog(session);
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await stopWatchdog(session);
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

function runStatus(): void {
  console.log(`\n${COLORS.bold}Veto Status${COLORS.reset}`);
  console.log('\u2550'.repeat(50) + '\n');

  const sessions = getActiveSessions();

  if (sessions.length === 0) {
    console.log(`${COLORS.dim}No active sessions.${COLORS.reset}\n`);
    return;
  }

  console.log(`${COLORS.success}${sessions.length} active session(s)${COLORS.reset}\n`);

  for (const session of sessions) {
    const startTime = new Date(session.startTime);
    const duration = Date.now() - startTime.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    console.log(`${COLORS.bold}[${session.mode.toUpperCase()}]${COLORS.reset} PID ${session.pid}`);
    console.log(`  ${COLORS.dim}Agent:${COLORS.reset}       ${session.agent}`);
    console.log(`  ${COLORS.dim}Restriction:${COLORS.reset} "${session.restriction}"`);
    console.log(`  ${COLORS.dim}Action:${COLORS.reset}      ${session.policyAction}`);
    console.log(`  ${COLORS.dim}Patterns:${COLORS.reset}    ${session.policyPatterns.join(', ')}`);
    console.log(`  ${COLORS.dim}Directory:${COLORS.reset}   ${session.cwd}`);
    console.log(`  ${COLORS.dim}Uptime:${COLORS.reset}      ${minutes}m ${seconds}s`);
    console.log(`  ${COLORS.dim}Port:${COLORS.reset}        ${session.port}`);
    console.log('');
  }
}

async function runInstall(agent: string) {
  if (!agent) {
    console.error(`${COLORS.error}${SYMBOLS.error} No agent specified${COLORS.reset}`);
    console.log(`\nSupported agents:`);
    for (const a of AGENTS) {
      const status = a.hasNativeHooks ? `${COLORS.success}native${COLORS.reset}` : `${COLORS.dim}guidance${COLORS.reset}`;
      console.log(`  ${COLORS.dim}${a.aliases[0].padEnd(12)}${COLORS.reset} ${a.name} (${status})`);
    }
    console.log('');
    throw new ValidationError('No agent specified');
  }

  const isGlobal = agent.endsWith('-global');
  const agentId = isGlobal ? agent.replace('-global', '') : agent;
  
  const success = await installAgent(agentId, { global: isGlobal });
  if (!success) {
    throw new AgentError(`Failed to install agent: ${agentId}`);
  }
}

async function runAdd(restrictions: string[]) {
  // Parse restrictions - support both quoted strings and separate args
  const policies: string[] = [];
  let current = '';
  
  for (const arg of restrictions) {
    if (current) {
      current += ' ' + arg;
      if (arg.endsWith('"') || arg.endsWith("'")) {
        policies.push(current.replace(/^["']|["']$/g, ''));
        current = '';
      }
    } else if ((arg.startsWith('"') || arg.startsWith("'")) && !(arg.endsWith('"') || arg.endsWith("'"))) {
      current = arg;
    } else {
      policies.push(arg.replace(/^["']|["']$/g, ''));
    }
  }
  if (current) policies.push(current.replace(/^["']|["']$/g, ''));

  if (policies.length === 0 || policies.every(p => !p.trim())) {
    console.error(
      `${COLORS.error}${SYMBOLS.error} Error: No restriction provided${COLORS.reset}`
    );
    console.log(`\nUsage: veto add "policy1" "policy2" ...`);
    console.log(`Example: veto add "protect .env" "no console.log"`);
    throw new ValidationError('No restriction provided');
  }

  const spinner = createSpinner(`Compiling ${policies.length} ${policies.length === 1 ? 'policy' : 'policies'}...`);

  // Compile all policies in parallel
  const results = await Promise.allSettled(
    policies.map(async (restriction) => {
      const policy = await compile(restriction);
      return { restriction, policy };
    })
  );

  spinner.stop();

  // Process results
  const successful: Array<{ restriction: string; policy: Policy }> = [];
  const failed: Array<{ restriction: string; error: string }> = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      successful.push(result.value);
    } else {
      const errMsg = result.reason?.message || 'Unknown error';
      if (errMsg === 'GEMINI_API_KEY not set') {
        console.error(
          `${COLORS.error}${SYMBOLS.error} Error: GEMINI_API_KEY not set${COLORS.reset}\n`
        );
        console.log('  Get a free API key: https://aistudio.google.com/apikey\n');
        throw new ConfigError('GEMINI_API_KEY not set');
      }
      failed.push({ restriction: policies[i], error: errMsg });
    }
  }

  // Save successful policies
  for (const { restriction, policy } of successful) {
    const policyName = restriction
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    await addPolicyToAgents(policy, policyName);
  }

  // Report results
  if (successful.length > 0) {
    console.log(`\n${COLORS.success}${SYMBOLS.success} ${successful.length} ${successful.length === 1 ? 'policy' : 'policies'} added${COLORS.reset}\n`);
    for (const { restriction, policy } of successful) {
      console.log(`  ${COLORS.success}+${COLORS.reset} "${restriction}"`);
      if (policy.commandRules?.length) {
        console.log(`    ${COLORS.dim}Commands blocked: ${policy.commandRules.flatMap(r => r.block).slice(0, 3).join(', ')}${COLORS.reset}`);
      } else if (policy.include.length) {
        console.log(`    ${COLORS.dim}Files: ${policy.include.slice(0, 3).join(', ')}${COLORS.reset}`);
      }
    }
  }

  if (failed.length > 0) {
    console.log(`\n${COLORS.error}${SYMBOLS.error} ${failed.length} failed:${COLORS.reset}`);
    for (const { restriction, error } of failed) {
      console.log(`  ${COLORS.error}-${COLORS.reset} "${restriction}": ${error}`);
    }
  }

  if (successful.length > 0) {
    console.log(`\nTo enforce, install for your agent:`);
    console.log(`  ${COLORS.dim}veto install cc${COLORS.reset}        Claude Code`);
    console.log(`  ${COLORS.dim}veto install windsurf${COLORS.reset}  Windsurf`);
    console.log(`  ${COLORS.dim}veto install oc${COLORS.reset}        OpenCode\n`);
  }
}

function runList() {
  listPolicies();
}

function runRemove(target: string) {
  if (!target.trim()) {
    console.error(`${COLORS.error}${SYMBOLS.error} Specify policy to remove${COLORS.reset}`);
    console.log(`${COLORS.dim}Usage: veto remove <number> or veto remove "<name>"${COLORS.reset}`);
    console.log(`${COLORS.dim}Run 'veto list' to see policies${COLORS.reset}`);
    throw new ValidationError('No policy specified');
  }
  
  const success = removePolicy(target.trim());
  if (!success) {
    throw new CLIError('Failed to remove policy');
  }
}

async function runUninstall(agent: string) {
  if (!agent) {
    console.error(`${COLORS.error}${SYMBOLS.error} No agent specified${COLORS.reset}`);
    throw new ValidationError('No agent specified');
  }

  const isGlobal = agent.endsWith('-global');
  const agentId = isGlobal ? agent.replace('-global', '') : agent;
  
  const success = await uninstallAgent(agentId, { global: isGlobal });
  if (!success) {
    throw new AgentError(`Failed to uninstall agent: ${agentId}`);
  }
}





async function runAudit(clear: boolean, tail: boolean) {
  if (clear) {
    clearAuditLog();
    return;
  }
  
  await printAuditLog(50, tail);
}

function runClear() {
  clearCache();
  console.log(`${COLORS.success}${SYMBOLS.success} Cache cleared${COLORS.reset}`);
}

function printHelp() {
  console.log(`
${COLORS.bold}veto${COLORS.reset} \u2014 sudo for AI

${COLORS.bold}USAGE${COLORS.reset}
  veto <agent> "<restriction>"     Wrap agent with policy enforcement
  veto watch "<restriction>"       Background file protection (any agent)
  veto explain "<restriction>"     Preview policy without installing
  veto add "<restriction>"         Save policy for native install
  veto init                        Create .veto config file
  veto sync [agent]                Apply .veto policies to agents
  veto install <agent>             Install native hooks/config
  veto uninstall <agent>           Remove native hooks/config
  veto list                        Show saved policies
  veto remove <n|name>             Remove a policy by number or name
  veto audit [--tail] [--clear]    View or clear audit log
  veto status                      Show active sessions
  veto clear                       Clear compilation cache

${COLORS.bold}AGENTS (native integration)${COLORS.reset}
  cc, claude-code    Claude Code     PreToolUse hooks
  oc, opencode       OpenCode        permission.bash rules
  cursor             Cursor CLI      hooks.json (v1.7+)
  ws, windsurf       Windsurf        Cascade hooks
  aider              Aider           .aider.conf.yml read-only

${COLORS.bold}AGENTS (wrapper/watchdog)${COLORS.reset}
  codex              Codex CLI       Use 'veto watch' (OS sandbox)
  copilot            GitHub Copilot  Use wrapper mode
  <any>              Any CLI tool    PATH-based interception

${COLORS.bold}EXAMPLES${COLORS.reset}
  ${COLORS.dim}# Quick start - wrapper mode${COLORS.reset}
  veto cc "don't delete test files"
  
  ${COLORS.dim}# Native mode - persistent policies${COLORS.reset}
  veto add "don't delete test files"
  veto add "protect .env"
  veto install cc
  veto install windsurf
  
  ${COLORS.dim}# Watchdog mode - catches everything${COLORS.reset}
  veto watch "protect test files"
  
  ${COLORS.dim}# Project config - team-wide policies${COLORS.reset}
  veto init              # Creates .veto file
  veto sync cc           # Compiles and installs

${COLORS.bold}ENVIRONMENT${COLORS.reset}
  GEMINI_API_KEY     Required for custom restrictions (not builtins).
                     Free: https://aistudio.google.com/apikey

${COLORS.bold}MORE INFO${COLORS.reset}
  https://github.com/VulnZap/veto
`);
}

main().catch((err) => {
  console.error(
    `${COLORS.error}${SYMBOLS.error} Error: ${err.message}${COLORS.reset}`
  );
  
  // Use exit code from CLIError if available, otherwise default to 1
  const exitCode = err instanceof CLIError ? err.exitCode : 1;
  process.exit(exitCode);
});
