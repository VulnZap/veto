/**
 * Policy cache with TTL and bounded memory.
 *
 * Stores compiled policies keyed by a cache key (typically tool name or
 * a hash of the rule set). Evicts least-recently-used entries when the
 * capacity is reached.
 *
 * @module wasm/cache
 */

import type { CompiledPolicy, PolicyCacheEntry } from './types.js';

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 60_000;

export interface PolicyCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
}

export class PolicyCache {
  private readonly entries = new Map<string, PolicyCacheEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private accessCounter = 0;

  constructor(options?: PolicyCacheOptions) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  get(key: string): CompiledPolicy | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }

    entry.lastUsed = ++this.accessCounter;
    entry.hitCount++;
    return entry.policy;
  }

  set(key: string, policy: CompiledPolicy): void {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      this.evictLRU();
    }

    this.entries.set(key, {
      policy,
      cachedAt: Date.now(),
      lastUsed: ++this.accessCounter,
      hitCount: 0,
    });
  }

  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.entries.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Store a policy as "last known good" for offline fallback.
   * Uses a prefixed key to separate from regular cache entries.
   */
  setLastKnownGood(key: string, policy: CompiledPolicy): void {
    const lkgKey = `__lkg__${key}`;
    const now = Date.now();
    this.entries.set(lkgKey, {
      policy,
      cachedAt: now,
      lastUsed: now,
      hitCount: 0,
    });
  }

  /**
   * Retrieve the last-known-good policy (ignores TTL).
   */
  getLastKnownGood(key: string): CompiledPolicy | undefined {
    const lkgKey = `__lkg__${key}`;
    const entry = this.entries.get(lkgKey);
    return entry?.policy;
  }

  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.entries) {
      // Never evict last-known-good entries during LRU
      if (key.startsWith('__lkg__')) continue;

      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey);
    }
  }
}
