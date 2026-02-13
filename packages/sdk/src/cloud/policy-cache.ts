import type { VetoCloudClient } from './client.js';
import type { DeterministicPolicy } from '../deterministic/types.js';

interface CacheEntry {
  policy: DeterministicPolicy;
  staleAt: number;
  expiredAt: number;
}

export class PolicyCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly refreshing = new Set<string>();

  constructor(
    private readonly client: VetoCloudClient,
    private readonly freshMs = 60_000,
    private readonly maxMs = 300_000
  ) {}

  get(toolName: string): DeterministicPolicy | null {
    const entry = this.cache.get(toolName);
    const now = Date.now();

    if (!entry) {
      this.backgroundRefresh(toolName);
      return null;
    }

    if (now < entry.staleAt) {
      return entry.policy;
    }

    if (now < entry.expiredAt) {
      this.backgroundRefresh(toolName);
      return entry.policy;
    }

    this.backgroundRefresh(toolName);
    return null;
  }

  invalidate(toolName: string): void {
    this.cache.delete(toolName);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  private backgroundRefresh(toolName: string): void {
    if (this.refreshing.has(toolName)) return;

    this.refreshing.add(toolName);
    // Defer to macrotask to avoid interfering with the current validation's fetch
    setTimeout(() => {
      this.client.fetchPolicy(toolName)
        .then((response) => {
          if (!response) return;

          const now = Date.now();
          const policy: DeterministicPolicy = {
            toolName: response.toolName,
            mode: response.mode,
            constraints: response.constraints ?? [],
            hasSessionConstraints: response.sessionConstraints != null,
            hasRateLimits: response.rateLimits != null,
            version: response.version,
            fetchedAt: now,
          };

          this.cache.set(toolName, {
            policy,
            staleAt: now + this.freshMs,
            expiredAt: now + this.maxMs,
          });
        })
        .catch(() => {
          // Background refresh failed — will retry on next cache access
        })
        .finally(() => this.refreshing.delete(toolName));
    }, 0);
  }
}
