#!/usr/bin/env node

/**
 * Veto CLI entry point.
 *
 * @module cli/bin
 */

import { init } from './init.js';
import { runGenerate } from './generate.js';

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
  generate      Generate a policy from a natural language description
  version       Show version information
  help          Show this help message

Options:
  --force, -f        Force overwrite existing files (init)
  --quiet, -q        Suppress output
  --help, -h         Show help
  --provider <name>  LLM provider: openai, anthropic, gemini, openrouter (generate)
  --model <name>     Model identifier (generate)
  --output <path>    Output file path (generate)
  --with-tests       Generate test cases alongside policy (generate)

Examples:
  veto init           Initialize Veto in current directory
  veto init --force   Reinitialize, overwriting existing files
  veto generate "Block send_email to external domains" --provider openai
  veto generate "Block rm -rf commands" --provider anthropic --output policy.yaml --with-tests
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
  values: Record<string, string>;
  positional: string[];
} {
  const flags: Record<string, boolean> = {};
  const values: Record<string, string> = {};
  const positional: string[] = [];
  let command = '';

  const VALUE_FLAGS = ['provider', 'model', 'output'];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const flag = arg.slice(2);
      if (VALUE_FLAGS.includes(flag) && i + 1 < args.length) {
        values[flag] = args[++i];
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

  return { command, flags, values, positional };
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, flags, values, positional } = parseArgs(args);

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

    case 'generate': {
      const description = positional[0];
      if (!description) {
        console.error('Usage: veto generate "<description>" --provider <provider>');
        process.exit(1);
      }

      const provider = values['provider'];
      if (!provider) {
        console.error('Error: --provider is required for generate command.');
        console.error('Valid providers: openai, anthropic, gemini, openrouter');
        process.exit(1);
      }

      const result = await runGenerate({
        description,
        provider,
        model: values['model'],
        output: values['output'],
        withTests: flags['with-tests'],
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
