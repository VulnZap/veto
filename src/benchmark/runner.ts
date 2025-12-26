/**
 * Benchmark runner for evaluating Veto kernel performance.
 *
 * @module benchmark/runner
 */

import { writeFileSync } from 'node:fs';
import { KernelClient } from '../kernel/client.js';
import type { KernelConfig } from '../kernel/types.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { loadBenchmarkSamples } from './loader.js';
import {
  calculateConfusionMatrix,
  calculateClassificationMetrics,
  calculateLatencyStats,
  calculateCategoryMetrics,
} from './metrics.js';
import type {
  BenchmarkResult,
  BenchmarkReport,
  BenchmarkConfig,
} from './types.js';

/**
 * Progress callback for benchmark updates.
 */
export type ProgressCallback = (
  completed: number,
  total: number,
  current: BenchmarkResult | null,
  eta: number
) => void;

/**
 * Options for running a benchmark.
 */
export interface BenchmarkRunnerOptions {
  /** Benchmark configuration */
  config: BenchmarkConfig;
  /** Progress callback */
  onProgress?: ProgressCallback;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Run a benchmark evaluation.
 */
export async function runBenchmark(options: BenchmarkRunnerOptions): Promise<BenchmarkReport> {
  const { config, onProgress } = options;
  const logger = options.logger ?? createLogger('info');

  const startTime = new Date();
  logger.info('Starting benchmark', {
    datasetPath: config.datasetPath,
    maxSamples: config.maxSamples || 'all',
    model: config.kernel.model,
  });

  // Load samples
  logger.info('Loading benchmark samples...');
  const samples = await loadBenchmarkSamples(
    config.datasetPath,
    config.maxSamples,
    config.shuffle,
    config.seed
  );
  logger.info(`Loaded ${samples.length} samples`);

  // Create kernel client
  const kernelConfig: KernelConfig = {
    baseUrl: config.kernel.baseUrl,
    model: config.kernel.model,
    temperature: config.kernel.temperature,
    maxTokens: config.kernel.maxTokens,
    timeout: config.kernel.timeout,
  };

  const kernelClient = new KernelClient({
    config: kernelConfig,
    logger,
  });

  // Run evaluations
  const results: BenchmarkResult[] = [];
  const startTimes: number[] = [];
  let errorCount = 0;

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const sampleStart = Date.now();
    startTimes.push(sampleStart);

    let result: BenchmarkResult;

    try {
      const toolCall = {
        tool: sample.tool,
        arguments: sample.arguments,
      };

      const response = await kernelClient.evaluate(toolCall, sample.rules);

      result = {
        sample,
        actualDecision: response.decision,
        actualPassWeight: response.pass_weight,
        actualBlockWeight: response.block_weight,
        reasoning: response.reasoning,
        matchedRules: response.matched_rules,
        correct: response.decision === sample.expectedDecision,
        latencyMs: Date.now() - sampleStart,
      };
    } catch (error) {
      errorCount++;
      result = {
        sample,
        actualDecision: 'pass', // Default on error
        actualPassWeight: 0,
        actualBlockWeight: 0,
        reasoning: '',
        correct: false,
        latencyMs: Date.now() - sampleStart,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    results.push(result);

    // Calculate ETA
    const elapsed = Date.now() - startTime.getTime();
    const avgTimePerSample = elapsed / (i + 1);
    const remaining = samples.length - (i + 1);
    const eta = avgTimePerSample * remaining;

    // Report progress
    if (onProgress) {
      onProgress(i + 1, samples.length, result, eta);
    }

    // Log every 10% or every 100 samples
    if ((i + 1) % Math.max(Math.floor(samples.length / 10), 100) === 0) {
      const progress = ((i + 1) / samples.length * 100).toFixed(1);
      const correctSoFar = results.filter(r => r.correct).length;
      const accuracySoFar = (correctSoFar / (i + 1) * 100).toFixed(2);
      logger.info(`Progress: ${progress}% (${i + 1}/${samples.length}) - Accuracy: ${accuracySoFar}%`);
    }
  }

  const endTime = new Date();

  // Calculate metrics
  const confusionMatrix = calculateConfusionMatrix(results);
  const metrics = calculateClassificationMetrics(confusionMatrix);
  const latency = calculateLatencyStats(results);
  const categories = calculateCategoryMetrics(results);

  // Get incorrect predictions for analysis
  const incorrectPredictions = results.filter(r => !r.correct && !r.error);

  // Build report
  const report: BenchmarkReport = {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationMs: endTime.getTime() - startTime.getTime(),
    model: config.kernel.model,
    totalSamples: samples.length,
    correctCount: results.filter(r => r.correct).length,
    incorrectCount: results.filter(r => !r.correct && !r.error).length,
    errorCount,
    confusionMatrix,
    metrics,
    latency,
    categories,
    incorrectPredictions: incorrectPredictions.slice(0, 100), // Limit to 100 for report size
    config,
  };

  if (config.includeResults) {
    report.results = results;
  }

  logger.info('Benchmark complete', {
    totalSamples: report.totalSamples,
    accuracy: (metrics.accuracy * 100).toFixed(2) + '%',
    f1Score: metrics.f1Score.toFixed(4),
    meanLatency: latency.mean.toFixed(2) + 'ms',
    errors: errorCount,
  });

  return report;
}

/**
 * Format a benchmark report for console output.
 */
export function formatReportConsole(report: BenchmarkReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    VETO BENCHMARK REPORT                       ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Overview
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ OVERVIEW                                                    │');
  lines.push('├─────────────────────────────────────────────────────────────┤');
  lines.push(`│ Model:          ${report.model.padEnd(43)}│`);
  lines.push(`│ Total Samples:  ${report.totalSamples.toString().padEnd(43)}│`);
  lines.push(`│ Duration:       ${formatDuration(report.durationMs).padEnd(43)}│`);
  lines.push(`│ Throughput:     ${(report.totalSamples / (report.durationMs / 1000)).toFixed(2).padEnd(40)} samples/sec │`);
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Classification Metrics
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ CLASSIFICATION METRICS                                      │');
  lines.push('├─────────────────────────────────────────────────────────────┤');
  lines.push(`│ Accuracy:       ${(report.metrics.accuracy * 100).toFixed(2)}%`.padEnd(62) + '│');
  lines.push(`│ Precision:      ${(report.metrics.precision * 100).toFixed(2)}%`.padEnd(62) + '│');
  lines.push(`│ Recall:         ${(report.metrics.recall * 100).toFixed(2)}%`.padEnd(62) + '│');
  lines.push(`│ F1 Score:       ${report.metrics.f1Score.toFixed(4)}`.padEnd(62) + '│');
  lines.push(`│ MCC:            ${report.metrics.mcc.toFixed(4)}`.padEnd(62) + '│');
  lines.push(`│ FP Rate:        ${(report.metrics.falsePositiveRate * 100).toFixed(2)}%`.padEnd(62) + '│');
  lines.push(`│ FN Rate:        ${(report.metrics.falseNegativeRate * 100).toFixed(2)}%`.padEnd(62) + '│');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Confusion Matrix
  const cm = report.confusionMatrix;
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ CONFUSION MATRIX                                            │');
  lines.push('├─────────────────────────────────────────────────────────────┤');
  lines.push('│                    Predicted                                │');
  lines.push('│                    PASS        BLOCK                        │');
  lines.push(`│ Actual PASS        ${cm.trueNegative.toString().padStart(6)}      ${cm.falsePositive.toString().padStart(6)}   (TN / FP)            │`);
  lines.push(`│ Actual BLOCK       ${cm.falseNegative.toString().padStart(6)}      ${cm.truePositive.toString().padStart(6)}   (FN / TP)            │`);
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Latency Statistics
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ LATENCY STATISTICS                                          │');
  lines.push('├─────────────────────────────────────────────────────────────┤');
  lines.push(`│ Min:            ${report.latency.min.toFixed(2)} ms`.padEnd(62) + '│');
  lines.push(`│ Max:            ${report.latency.max.toFixed(2)} ms`.padEnd(62) + '│');
  lines.push(`│ Mean:           ${report.latency.mean.toFixed(2)} ms`.padEnd(62) + '│');
  lines.push(`│ Median:         ${report.latency.median.toFixed(2)} ms`.padEnd(62) + '│');
  lines.push(`│ P95:            ${report.latency.p95.toFixed(2)} ms`.padEnd(62) + '│');
  lines.push(`│ P99:            ${report.latency.p99.toFixed(2)} ms`.padEnd(62) + '│');
  lines.push(`│ Std Dev:        ${report.latency.stdDev.toFixed(2)} ms`.padEnd(62) + '│');
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Per-Category Results
  if (report.categories.length > 0) {
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ PER-CATEGORY ACCURACY                                       │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    
    for (const cat of report.categories) {
      const catName = cat.category.length > 30 
        ? cat.category.slice(0, 27) + '...' 
        : cat.category;
      const accuracy = (cat.accuracy * 100).toFixed(1) + '%';
      lines.push(`│ ${catName.padEnd(32)} ${accuracy.padStart(7)} (n=${cat.sampleCount})`.padEnd(62) + '│');
    }
    
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');
  }

  // Error Summary
  if (report.errorCount > 0) {
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ ERRORS                                                      │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    lines.push(`│ Error Count:    ${report.errorCount.toString().padEnd(43)}│`);
    lines.push(`│ Error Rate:     ${((report.errorCount / report.totalSamples) * 100).toFixed(2)}%`.padEnd(62) + '│');
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');
  }

  // Sample Incorrect Predictions
  if (report.incorrectPredictions.length > 0) {
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ SAMPLE INCORRECT PREDICTIONS (first 5)                      │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    
    for (const pred of report.incorrectPredictions.slice(0, 5)) {
      lines.push(`│ ID: ${pred.sample.id}`.padEnd(62) + '│');
      lines.push(`│   Tool: ${pred.sample.tool}`.padEnd(62) + '│');
      lines.push(`│   Expected: ${pred.sample.expectedDecision}, Actual: ${pred.actualDecision}`.padEnd(62) + '│');
      lines.push(`│   Reasoning: ${pred.reasoning.slice(0, 45)}...`.padEnd(62) + '│');
      lines.push('│'.padEnd(62) + '│');
    }
    
    lines.push('└─────────────────────────────────────────────────────────────┘');
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Format duration in human-readable format.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Save benchmark report to JSON file.
 */
export function saveReportJson(report: BenchmarkReport, path: string): void {
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf-8');
}

/**
 * Create a default progress logger.
 */
export function createProgressLogger(): ProgressCallback {
  let lastPercent = -1;

  return (completed, total, _current, eta) => {
    const percent = Math.floor((completed / total) * 100);
    
    // Only log on percentage change
    if (percent !== lastPercent) {
      lastPercent = percent;
      const bar = '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));
      const etaStr = formatDuration(eta);
      process.stdout.write(`\r[${bar}] ${percent}% (${completed}/${total}) ETA: ${etaStr}  `);
      
      if (completed === total) {
        process.stdout.write('\n');
      }
    }
  };
}
