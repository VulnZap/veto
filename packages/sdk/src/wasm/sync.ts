/**
 * Non-blocking policy synchronization.
 *
 * Fetches policy updates in the background and atomically swaps
 * the active compiled policy. Evaluations continue using the
 * previously loaded policy while a sync is in progress.
 *
 * @module wasm/sync
 */

import type { Rule } from '../rules/types.js';
import type { CompiledPolicy } from './types.js';
import { compilePolicy } from './compiler.js';
import { PolicyCache } from './cache.js';

const DEFAULT_SYNC_INTERVAL_MS = 30_000;

export interface PolicySyncConfig {
  /** URL to fetch policies from. */
  url: string;
  /** API key for authentication. */
  apiKey?: string;
  /** Sync interval in milliseconds. */
  intervalMs?: number;
  /** Callback when a new policy is loaded. */
  onUpdate?: (toolName: string, policy: CompiledPolicy) => void;
  /** Callback on sync errors. */
  onError?: (error: Error) => void;
}

export class PolicySync {
  private readonly config: PolicySyncConfig;
  private readonly cache: PolicyCache;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  constructor(config: PolicySyncConfig, cache: PolicyCache) {
    this.config = config;
    this.cache = cache;
  }

  start(): void {
    if (this.intervalHandle) return;

    const interval = this.config.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
    this.intervalHandle = setInterval(() => {
      void this.sync();
    }, interval);

    // Unref so the timer doesn't prevent process exit
    if (typeof this.intervalHandle === 'object' && 'unref' in this.intervalHandle) {
      this.intervalHandle.unref();
    }

    // Initial sync
    void this.sync();
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async sync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;

    try {
      const policies = await this.fetchPolicies();

      for (const [toolName, rules] of Object.entries(policies)) {
        const compiled = compilePolicy(rules);
        this.cache.set(toolName, compiled);
        this.cache.setLastKnownGood(toolName, compiled);
        this.config.onUpdate?.(toolName, compiled);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.config.onError?.(error);
    } finally {
      this.syncing = false;
    }
  }

  private async fetchPolicies(): Promise<Record<string, Rule[]>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['X-Veto-API-Key'] = this.config.apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(this.config.url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Policy sync failed: HTTP ${response.status}`);
      }

      return (await response.json()) as Record<string, Rule[]>;
    } finally {
      clearTimeout(timeout);
    }
  }
}
