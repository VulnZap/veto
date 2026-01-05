#!/usr/bin/env node

/**
 * Veto CLI entry point.
 *
 * @module cli/bin
 */

import { init } from './init.js';

const VERSION = '0.1.0';

/**
 * Print help message.
 */
function printHelp(): void {
  console.log(`
Veto - AI Agent Tool Call Guardrail

Usage:
  veto <command> [options]

Commands:
  init          Initialize Veto in the current directory
  version       Show version information
  help          Show this help message

Options:
  --force, -f   Force overwrite existing files (init)
  --quiet, -q   Suppress output
  --help, -h    Show help

Examples:
  veto init           Initialize Veto in current directory
  veto init --force   Reinitialize, overwriting existing files
`);
}

/**
 * Print version.
 */
function printVersion(): void {
  console.log(`veto v${VERSION}`);
}

/**
 * Parse command line arguments.
 */
function parseArgs(args: string[]): {
  command: string;
  flags: Record<string, boolean>;
} {
  const flags: Record<string, boolean> = {};
  let command = '';

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const flag = arg.slice(2);
      flags[flag] = true;
    } else if (arg.startsWith('-')) {
      const shortFlags = arg.slice(1).split('');
      for (const f of shortFlags) {
        switch (f) {
          case 'f':
            flags['force'] = true;
            break;
          case 'q':
            flags['quiet'] = true;
            break;
          case 'h':
            flags['help'] = true;
            break;
        }
      }
    } else if (!command) {
      command = arg;
    }
  }

  return { command, flags };
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, flags } = parseArgs(args);

  // Handle help flag
  if (flags['help'] || command === 'help') {
    printHelp();
    process.exit(0);
  }

  // Handle version flag or command
  if (flags['version'] || command === 'version') {
    printVersion();
    process.exit(0);
  }

  // Handle commands
  switch (command) {
    case 'init': {
      const result = await init({
        force: flags['force'],
        quiet: flags['quiet'],
      });
      process.exit(result.success ? 0 : 1);
      break;
    }

    case '': {
      // No command provided
      console.log('Veto - AI Agent Tool Call Guardrail');
      console.log('');
      console.log('Run "veto help" for usage information.');
      console.log('Run "veto init" to initialize Veto in your project.');
      process.exit(0);
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      console.error('Run "veto help" for usage information.');
      process.exit(1);
    }
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
