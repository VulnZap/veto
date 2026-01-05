#!/usr/bin/env node
/**
 * CLI for running Veto benchmarks.
 *
 * Usage:
 *   npx tsx src/benchmark/cli.ts [options]
 *
 * Options:
 *   --dataset <path>      Path to dataset (glob pattern)
 *   --model <name>        Model to benchmark
 *   --max-samples <n>     Maximum samples to evaluate
 *   --output <path>       Output JSON file path
 *   --no-shuffle          Don't shuffle samples
 *   --seed <n>            Random seed for shuffling
 *   --concurrency <n>     Parallel requests (default: 1)
 *   --base-url <url>      Ollama base URL
 *   --help                Show this help
 *
 * @module benchmark/cli
 */

import { resolve } from 'node:path';
import {
  runBenchmark,
  formatReportConsole,
  saveReportJson,
  createProgressLogger,
} from './runner.js';
import type { BenchmarkConfig } from './types.js';
import { DEFAULT_BENCHMARK_CONFIG } from './types.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { KernelClient } from '../kernel/client.js';
import type { KernelConfig } from '../kernel/types.js';

/**
 * Parse command line arguments.
 */
interface CliOptions extends Partial<BenchmarkConfig> {
  help?: boolean;
  verbose?: boolean;
  testConnection?: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const config: CliOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--help':
      case '-h':
        config.help = true;
        break;
      case '--dataset':
      case '-d':
        config.datasetPath = next;
        i++;
        break;
      case '--model':
      case '-m':
        config.kernel = { ...DEFAULT_BENCHMARK_CONFIG.kernel, model: next };
        i++;
        break;
      case '--max-samples':
      case '-n':
        config.maxSamples = parseInt(next, 10);
        i++;
        break;
      case '--output':
      case '-o':
        config.outputPath = next;
        config.outputFormat = 'both';
        i++;
        break;
      case '--no-shuffle':
        config.shuffle = false;
        break;
      case '--seed':
        config.seed = parseInt(next, 10);
        i++;
        break;
      case '--concurrency':
      case '-c':
        config.concurrency = parseInt(next, 10);
        i++;
        break;
      case '--base-url':
        config.kernel = { 
          ...DEFAULT_BENCHMARK_CONFIG.kernel,
          ...config.kernel,
          baseUrl: next,
        };
        i++;
        break;
      case '--include-results':
        config.includeResults = true;
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--test-connection':
        config.testConnection = true;
        break;
    }
  }

  return config;
}

/**
 * Print help message.
 */
function printHelp(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              VETO BENCHMARK CLI                               ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  npx tsx src/benchmark/cli.ts [options]

Options:
  --dataset, -d <path>     Path to dataset (glob pattern)
                           Default: data/batches/**/*.jsonl

  --model, -m <name>       Model to benchmark
                           Default: ${DEFAULT_BENCHMARK_CONFIG.kernel.model}

  --max-samples, -n <n>    Maximum samples to evaluate (0 = all)
                           Default: 0 (all samples)

  --output, -o <path>      Output JSON file path
                           Default: none (console only)

  --no-shuffle             Don't shuffle samples before evaluation

  --seed <n>               Random seed for shuffling
                           Default: random

  --concurrency, -c <n>    Parallel requests (not yet implemented)
                           Default: 1

  --base-url <url>         Ollama API base URL
                           Default: ${DEFAULT_BENCHMARK_CONFIG.kernel.baseUrl}

  --include-results        Include all individual results in JSON output

  --verbose, -v            Enable debug logging

  --test-connection        Test kernel connection before running

  --help, -h               Show this help message

Examples:
  # Run full benchmark
  npx tsx src/benchmark/cli.ts

  # Run with 100 samples
  npx tsx src/benchmark/cli.ts -n 100

  # Save results to JSON
  npx tsx src/benchmark/cli.ts -o results.json

  # Use specific model
  npx tsx src/benchmark/cli.ts -m veto-warden:latest

  # Benchmark specific category
  npx tsx src/benchmark/cli.ts -d "data/batches/finance/*.jsonl"
`);
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const userConfig = parseArgs(args);

  if (userConfig.help) {
    printHelp();
    process.exit(0);
  }

  // Merge with defaults
  const config: BenchmarkConfig = {
    ...DEFAULT_BENCHMARK_CONFIG,
    ...userConfig,
    kernel: {
      ...DEFAULT_BENCHMARK_CONFIG.kernel,
      ...userConfig.kernel,
    },
  };

  // Resolve dataset path relative to cwd
  config.datasetPath = resolve(process.cwd(), config.datasetPath);

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              VETO BENCHMARK                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Dataset:    ${config.datasetPath}`);
  console.log(`Model:      ${config.kernel.model}`);
  console.log(`Max Samples: ${config.maxSamples || 'all'}`);
  console.log(`Shuffle:    ${config.shuffle}`);
  console.log('');

  // Create logger with appropriate level
  const logger: Logger = createLogger(userConfig.verbose ? 'debug' : 'info');

  // Test connection if requested
  if (userConfig.testConnection) {
    console.log('Testing kernel connection...');
    const kernelConfig: KernelConfig = config.kernel;
    const kernelClient = new KernelClient({ config: kernelConfig, logger });
    
    try {
      const healthy = await kernelClient.healthCheck();
      if (healthy) {
        console.log('✅ Kernel connection successful');
      } else {
        console.log('❌ Kernel health check failed');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Kernel connection error:', error instanceof Error ? error.message : error);
      if (error instanceof Error && error.cause) {
        console.error('   Cause:', (error.cause as Error).message);
      }
      process.exit(1);
    }
    
    if (!config.datasetPath) {
      process.exit(0);
    }
  }

  try {
    const report = await runBenchmark({
      config,
      onProgress: createProgressLogger(),
      logger,
    });

    // Print console report
    console.log(formatReportConsole(report));

    // Save JSON if requested
    if (config.outputPath) {
      const outputPath = resolve(process.cwd(), config.outputPath);
      saveReportJson(report, outputPath);
      console.log(`\nReport saved to: ${outputPath}`);
    }

    // Exit with error code if accuracy is below threshold
    if (report.metrics.accuracy < 0.9) {
      console.log('\n⚠️  Warning: Accuracy below 90% threshold');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Benchmark failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run CLI
main().catch(console.error);
