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
  AGENTS,
} from './native/index.js';
import { startWatchdog, stopWatchdog } from './watchdog/index.js';
import {
  findLeashConfig,
  loadLeashConfig,
  compileLeashConfig,
  createLeashConfig,
} from './config/loader.js';
import { printAuditLog, clearAuditLog } from './audit/index.js';
import { login as cloudLogin, printCloudStatus } from './cloud/index.js';
import type { Policy } from './types.js';

const VERSION = '0.1.0';

async function main() {
  const args = process.argv.slice(2);

  // Handle flags
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`veto-leash v${VERSION}`);
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
      await runAdd(args.slice(1).join(' '));
      break;
    case 'list':
      runList();
      break;
    case 'uninstall':
      await runUninstall(args[1]);
      break;
    case 'init':
      runInit();
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
    console.log('Usage: leash <agent> "<restriction>"\n');
    console.log("Example: leash cc \"don't delete test files\"");
    process.exit(1);
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
      process.exit(1);
    }
    console.error(
      `${COLORS.error}${SYMBOLS.error} Error: Failed to compile restriction${COLORS.reset}\n`
    );
    console.log(`  ${(err as Error).message}\n`);
    process.exit(1);
  }

  // Print startup message
  console.log(
    `\n${COLORS.success}${SYMBOLS.success} veto-leash active${COLORS.reset}\n`
  );
  console.log(`  ${COLORS.dim}Policy:${COLORS.reset} ${policy.description}`);
  console.log(`  ${COLORS.dim}Action:${COLORS.reset} ${policy.action}\n`);
  console.log(`  ${COLORS.dim}Protecting:${COLORS.reset}`);
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
  console.log(`\n  Press Ctrl+C to exit\n`);

  // Start daemon
  const daemon = new VetoDaemon(policy, agent);
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
    process.exit(1);
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
      process.exit(1);
    }
    throw err;
  }

  console.log(`\n${COLORS.bold}Policy Preview${COLORS.reset}`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');
  console.log(`Restriction: "${restriction}"\n`);
  console.log(`Action: ${policy.action}\n`);
  console.log(`Patterns:`);
  console.log(
    `  ${COLORS.dim}include:${COLORS.reset} ${policy.include.join(', ')}`
  );
  console.log(
    `  ${COLORS.dim}exclude:${COLORS.reset} ${policy.exclude.join(', ') || '(none)'}`
  );
  console.log(`\nDescription: ${policy.description}`);
  console.log(`\nRun 'leash <agent> "${restriction}"' to enforce.\n`);
}

async function runWatchdog(restriction: string) {
  if (!restriction) {
    console.error(
      `${COLORS.error}${SYMBOLS.error} Error: No restriction provided${COLORS.reset}`
    );
    process.exit(1);
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
      process.exit(1);
    }
    throw err;
  }

  // Start watchdog
  const snapshotSpinner = createSpinner('Creating file snapshots...');
  const session = await startWatchdog(process.cwd(), policy);
  snapshotSpinner.stop();

  // Print startup message
  console.log(
    `\n${COLORS.success}${SYMBOLS.success} veto-leash watchdog active${COLORS.reset}\n`
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

function runStatus() {
  console.log(`\n${COLORS.bold}veto-leash Status${COLORS.reset}`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');
  console.log('No active sessions.\n');
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
    process.exit(1);
  }

  const isGlobal = agent.endsWith('-global');
  const agentId = isGlobal ? agent.replace('-global', '') : agent;
  
  const success = await installAgent(agentId, { global: isGlobal });
  if (!success) {
    process.exit(1);
  }
}

async function runAdd(restriction: string) {
  if (!restriction) {
    console.error(
      `${COLORS.error}${SYMBOLS.error} Error: No restriction provided${COLORS.reset}`
    );
    process.exit(1);
  }

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
      process.exit(1);
    }
    throw err;
  }

  // Generate policy name from restriction
  const policyName = restriction
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  // Save to all agent policy stores
  await addPolicyToAgents(policy, policyName);

  console.log(`\n${COLORS.success}${SYMBOLS.success} Policy added${COLORS.reset}\n`);
  console.log(`  ${COLORS.dim}Restriction:${COLORS.reset} "${restriction}"`);
  console.log(`  ${COLORS.dim}Action:${COLORS.reset} ${policy.action}`);
  console.log(`  ${COLORS.dim}Patterns:${COLORS.reset} ${policy.include.join(', ')}`);
  console.log(`\nTo enforce, install for your agent:`);
  console.log(`  ${COLORS.dim}leash install cc${COLORS.reset}        Claude Code`);
  console.log(`  ${COLORS.dim}leash install windsurf${COLORS.reset}  Windsurf`);
  console.log(`  ${COLORS.dim}leash install oc${COLORS.reset}        OpenCode\n`);
}

