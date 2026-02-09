/**
 * WASM Decision Engine.
 *
 * High-performance policy evaluation using compiled bytecode
 * executed in a stack-based virtual machine. Policies are compiled
 * from Rule objects into an optimized instruction format, cached,
 * and evaluated synchronously for sub-millisecond latency.
 *
 * @module wasm/engine
 */

import type { Rule } from '../rules/types.js';
import type {
  CompiledPolicy,
  EvaluationResult,
  WasmEngineConfig,
} from './types.js';
import { compilePolicy, serializePolicy, deserializePolicy } from './compiler.js';
import { evaluate } from './vm.js';
import { PolicyCache } from './cache.js';
import { PolicySync, type PolicySyncConfig } from './sync.js';

const DEFAULT_CONFIG: Required<WasmEngineConfig> = {
  maxStackDepth: 256,
  maxInstructions: 10_000,
  maxCachedPolicies: 100,
  cacheTtlMs: 60_000,
  policySyncUrl: '',
  syncIntervalMs: 30_000,
  syncApiKey: '',
};

export class WasmDecisionEngine {
  private readonly config: Required<WasmEngineConfig>;
  private readonly cache: PolicyCache;
  private sync: PolicySync | null = null;
  private initialized = false;

  constructor(config?: WasmEngineConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new PolicyCache({
      maxEntries: this.config.maxCachedPolicies,
      ttlMs: this.config.cacheTtlMs,
    });
  }

  /**
   * Initialize the engine. Starts background policy sync if configured.
   */
  init(): void {
    if (this.initialized) return;

    if (this.config.policySyncUrl) {
      const syncConfig: PolicySyncConfig = {
        url: this.config.policySyncUrl,
        apiKey: this.config.syncApiKey || undefined,
        intervalMs: this.config.syncIntervalMs,
        onError: (_err) => {
          // Sync errors are non-fatal; cached/LKG policies remain valid
        },
      };
      this.sync = new PolicySync(syncConfig, this.cache);
      this.sync.start();
    }

    this.initialized = true;
  }

  /**
   * Shut down the engine. Stops background sync.
   */
  destroy(): void {
    this.sync?.stop();
    this.sync = null;
    this.cache.clear();
    this.initialized = false;
  }

  /**
   * Compile rules into a binary policy format.
   */
  compilePolicy(rules: Rule[]): CompiledPolicy {
    return compilePolicy(rules);
  }

  /**
   * Serialize a compiled policy to an ArrayBuffer for storage.
   */
  serializePolicy(policy: CompiledPolicy): ArrayBuffer {
    return serializePolicy(policy);
  }

  /**
   * Deserialize a compiled policy from an ArrayBuffer.
   */
  deserializePolicy(buffer: ArrayBuffer): CompiledPolicy {
    return deserializePolicy(buffer);
  }

  /**
   * Load a compiled policy into the cache for a specific tool.
   */
  loadPolicy(toolName: string, policy: CompiledPolicy): void {
    this.cache.set(toolName, policy);
    this.cache.setLastKnownGood(toolName, policy);
  }

  /**
   * Compile and load rules for a specific tool.
   */
  loadRules(toolName: string, rules: Rule[]): CompiledPolicy {
    const compiled = compilePolicy(rules);
    this.loadPolicy(toolName, compiled);
    return compiled;
  }

  /**
   * Evaluate a tool call against the cached compiled policy.
   *
   * Lookup order:
   * 1. Cached compiled policy (within TTL)
   * 2. Last-known-good policy (offline fallback)
   * 3. If neither exists, returns allow
   */
  evaluate(
    toolName: string,
    args: Record<string, unknown>,
  ): EvaluationResult {
    const policy =
      this.cache.get(toolName) ??
      this.cache.getLastKnownGood(toolName);

    if (!policy) {
      return {
        decision: 'allow',
        reason: 'No compiled policy found',
        latencyNs: 0,
        matchedRules: [],
      };
    }

    return evaluate(policy, args, {
      maxStackDepth: this.config.maxStackDepth,
      maxInstructions: this.config.maxInstructions,
    });
  }

  /**
   * Compile rules and evaluate in a single call (no caching).
   * Useful for one-off evaluations or testing.
   */
  compileAndEvaluate(
    rules: Rule[],
    args: Record<string, unknown>,
  ): EvaluationResult {
    const compiled = compilePolicy(rules);
    return evaluate(compiled, args, {
      maxStackDepth: this.config.maxStackDepth,
      maxInstructions: this.config.maxInstructions,
    });
  }

  /**
   * Check if a policy is cached for a tool.
   */
  hasCachedPolicy(toolName: string): boolean {
    return this.cache.has(toolName);
  }

  /**
   * Clear the policy cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached policies.
   */
  get cachedPolicyCount(): number {
    return this.cache.size;
  }
}
