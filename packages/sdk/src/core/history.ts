/**
 * Tool call history tracking.
 *
 * This module manages the history of tool calls for a Veto instance,
 * providing context to validators about previous calls.
 *
 * @module core/history
 */

import type {
  ToolCallHistoryEntry,
  ValidationResult,
} from '../types/config.js';
import type { DecisionExplanation } from '../types/explanation.js';
import type { Logger } from '../utils/logger.js';

/**
 * Options for the history tracker.
 */
export interface HistoryTrackerOptions {
  /** Maximum number of entries to keep */
  maxSize: number;
  /** Logger instance */
  logger: Logger;
}

/**
 * Tracks the history of tool calls for context.
 */
export class HistoryTracker {
  private readonly entries: ToolCallHistoryEntry[] = [];
  private readonly maxSize: number;
  private readonly logger: Logger;

  constructor(options: HistoryTrackerOptions) {
    this.maxSize = options.maxSize;
    this.logger = options.logger;
  }

  /**
   * Add an entry to the history.
   *
   * If the history exceeds maxSize, the oldest entry is removed.
   *
   * @param entry - The history entry to add
   */
  add(entry: ToolCallHistoryEntry): void {
    this.entries.push(entry);

    // Remove oldest entries if we exceed max size
    while (this.entries.length > this.maxSize) {
      const removed = this.entries.shift();
      if (removed) {
        this.logger.debug('History entry evicted due to size limit', {
          evictedTool: removed.toolName,
          historySize: this.entries.length,
        });
      }
    }

    this.logger.debug('History entry added', {
      toolName: entry.toolName,
      decision: entry.validationResult.decision,
      historySize: this.entries.length,
    });
  }

  /**
   * Record a tool call in the history.
   *
   * Convenience method that creates a history entry.
   *
   * @param toolName - Name of the tool called
   * @param args - Arguments passed to the tool
   * @param result - Validation result
   * @param durationMs - Optional execution duration
   */
  record(
    toolName: string,
    args: Record<string, unknown>,
    result: ValidationResult,
    durationMs?: number,
    explanation?: DecisionExplanation
  ): void {
    const entry: ToolCallHistoryEntry = {
      toolName,
      arguments: args,
      validationResult: result,
      timestamp: new Date(),
      durationMs,
    };
    if (explanation) {
      entry.validationResult = { ...result, explanation };
    }
    this.add(entry);
  }

  /**
   * Get all history entries.
   *
   * Returns a frozen copy to prevent external modification.
   */
  getAll(): readonly ToolCallHistoryEntry[] {
    return Object.freeze([...this.entries]);
  }

  /**
   * Get the last N entries.
   *
   * @param count - Number of entries to retrieve
   */
  getLast(count: number): readonly ToolCallHistoryEntry[] {
    return Object.freeze(this.entries.slice(-count));
  }

  /**
   * Get entries for a specific tool.
   *
   * @param toolName - Name of the tool to filter by
   */
  getByTool(toolName: string): readonly ToolCallHistoryEntry[] {
    return Object.freeze(
      this.entries.filter((entry) => entry.toolName === toolName)
    );
  }

  /**
   * Get entries within a time range.
   *
   * @param since - Start of the time range
   * @param until - End of the time range (defaults to now)
   */
  getByTimeRange(
    since: Date,
    until: Date = new Date()
  ): readonly ToolCallHistoryEntry[] {
    return Object.freeze(
      this.entries.filter(
        (entry) => entry.timestamp >= since && entry.timestamp <= until
      )
    );
  }

  /**
   * Get entries that were denied.
   */
  getDenied(): readonly ToolCallHistoryEntry[] {
    return Object.freeze(
      this.entries.filter((entry) => entry.validationResult.decision === 'deny')
    );
  }

  /**
   * Get the count of entries.
   */
  size(): number {
    return this.entries.length;
  }

  /**
   * Clear all history entries.
   */
  clear(): void {
    const previousSize = this.entries.length;
    this.entries.length = 0;
    this.logger.debug('History cleared', { previousSize });
  }

  /**
   * Get statistics about the history.
   */
  getStats(): HistoryStats {
    const toolCounts: Record<string, number> = {};
    let allowedCount = 0;
    let deniedCount = 0;
    let modifiedCount = 0;

    for (const entry of this.entries) {
      toolCounts[entry.toolName] = (toolCounts[entry.toolName] ?? 0) + 1;

      switch (entry.validationResult.decision) {
        case 'allow':
          allowedCount++;
          break;
        case 'deny':
          deniedCount++;
          break;
        case 'modify':
          modifiedCount++;
          break;
      }
    }

    return {
      totalCalls: this.entries.length,
      allowedCalls: allowedCount,
      deniedCalls: deniedCount,
      modifiedCalls: modifiedCount,
      callsByTool: toolCounts,
    };
  }
}

/**
 * Statistics about tool call history.
 */
export interface HistoryStats {
  /** Total number of tool calls */
  totalCalls: number;
  /** Number of allowed calls */
  allowedCalls: number;
  /** Number of denied calls */
  deniedCalls: number;
  /** Number of modified calls */
  modifiedCalls: number;
  /** Count of calls per tool */
  callsByTool: Record<string, number>;
}
