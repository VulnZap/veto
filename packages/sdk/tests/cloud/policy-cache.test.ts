import { describe, it, expect, vi } from 'vitest';
import { PolicyCache } from '../../src/cloud/policy-cache.js';
import type { CloudPolicyResponse } from '../../src/cloud/types.js';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function makeMockClient(response: CloudPolicyResponse | null = null) {
  return {
    fetchPolicy: vi.fn().mockResolvedValue(response),
    logDecision: vi.fn(),
  } as any;
}

const deterministicPolicy: CloudPolicyResponse = {
  toolName: 'send_email',
  mode: 'deterministic',
  constraints: [{ argumentName: 'to', enabled: true, regex: '^[^@]+@[^@]+$' }],
  version: 1,
};

const llmPolicy: CloudPolicyResponse = {
  toolName: 'execute_trade',
  mode: 'llm',
  constraints: [],
  version: 1,
};

const policyWithRateLimits: CloudPolicyResponse = {
  ...deterministicPolicy,
  rateLimits: { callLimits: [{ maxCalls: 10, windowSeconds: 60 }] },
};

describe('PolicyCache', () => {
  it('should return null on cache miss', () => {
    const client = makeMockClient(deterministicPolicy);
    const cache = new PolicyCache(client);
    expect(cache.get('send_email')).toBeNull();
  });

  it('should return cached policy after background fetch completes', async () => {
    const client = makeMockClient(deterministicPolicy);
    const cache = new PolicyCache(client);

    cache.get('send_email'); // triggers background fetch
    await wait(50); // wait for setTimeout(0) + async fetchPolicy

    const result = cache.get('send_email');
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe('send_email');
    expect(result!.mode).toBe('deterministic');
    expect(result!.constraints).toHaveLength(1);
  });

  it('should cache LLM policies', async () => {
    const client = makeMockClient(llmPolicy);
    const cache = new PolicyCache(client);

    cache.get('execute_trade');
    await wait(50);

    const result = cache.get('execute_trade');
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('llm');
  });

  it('should detect policies with rate limits', async () => {
    const client = makeMockClient(policyWithRateLimits);
    const cache = new PolicyCache(client);

    cache.get('send_email');
    await wait(50);

    const result = cache.get('send_email');
    expect(result).not.toBeNull();
    expect(result!.hasRateLimits).toBe(true);
  });

  it('should detect policies with session constraints', async () => {
    const policy: CloudPolicyResponse = {
      ...deterministicPolicy,
      sessionConstraints: { maxCalls: 5 },
    };
    const client = makeMockClient(policy);
    const cache = new PolicyCache(client);

    cache.get('send_email');
    await wait(50);

    const result = cache.get('send_email');
    expect(result!.hasSessionConstraints).toBe(true);
  });

  it('should return stale value and trigger background refresh', async () => {
    const client = makeMockClient(deterministicPolicy);
    const cache = new PolicyCache(client, 50, 500); // 50ms fresh, 500ms max

    cache.get('send_email');
    await wait(50);
    expect(cache.get('send_email')).not.toBeNull();

    // Wait past fresh time
    await wait(100);
    client.fetchPolicy.mockClear();

    const result = cache.get('send_email');
    expect(result).not.toBeNull(); // returns stale value
    await wait(50); // background refresh fires
    expect(client.fetchPolicy).toHaveBeenCalledTimes(1);
  });

  it('should return null when cache is fully expired', async () => {
    const client = makeMockClient(deterministicPolicy);
    const cache = new PolicyCache(client, 100, 200); // 100ms fresh, 200ms max

    cache.get('send_email');
    await wait(50);
    expect(cache.get('send_email')).not.toBeNull();

    await wait(300); // well past max time (200ms)
    const result = cache.get('send_email');
    expect(result).toBeNull();
  });

  it('should handle fetch failure gracefully', async () => {
    const client = makeMockClient(null); // returns null
    const cache = new PolicyCache(client);

    cache.get('nonexistent');
    await wait(50);

    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should invalidate specific tool', async () => {
    const client = makeMockClient(deterministicPolicy);
    const cache = new PolicyCache(client);

    cache.get('send_email');
    await wait(50);
    expect(cache.get('send_email')).not.toBeNull();

    cache.invalidate('send_email');
    expect(cache.get('send_email')).toBeNull();
  });

  it('should invalidate all tools', async () => {
    const client = makeMockClient(deterministicPolicy);
    const cache = new PolicyCache(client);

    cache.get('send_email');
    await wait(50);
    expect(cache.get('send_email')).not.toBeNull();

    cache.invalidateAll();
    expect(cache.get('send_email')).toBeNull();
  });

  it('should not duplicate concurrent refreshes', async () => {
    const client = makeMockClient(deterministicPolicy);
    const cache = new PolicyCache(client);

    cache.get('send_email');
    cache.get('send_email');
    cache.get('send_email');

    await wait(50);
    expect(client.fetchPolicy).toHaveBeenCalledTimes(1);
  });
});
