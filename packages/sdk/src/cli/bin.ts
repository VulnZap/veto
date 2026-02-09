#!/usr/bin/env node

import { init } from './init.js';
import { validate } from './commands/validate.js';
import { test } from './commands/test.js';
import { diff } from './commands/diff.js';
import { simulate } from './commands/simulate.js';
import { deploy } from './commands/deploy.js';

const VERSION = '0.1.0';

function printHelp(): void {
  console.log(`
Veto - AI Agent Tool Call Guardrail

Usage:
  veto <command> [options]

Commands:
  init                              Initialize Veto in the current directory
  validate [path]                   Validate policy files against schema
  test [path]                       Run policy test fixtures
  diff <path1> <path2>             Semantic diff between two policy files
  simulate <policy> <input>         Dry-run a tool call against a policy
  deploy <path> [--target <env>]    Deploy policies to cloud
  version                           Show version information
  help                              Show this help message

Global Options:
  --json        Output as JSON
  --verbose     Verbose output
  --help, -h    Show help

Command Options:
  init:
    --force, -f   Force overwrite existing files
    --quiet, -q   Suppress output

  deploy:
    --target <env>    Target environment (default: "default")
    --api-url <url>   Veto server URL (or set VETO_API_URL)
    --api-key <key>   API key (or set VETO_API_KEY)
    --dry-run         Show what would be deployed without deploying

Exit Codes:
  0  Success
  1  Failure (validation errors, test failures, deploy errors)
  2  Usage error (invalid arguments)

Examples:
  veto init                          Initialize Veto in current directory
  veto validate                      Validate all policy files
  veto validate ./veto/rules         Validate specific directory
  veto test                          Run all policy tests
  veto diff old.yaml new.yaml        Compare two policy files
  veto simulate policy.yaml input.yaml  Dry-run a tool call
  veto deploy . --target prod        Deploy policies
  veto deploy . --dry-run            Preview deployment
`);
}

function printVersion(): void {
  console.log(`veto v${VERSION}`);
}

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, boolean>;
  options: Record<string, string>;
}

function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, boolean> = {};
  const options: Record<string, string> = {};
  const positionals: string[] = [];
  let command = '';

  const valueFlags = new Set(['target', 'api-url', 'api-key']);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const flag = arg.slice(2);
      if (valueFlags.has(flag) && i + 1 < args.length) {
        options[flag] = args[++i];
      } else {
        flags[flag] = true;
      }
    } else if (arg.startsWith('-')) {
      const shortFlags = arg.slice(1).split('');
      for (const f of shortFlags) {
        switch (f) {
          case 'f': flags['force'] = true; break;
          case 'q': flags['quiet'] = true; break;
          case 'h': flags['help'] = true; break;
        }
      }
    } else if (!command) {
      command = arg;
    } else {
      positionals.push(arg);
    }
  }

  return { command, positionals, flags, options };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, positionals, flags, options } = parseArgs(args);

  if (flags['help'] || command === 'help') {
    printHelp();
    process.exit(0);
  }

  if (flags['version'] || command === 'version') {
    printVersion();
    process.exit(0);
  }

  switch (command) {
    case 'init': {
      const result = await init({
        force: flags['force'],
        quiet: flags['quiet'],
      });
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'validate': {
      const result = await validate({
        path: positionals[0],
        json: flags['json'],
        verbose: flags['verbose'],
      });
      process.exit(result.valid ? 0 : 1);
      break;
    }

    case 'test': {
      const result = await test({
        path: positionals[0],
        json: flags['json'],
        verbose: flags['verbose'],
      });
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'diff': {
      if (positionals.length < 2) {
        console.error('Usage: veto diff <path1> <path2>');
        process.exit(2);
      }
      await diff({
        path1: positionals[0],
        path2: positionals[1],
        json: flags['json'],
        verbose: flags['verbose'],
      });
      process.exit(0);
      break;
    }

    case 'simulate': {
      if (positionals.length < 2) {
        console.error('Usage: veto simulate <policy> <input>');
        process.exit(2);
      }
      const result = await simulate({
        policy: positionals[0],
        input: positionals[1],
        json: flags['json'],
        verbose: flags['verbose'],
      });
      process.exit(result.decision === 'block' ? 1 : 0);
      break;
    }

    case 'deploy': {
      if (positionals.length < 1) {
        console.error('Usage: veto deploy <path> [--target <env>]');
        process.exit(2);
      }
      const result = await deploy({
        path: positionals[0],
        target: options['target'],
        apiUrl: options['api-url'],
        apiKey: options['api-key'],
        dryRun: flags['dry-run'],
        json: flags['json'],
        verbose: flags['verbose'],
      });
      process.exit(result.success ? 0 : 1);
      break;
    }

    case '': {
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
      process.exit(2);
    }
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