function runList() {
  listPolicies();
}

async function runUninstall(agent: string) {
  if (!agent) {
    console.error(`${COLORS.error}${SYMBOLS.error} No agent specified${COLORS.reset}`);
    process.exit(1);
  }

  const isGlobal = agent.endsWith('-global');
  const agentId = isGlobal ? agent.replace('-global', '') : agent;
  
  const success = await uninstallAgent(agentId, { global: isGlobal });
  if (!success) {
    process.exit(1);
  }
}

function runInit() {
  createLeashConfig();
  console.log(`\nEdit .leash to customize your policies.`);
  console.log(`Then run: ${COLORS.dim}leash sync${COLORS.reset}\n`);
}

async function runSync(agent?: string) {
  const configPath = findLeashConfig();
  
  if (!configPath) {
    console.error(`${COLORS.error}${SYMBOLS.error} No .leash config found${COLORS.reset}`);
    console.log(`Run: ${COLORS.dim}leash init${COLORS.reset}`);
    process.exit(1);
  }

  const config = loadLeashConfig(configPath);
  if (!config) {
    process.exit(1);
  }

  console.log(`\n${COLORS.info}Loading ${configPath}...${COLORS.reset}`);

  // Compile all policies
  const compiled = await compileLeashConfig(config);

  console.log(`${COLORS.success}${SYMBOLS.success} Compiled ${compiled.policies.length} policies${COLORS.reset}\n`);

  // Save each policy
  for (const { restriction, policy } of compiled.policies) {
    const policyName = restriction
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    
    await addPolicyToAgents(policy, policyName);
  }

  // If agent specified, install for that agent
  if (agent) {
    console.log('');
    await installAgent(agent);
  } else {
    console.log(`To install for an agent:`);
    console.log(`  ${COLORS.dim}leash install cc${COLORS.reset}        Claude Code`);
    console.log(`  ${COLORS.dim}leash install windsurf${COLORS.reset}  Windsurf`);
    console.log(`  ${COLORS.dim}leash install oc${COLORS.reset}        OpenCode\n`);
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
${COLORS.bold}veto-leash${COLORS.reset} \u2014 sudo for AI agents

${COLORS.bold}USAGE${COLORS.reset}
  leash <agent> "<restriction>"     Wrap agent with policy enforcement
  leash watch "<restriction>"       Background file protection (any agent)
  leash explain "<restriction>"     Preview policy without installing
  leash add "<restriction>"         Save policy for native install
  leash init                        Create .leash config file
  leash sync [agent]                Apply .leash policies to agents
  leash install <agent>             Install native hooks/config
  leash uninstall <agent>           Remove native hooks/config
  leash list                        Show saved policies
  leash audit [--tail] [--clear]    View or clear audit log
  leash status                      Show active sessions
  leash clear                       Clear compilation cache

${COLORS.bold}AGENTS (native integration)${COLORS.reset}
  cc, claude-code    Claude Code     PreToolUse hooks
  ws, windsurf       Windsurf        Cascade hooks
  oc, opencode       OpenCode        permission.bash rules
  cursor             Cursor          .cursorrules (guidance only)
  aider              Aider           .aider.conf.yml read-only

${COLORS.bold}AGENTS (wrapper/watchdog)${COLORS.reset}
  codex              Codex CLI       Use 'leash watch' (OS sandbox)
  copilot            GitHub Copilot  Use wrapper mode
  <any>              Any CLI tool    PATH-based interception

${COLORS.bold}EXAMPLES${COLORS.reset}
  ${COLORS.dim}# Quick start - wrapper mode${COLORS.reset}
  leash cc "don't delete test files"
  
  ${COLORS.dim}# Native mode - persistent policies${COLORS.reset}
  leash add "don't delete test files"
  leash add "protect .env"
  leash install cc
  leash install windsurf
  
  ${COLORS.dim}# Watchdog mode - catches everything${COLORS.reset}
  leash watch "protect test files"
  
  ${COLORS.dim}# Project config - team-wide policies${COLORS.reset}
  leash init              # Creates .leash file
  leash sync cc           # Compiles and installs

${COLORS.bold}ENVIRONMENT${COLORS.reset}
  GEMINI_API_KEY     Required for custom restrictions (not builtins).
                     Free: https://aistudio.google.com/apikey

${COLORS.bold}MORE INFO${COLORS.reset}
  https://github.com/plaw-inc/veto-leash
`);
}

main().catch((err) => {
  console.error(
    `${COLORS.error}${SYMBOLS.error} Error: ${err.message}${COLORS.reset}`
  );
  process.exit(1);
});
