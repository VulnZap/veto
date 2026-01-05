/**
 * Metrics calculation for benchmark results.
 *
 * @module benchmark/metrics
 */

import type {
  BenchmarkResult,
  ConfusionMatrix,
  LatencyStats,
  ClassificationMetrics,
  CategoryMetrics,
} from './types.js';

/**
 * Calculate confusion matrix from benchmark results.
 * Treats "block" as the positive class.
 */
export function calculateConfusionMatrix(results: BenchmarkResult[]): ConfusionMatrix {
  let tp = 0, tn = 0, fp = 0, fn = 0;

  for (const result of results) {
    if (result.error) continue;

    const expected = result.sample.expectedDecision;
    const actual = result.actualDecision;

    if (expected === 'block' && actual === 'block') {
      tp++;
    } else if (expected === 'pass' && actual === 'pass') {
      tn++;
    } else if (expected === 'pass' && actual === 'block') {
      fp++;
    } else if (expected === 'block' && actual === 'pass') {
      fn++;
    }
  }

  return {
    truePositive: tp,
    trueNegative: tn,
    falsePositive: fp,
    falseNegative: fn,
  };
}

/**
 * Calculate classification metrics from confusion matrix.
 */
export function calculateClassificationMetrics(cm: ConfusionMatrix): ClassificationMetrics {
  const { truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn } = cm;
  const total = tp + tn + fp + fn;

  // Accuracy
  const accuracy = total > 0 ? (tp + tn) / total : 0;

  // Precision (for block class)
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;

  // Recall (for block class)
  const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;

  // F1 Score
  const f1Score = (precision + recall) > 0 
    ? 2 * (precision * recall) / (precision + recall) 
    : 0;

  // False Positive Rate
  const falsePositiveRate = (fp + tn) > 0 ? fp / (fp + tn) : 0;

  // False Negative Rate
  const falseNegativeRate = (fn + tp) > 0 ? fn / (fn + tp) : 0;

  // Matthews Correlation Coefficient
  const mccNumerator = (tp * tn) - (fp * fn);
  const mccDenominator = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
  const mcc = mccDenominator > 0 ? mccNumerator / mccDenominator : 0;

  return {
    accuracy,
    precision,
    recall,
    f1Score,
    falsePositiveRate,
    falseNegativeRate,
    mcc,
  };
}

/**
 * Calculate latency statistics from benchmark results.
 */
export function calculateLatencyStats(results: BenchmarkResult[]): LatencyStats {
  const latencies = results
    .filter(r => !r.error)
    .map(r => r.latencyMs)
    .sort((a, b) => a - b);

  if (latencies.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p95: 0,
      p99: 0,
      stdDev: 0,
      totalMs: 0,
    };
  }

  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const sum = latencies.reduce((a, b) => a + b, 0);
  const mean = sum / latencies.length;
  const median = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  // Standard deviation
  const squaredDiffs = latencies.map(l => Math.pow(l - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / latencies.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  return {
    min,
    max,
    mean,
    median,
    p95,
    p99,
    stdDev,
    totalMs: sum,
  };
}

/**
 * Calculate percentile value from sorted array.
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  if (sortedArray.length === 1) return sortedArray[0];

  const index = (p / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) {
    return sortedArray[lower];
  }

  return sortedArray[lower] * (1 - fraction) + sortedArray[upper] * fraction;
}

/**
 * Calculate per-category metrics.
 */
export function calculateCategoryMetrics(results: BenchmarkResult[]): CategoryMetrics[] {
  // Group results by category
  const byCategory = new Map<string, BenchmarkResult[]>();

  for (const result of results) {
    const category = result.sample.category ?? 'unknown';
    const existing = byCategory.get(category) ?? [];
    existing.push(result);
    byCategory.set(category, existing);
  }

  // Calculate metrics for each category
  const categoryMetrics: CategoryMetrics[] = [];

  for (const [category, categoryResults] of byCategory) {
    const confusionMatrix = calculateConfusionMatrix(categoryResults);
    const metrics = calculateClassificationMetrics(confusionMatrix);
    const latency = calculateLatencyStats(categoryResults);

    categoryMetrics.push({
      category,
      sampleCount: categoryResults.length,
      accuracy: metrics.accuracy,
      confusionMatrix,
      latency,
    });
  }

  // Sort by category name
  return categoryMetrics.sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * Calculate weight calibration metrics.
 * Measures how well the model's confidence weights match decisions.
 */
export function calculateWeightCalibration(results: BenchmarkResult[]): {
  meanPassWeightForPass: number;
  meanPassWeightForBlock: number;
  meanBlockWeightForPass: number;
  meanBlockWeightForBlock: number;
  weightAccuracy: number;
} {
  const passDecisions = results.filter(r => !r.error && r.actualDecision === 'pass');
  const blockDecisions = results.filter(r => !r.error && r.actualDecision === 'block');

  const meanPassWeightForPass = passDecisions.length > 0
    ? passDecisions.reduce((sum, r) => sum + r.actualPassWeight, 0) / passDecisions.length
    : 0;

  const meanBlockWeightForPass = passDecisions.length > 0
    ? passDecisions.reduce((sum, r) => sum + r.actualBlockWeight, 0) / passDecisions.length
    : 0;

  const meanPassWeightForBlock = blockDecisions.length > 0
    ? blockDecisions.reduce((sum, r) => sum + r.actualPassWeight, 0) / blockDecisions.length
    : 0;

  const meanBlockWeightForBlock = blockDecisions.length > 0
    ? blockDecisions.reduce((sum, r) => sum + r.actualBlockWeight, 0) / blockDecisions.length
    : 0;

  // Weight accuracy: how often does max weight match decision
  const validResults = results.filter(r => !r.error);
  const weightMatchCount = validResults.filter(r => {
    const maxWeight = r.actualPassWeight > r.actualBlockWeight ? 'pass' : 'block';
    return maxWeight === r.actualDecision;
  }).length;

  const weightAccuracy = validResults.length > 0 
    ? weightMatchCount / validResults.length 
    : 0;

  return {
    meanPassWeightForPass,
    meanPassWeightForBlock,
    meanBlockWeightForPass,
    meanBlockWeightForBlock,
    weightAccuracy,
  };
}
