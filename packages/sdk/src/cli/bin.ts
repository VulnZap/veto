#!/usr/bin/env node

/**
 * Veto CLI entry point.
 *
 * @module cli/bin
 */

import { init } from './init.js';
import { templateList, templateShow, templateApply } from './template-commands.js';

const VERSION = '0.1.0';

function printHelp(): void {
  console.log(`
Veto - AI Agent Tool Call Guardrail

Usage:
  veto <command> [options]

Commands:
  init                          Initialize Veto in the current directory
  template list                 List available policy templates
  template show <id>            Show template details and parameters
  template apply <id> [opts]    Generate policy from template
  version                       Show version information
  help                          Show this help message

Options:
  --force, -f       Force overwrite existing files (init)
  --quiet, -q       Suppress output
  --help, -h        Show help
  --param key=val   Set template parameter (template apply)
  --output, -o      Output file path (template apply)

Examples:
  veto init
  veto template list
  veto template show email-safety
  veto template apply email-safety --param allowedDomains=[company.com,partner.com]
  veto template apply file-access --param allowedRoot=/home/user/project -o veto/rules/files.yaml
`);
}

function printVersion(): void {
  console.log(`veto v${VERSION}`);
}

interface ParsedArgs {
  command: string;
  subcommand: string;
  positional: string[];
  flags: Record<string, boolean>;
  params: Record<string, string>;
  output?: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, boolean> = {};
  const params: Record<string, string> = {};
  const positional: string[] = [];
  let command = '';
  let subcommand = '';
  let output: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === '--param' && i + 1 < args.length) {
      const next = args[i + 1]!;
      const eqIdx = next.indexOf('=');
      if (eqIdx > 0) {
        params[next.slice(0, eqIdx)] = next.slice(eqIdx + 1);
      }
      i += 2;
      continue;
    }

    if ((arg === '--output' || arg === '-o') && i + 1 < args.length) {
      output = args[i + 1];
      i += 2;
      continue;
    }

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
    } else if (!subcommand) {
      subcommand = arg;
    } else {
      positional.push(arg);
    }

    i++;
  }

  return { command, subcommand, positional, flags, params, output };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.flags['help'] || parsed.command === 'help') {
    printHelp();
    process.exit(0);
  }

  if (parsed.flags['version'] || parsed.command === 'version') {
    printVersion();
    process.exit(0);
  }

  switch (parsed.command) {
    case 'init': {
      const result = await init({
        force: parsed.flags['force'],
        quiet: parsed.flags['quiet'],
      });
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'template': {
      switch (parsed.subcommand) {
        case 'list':
          templateList();
          break;

        case 'show': {
          const id = parsed.positional[0];
          if (!id) {
            console.error('Usage: veto template show <id>');
            process.exit(1);
          }
          templateShow(id);
          break;
        }

        case 'apply': {
          const id = parsed.positional[0];
          if (!id) {
            console.error('Usage: veto template apply <id> --param key=value');
            process.exit(1);
          }
          templateApply(id, parsed.params, parsed.output);
          break;
        }

        default:
          console.error('Usage: veto template <list|show|apply>');
          process.exit(1);
      }
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
      console.error(`Unknown command: ${parsed.command}`);
      console.error('Run "veto help" for usage information.');
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
