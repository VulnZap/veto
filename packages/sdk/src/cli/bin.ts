#!/usr/bin/env node

/**
 * Veto CLI entry point.
 *
 * @module cli/bin
 */

import { init } from './init.js';
import { signCommand, verifyCommand, keygenCommand } from './sign-commands.js';

const VERSION = '0.1.0';

function printHelp(): void {
  console.log(`
Veto - AI Agent Tool Call Guardrail

Usage:
  veto <command> [options]

Commands:
  init          Initialize Veto in the current directory
  sign          Sign a rules directory into a .signed.json bundle
  verify        Verify a signed bundle file
  keygen        Generate a new Ed25519 signing key pair
  version       Show version information
  help          Show this help message

Options:
  --force, -f   Force overwrite existing files (init)
  --quiet, -q   Suppress output
  --help, -h    Show help
  --key <path>  Path to private key (sign) or public key (verify)
  --input <dir> Rules directory to sign (default: ./veto/rules)
  --output <f>  Output file for signed bundle (default: rules.signed.json)
  --bundle <f>  Signed bundle file to verify

Examples:
  veto init                     Initialize Veto in current directory
  veto keygen --output keys/    Generate signing key pair
  veto sign --key veto.key      Sign rules with private key
  veto verify --key veto.pub --bundle rules.signed.json
`);
}

function printVersion(): void {
  console.log(`veto v${VERSION}`);
}

function parseArgs(args: string[]): {
  command: string;
  flags: Record<string, boolean>;
  options: Record<string, string>;
} {
  const flags: Record<string, boolean> = {};
  const options: Record<string, string> = {};
  let command = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const flag = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        options[flag] = next;
        i++;
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
    }
  }

  return { command, flags, options };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, flags, options } = parseArgs(args);

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

    case 'keygen': {
      keygenCommand(options['output']);
      process.exit(0);
      break;
    }

    case 'sign': {
      const keyPath = options['key'];
      if (!keyPath) {
        console.error('Error: --key <path> is required for sign command');
        process.exit(1);
      }
      signCommand({
        keyPath,
        inputDir: options['input'],
        outputFile: options['output'],
      });
      process.exit(0);
      break;
    }

    case 'verify': {
      const pubKeyPath = options['key'];
      const bundlePath = options['bundle'];
      if (!pubKeyPath) {
        console.error('Error: --key <path> is required for verify command');
        process.exit(1);
      }
      if (!bundlePath) {
        console.error('Error: --bundle <path> is required for verify command');
        process.exit(1);
      }
      const valid = verifyCommand({ keyPath: pubKeyPath, bundlePath });
      process.exit(valid ? 0 : 1);
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
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
