#!/usr/bin/env node

/**
 * Veto CLI entry point.
 *
 * @module cli/bin
 */

import { init } from './init.js';
import { explain } from './explain.js';
import type { ExplanationVerbosity } from '../types/explanation.js';

const VERSION = '0.1.0';

/** Allowed verbosity values */
const VALID_VERBOSITY_VALUES: readonly ExplanationVerbosity[] = ['none', 'simple', 'verbose'];

/**
 * Validate verbosity input and return the value or throw an error.
 */
function validateVerbosity(value: string | undefined): ExplanationVerbosity {
  const verbosity = value ?? 'verbose';
  if (!VALID_VERBOSITY_VALUES.includes(verbosity as ExplanationVerbosity)) {
    throw new Error(
      `Invalid verbosity value: "${verbosity}". Allowed values: ${VALID_VERBOSITY_VALUES.join(', ')}`
    );
  }
  return verbosity as ExplanationVerbosity;
}

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
  explain       Run validation and show decision explanation
  version       Show version information
  help          Show this help message

Options:
  --force, -f         Force overwrite existing files (init)
  --quiet, -q         Suppress output
  --help, -h          Show help
  --verbosity <level> Explanation verbosity: none, simple, verbose (default: verbose)
  --redact <paths>    Comma-separated dot-paths to redact from explanation

Examples:
  veto init                                Initialize Veto in current directory
  veto init --force                        Reinitialize, overwriting existing files
  veto explain send_email '{"to":"a@b.c"}' Show explanation for send_email validation
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
  positional: string[];
  stringFlags: Record<string, string>;
} {
  const flags: Record<string, boolean> = {};
  const stringFlags: Record<string, string> = {};
  const positional: string[] = [];
  let command = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const flag = arg.slice(2);
      if (flag === 'verbosity' || flag === 'redact') {
        if (i + 1 < args.length) {
          stringFlags[flag] = args[++i];
        }
      } else {
        flags[flag] = true;
      }
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
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional, stringFlags };
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, flags, positional, stringFlags } = parseArgs(args);

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

    case 'explain': {
      if (positional.length < 2) {
        console.error('Usage: veto explain <tool_name> <args_json> [--verbosity verbose] [--redact paths]');
        process.exit(1);
      }

      // Validate verbosity strictly
      let verbosity: ExplanationVerbosity;
      try {
        verbosity = validateVerbosity(stringFlags['verbosity']);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }

      const redactPaths = stringFlags['redact'] ? stringFlags['redact'].split(',') : undefined;
      const result = await explain({
        toolName: positional[0],
        argsJson: positional[1],
        verbosity,
        redactPaths,
        quiet: flags['quiet'],
      });
      if (!result.success) {
        console.error(result.error);
      }
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
