import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationAPIClient } from '../../src/rules/api-client.js';
import type { ToolCallContext, Rule, ValidationAPIResponse } from '../../src/rules/types.js';

const mockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const mockContext: ToolCallContext = {
  call_id: 'call_1',
  tool_name: 'test_tool',
  arguments: { key: 'value' },
  timestamp: new Date().toISOString(),
};

const mockRules: Rule[] = [
  {
    id: 'r1',
    name: 'Test Rule',
    description: 'test',
    enabled: true,
    tools: ['test_tool'],
    conditions: [],
    action: { type: 'block' },
    severity: 'high',
  },
];

const validResponse: ValidationAPIResponse = {
  should_pass_weight: 1.0,
  should_block_weight: 0.0,
  decision: 'pass',
  reasoning: 'Allowed',
};

const noSleep = async () => {};

describe('ValidationAPIClient resilience integration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  function createClient(overrides: Record<string, unknown> = {}) {
    return new ValidationAPIClient({
      config: { baseUrl: 'http://api.test' },
      logger: mockLogger(),
      sleepFn: noSleep,
      jitterFn: () => 1,
      ...overrides,
    });
  }

  describe('deadline budget', () => {
    it('uses configured deadline for requests', () => {
      const client = createClient({
        resilience: { deadlineMs: 2000 },
      });

      fetchMock.mockImplementation((_url: string, opts: RequestInit) => {
        expect(opts.signal).toBeDefined();
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(validResponse),
        });
      });

      return client.validate(mockContext, mockRules);
    });

    it('defaults to 5000ms deadline', () => {
      const client = createClient();

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validResponse),
      });

      return client.validate(mockContext, mockRules);
    });
  });

  describe('retry behavior', () => {
    it('retries on server error then succeeds', async () => {
      const client = createClient({
        resilience: { retry: { maxAttempts: 3 } },
      });

      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('error') })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(validResponse),
        });

      const result = await client.validate(mockContext, mockRules);
      expect(result.decision).toBe('pass');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 400 Bad Request', async () => {
      const client = createClient({
        resilience: {
          retry: { maxAttempts: 3 },
          failMode: 'fail-closed',
        },
      });

      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('bad request'),
      });

      const result = await client.validate(mockContext, mockRules);
      expect(result.decision).toBe('block');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 401 Unauthorized', async () => {
      const client = createClient({
        resilience: {
          retry: { maxAttempts: 3 },
          failMode: 'fail-closed',
        },
      });

      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('unauthorized'),
      });

      const result = await client.validate(mockContext, mockRules);
      expect(result.decision).toBe('block');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 Too Many Requests', async () => {
      const client = createClient({
        resilience: { retry: { maxAttempts: 3 } },
      });

      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 429, text: () => Promise.resolve('rate limited') })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(validResponse),
        });

      const result = await client.validate(mockContext, mockRules);
      expect(result.decision).toBe('pass');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('circuit breaker', () => {
    it('opens after reaching failure threshold', async () => {
      const client = createClient({
        resilience: {
          circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 60000 },
          retry: { maxAttempts: 1 },
          failMode: 'fail-closed',
        },
      });

      fetchMock.mockRejectedValue(new Error('network error'));

      await client.validate(mockContext, mockRules);
      await client.validate(mockContext, mockRules);

      const cb = client.getCircuitBreaker();
      expect(cb.getState()).toBe('open');

      fetchMock.mockClear();
      const result = await client.validate(mockContext, mockRules);

      expect(result.decision).toBe('block');
      expect(result.reasoning).toContain('Circuit breaker is open');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows probe request in half-open state', async () => {
      let now = 1000;
      let shouldFail = true;

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://api.test' },
        logger: mockLogger(),
        sleepFn: noSleep,
        jitterFn: () => 1,
        resilience: {
          circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 500 },
          retry: { maxAttempts: 1 },
          failMode: 'fail-closed',
        },
        clock: () => now,
      });

      fetchMock.mockImplementation(() => {
        if (shouldFail) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(validResponse),
        });
      });

      await client.validate(mockContext, mockRules);

      const cb = client.getCircuitBreaker();
      expect(cb.getState()).toBe('open');

      now = 2000;
      shouldFail = false;
      expect(cb.getState()).toBe('half-open');

      const result = await client.validate(mockContext, mockRules);
      expect(result.decision).toBe('pass');
      expect(cb.getState()).toBe('closed');
    });
  });

  describe('fail mode', () => {
    it('fail-closed returns block on exhausted retries', async () => {
      const client = createClient({
        resilience: {
          failMode: 'fail-closed',
          retry: { maxAttempts: 1 },
        },
      });

      fetchMock.mockRejectedValue(new Error('down'));

      const result = await client.validate(mockContext, mockRules);
      expect(result.decision).toBe('block');
      expect(result.should_block_weight).toBe(1.0);
    });

    it('fail-open returns pass on exhausted retries', async () => {
      const client = createClient({
        resilience: {
          failMode: 'fail-open',
          retry: { maxAttempts: 1 },
        },
      });

      fetchMock.mockRejectedValue(new Error('down'));

      const result = await client.validate(mockContext, mockRules);
      expect(result.decision).toBe('pass');
      expect(result.should_pass_weight).toBe(1.0);
    });

    it('fail-closed is the default', async () => {
      const client = createClient({
        resilience: { retry: { maxAttempts: 1 } },
      });

      fetchMock.mockRejectedValue(new Error('down'));

      const result = await client.validate(mockContext, mockRules);
      expect(result.decision).toBe('block');
    });

    it('respects legacy failMode option for backward compat', async () => {
      const client = createClient({
        failMode: 'open',
        resilience: { retry: { maxAttempts: 1 } },
      });

      fetchMock.mockRejectedValue(new Error('down'));

      const result = await client.validate(mockContext, mockRules);
      expect(result.decision).toBe('pass');
    });

    it('resilience.failMode overrides legacy failMode', async () => {
      const client = createClient({
        failMode: 'open',
        resilience: { failMode: 'fail-closed', retry: { maxAttempts: 1 } },
      });

      fetchMock.mockRejectedValue(new Error('down'));

      const result = await client.validate(mockContext, mockRules);
      expect(result.decision).toBe('block');
    });
  });

  describe('metrics', () => {
    it('records success in circuit breaker metrics', async () => {
      const client = createClient();

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validResponse),
      });

      await client.validate(mockContext, mockRules);

      const m = client.getCircuitBreaker().getMetrics();
      expect(m.successCount).toBe(1);
      expect(m.failureCount).toBe(0);
    });

    it('records failure in circuit breaker metrics', async () => {
      const client = createClient({
        resilience: { retry: { maxAttempts: 1 } },
      });

      fetchMock.mockRejectedValue(new Error('fail'));

      await client.validate(mockContext, mockRules);

      const m = client.getCircuitBreaker().getMetrics();
      expect(m.failureCount).toBe(1);
    });

    it('tracks total trips', async () => {
      let now = 1000;
      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://api.test' },
        logger: mockLogger(),
        sleepFn: noSleep,
        jitterFn: () => 1,
        resilience: {
          circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 100 },
          retry: { maxAttempts: 1 },
          failMode: 'fail-closed',
        },
        clock: () => now,
      });

      fetchMock.mockImplementation(() => Promise.reject(new Error('fail')));

      // Trip 1: failure -> open
      await client.validate(mockContext, mockRules);
      expect(client.getCircuitBreaker().getMetrics().totalTrips).toBe(1);

      // Advance past reset timeout to half-open
      now = 1200;
      expect(client.getCircuitBreaker().getState()).toBe('half-open');

      // Trip 2: half-open probe fails -> open again
      await client.validate(mockContext, mockRules);
      expect(client.getCircuitBreaker().getMetrics().totalTrips).toBe(2);
    });
  });
});
