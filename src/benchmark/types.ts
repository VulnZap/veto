/**
 * Types for the Veto benchmark suite.
 *
 * @module benchmark/types
 */

/**
 * A single benchmark sample from the dataset.
 */
export interface BenchmarkSample {
  /** Unique identifier for this sample */
  id: string;
  /** Tool name being called */
  tool: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Rules to evaluate against */
  rules: import('../rules/types.js').Rule[];
  /** Expected decision */
  expectedDecision: 'pass' | 'block';
  /** Expected pass weight (approximate) */
  expectedPassWeight: number;
  /** Expected block weight (approximate) */
  expectedBlockWeight: number;
  /** Source file this sample came from */
  sourceFile?: string;
  /** Category/domain of this sample */
  category?: string;
}

/**
 * Result of running a single benchmark sample.
 */
export interface BenchmarkResult {
  /** Sample that was evaluated */
  sample: BenchmarkSample;
  /** Actual decision from the kernel */
  actualDecision: 'pass' | 'block';
  /** Actual pass weight */
  actualPassWeight: number;
  /** Actual block weight */
  actualBlockWeight: number;
  /** Reasoning from the kernel */
  reasoning: string;
  /** Matched rules (if block) */
  matchedRules?: string[];
  /** Whether the decision was correct */
  correct: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Error if evaluation failed */
  error?: string;
}

/**
 * Confusion matrix for binary classification.
 */
export interface ConfusionMatrix {
  /** True Positives: expected block, actual block */
  truePositive: number;
  /** True Negatives: expected pass, actual pass */
  trueNegative: number;
  /** False Positives: expected pass, actual block */
  falsePositive: number;
  /** False Negatives: expected block, actual pass */
  falseNegative: number;
}

/**
 * Latency statistics.
 */
export interface LatencyStats {
  /** Minimum latency in ms */
  min: number;
  /** Maximum latency in ms */
  max: number;
  /** Mean latency in ms */
  mean: number;
  /** Median latency in ms */
  median: number;
  /** 95th percentile latency in ms */
  p95: number;
  /** 99th percentile latency in ms */
  p99: number;
  /** Standard deviation in ms */
  stdDev: number;
  /** Total time in ms */
  totalMs: number;
}

/**
 * Classification metrics derived from confusion matrix.
 */
export interface ClassificationMetrics {
  /** Overall accuracy */
  accuracy: number;
  /** Precision for block class (TP / (TP + FP)) */
  precision: number;
  /** Recall for block class (TP / (TP + FN)) */
  recall: number;
  /** F1 score (harmonic mean of precision and recall) */
  f1Score: number;
  /** False positive rate (FP / (FP + TN)) */
  falsePositiveRate: number;
  /** False negative rate (FN / (FN + TP)) */
  falseNegativeRate: number;
  /** Matthews Correlation Coefficient */
  mcc: number;
}

/**
 * Per-category breakdown of metrics.
 */
export interface CategoryMetrics {
  /** Category name */
  category: string;
  /** Number of samples in this category */
  sampleCount: number;
  /** Accuracy for this category */
  accuracy: number;
  /** Confusion matrix for this category */
  confusionMatrix: ConfusionMatrix;
  /** Latency stats for this category */
  latency: LatencyStats;
}

/**
 * Complete benchmark report.
 */
export interface BenchmarkReport {
  /** Timestamp when benchmark started */
  startTime: string;
  /** Timestamp when benchmark ended */
  endTime: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Model used for inference */
  model: string;
  /** Total samples evaluated */
  totalSamples: number;
  /** Samples that passed (correct) */
  correctCount: number;
  /** Samples that failed (incorrect) */
  incorrectCount: number;
  /** Samples that errored */
  errorCount: number;
  /** Overall confusion matrix */
  confusionMatrix: ConfusionMatrix;
  /** Classification metrics */
  metrics: ClassificationMetrics;
  /** Latency statistics */
  latency: LatencyStats;
  /** Per-category breakdown */
  categories: CategoryMetrics[];
  /** Individual results (optional, can be large) */
  results?: BenchmarkResult[];
  /** Incorrect predictions for analysis */
  incorrectPredictions: BenchmarkResult[];
  /** Configuration used */
  config: BenchmarkConfig;
}

/**
 * Configuration for running benchmarks.
 */
export interface BenchmarkConfig {
  /** Path to dataset files (glob pattern) */
  datasetPath: string;
  /** Maximum samples to evaluate (0 = all) */
  maxSamples: number;
  /** Whether to shuffle samples */
  shuffle: boolean;
  /** Random seed for shuffling */
  seed?: number;
  /** Whether to include individual results in report */
  includeResults: boolean;
  /** Kernel configuration */
  kernel: {
    baseUrl: string;
    model: string;
    temperature: number;
    maxTokens: number;
    timeout: number;
  };
  /** Concurrency (parallel requests) */
  concurrency: number;
  /** Output format */
  outputFormat: 'console' | 'json' | 'both';
  /** Output file path (for JSON) */
  outputPath?: string;
}

/**
 * Default benchmark configuration.
 */
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  datasetPath: 'data/batches/**/*.jsonl',
  maxSamples: 0,
  shuffle: true,
  includeResults: false,
  kernel: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'hf.co/ycaleb/veto-warden-4b-GGUF:Q4_K_M',
    temperature: 0.1,
    maxTokens: 256,
    timeout: 30000,
  },
  concurrency: 1,
  outputFormat: 'both',
};
