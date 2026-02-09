import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ValidationAPIClient } from '../../src/rules/api-client.js';
import type { ToolCallContext, Rule } from '../../src/rules/types.js';

const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createContext = (): ToolCallContext => ({
  call_id: 'call_123',
  tool_name: 'test_tool',
  arguments: { path: '/tmp/test.txt' },
  timestamp: new Date().toISOString(),
});

const createRule = (): Rule => ({
  id: 'rule_1',
  name: 'Test Rule',
  enabled: true,
  severity: 'high',
  action: 'block',
});

describe('ValidationAPIClient', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('default configuration', () => {
    it('uses /v1/tools/validate as the default endpoint', () => {
      new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080' },
        logger: mockLogger,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Validation API client initialized',
        expect.objectContaining({
          endpoint: '/v1/tools/validate',
        })
      );
    });

    it('allows overriding the endpoint', () => {
      new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080', endpoint: '/custom/path' },
        logger: mockLogger,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Validation API client initialized',
        expect.objectContaining({
          endpoint: '/custom/path',
        })
      );
    });
  });

  describe('authentication header', () => {
    it('sends X-Veto-API-Key header when apiKey is configured', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          should_pass_weight: 1.0,
          should_block_weight: 0.0,
          decision: 'allow',
          reasoning: 'All good',
        }), { status: 200 })
      );

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080', apiKey: 'veto_test_key_123' },
        logger: mockLogger,
      });

      await client.validate(createContext(), [createRule()]);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Veto-API-Key': 'veto_test_key_123',
          }),
        })
      );
    });

    it('does not send auth header when no apiKey is configured', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          should_pass_weight: 1.0,
          should_block_weight: 0.0,
          decision: 'allow',
          reasoning: 'All good',
        }), { status: 200 })
      );

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080' },
        logger: mockLogger,
      });

      await client.validate(createContext(), [createRule()]);

      const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
      expect(callHeaders['X-Veto-API-Key']).toBeUndefined();
      expect(callHeaders['Authorization']).toBeUndefined();
    });
  });

  describe('response parsing - canonical decisions', () => {
    it('accepts "allow" as a canonical decision', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          should_pass_weight: 1.0,
          should_block_weight: 0.0,
          decision: 'allow',
          reasoning: 'Allowed',
        }), { status: 200 })
      );

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080' },
        logger: mockLogger,
      });

      const result = await client.validate(createContext(), [createRule()]);
      expect(result.decision).toBe('allow');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('accepts "deny" as a canonical decision', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          should_pass_weight: 0.0,
          should_block_weight: 1.0,
          decision: 'deny',
          reasoning: 'Denied',
        }), { status: 200 })
      );

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080' },
        logger: mockLogger,
      });

      const result = await client.validate(createContext(), [createRule()]);
      expect(result.decision).toBe('deny');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('response parsing - legacy decisions with deprecation warning', () => {
    it('maps legacy "pass" to "allow" with deprecation warning', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          should_pass_weight: 1.0,
          should_block_weight: 0.0,
          decision: 'pass',
          reasoning: 'Passed',
        }), { status: 200 })
      );

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080' },
        logger: mockLogger,
      });

      const result = await client.validate(createContext(), [createRule()]);
      expect(result.decision).toBe('allow');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deprecation')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"pass"')
      );
    });

    it('maps legacy "block" to "deny" with deprecation warning', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          should_pass_weight: 0.0,
          should_block_weight: 1.0,
          decision: 'block',
          reasoning: 'Blocked',
        }), { status: 200 })
      );

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080' },
        logger: mockLogger,
      });

      const result = await client.validate(createContext(), [createRule()]);
      expect(result.decision).toBe('deny');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deprecation')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"block"')
      );
    });
  });

  describe('response parsing - invalid decisions', () => {
    it('throws on unrecognized decision value', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          should_pass_weight: 0.5,
          should_block_weight: 0.5,
          decision: 'maybe',
          reasoning: 'Unsure',
        }), { status: 200 })
      );

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080', retries: 0 },
        logger: mockLogger,
        failMode: 'closed',
      });

      const result = await client.validate(createContext(), [createRule()]);
      expect(result.decision).toBe('deny');
    });

    it('throws on missing decision field', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          should_pass_weight: 1.0,
          should_block_weight: 0.0,
          reasoning: 'Missing decision',
        }), { status: 200 })
      );

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080', retries: 0 },
        logger: mockLogger,
        failMode: 'closed',
      });

      const result = await client.validate(createContext(), [createRule()]);
      expect(result.decision).toBe('deny');
    });
  });

  describe('fail mode responses use canonical decisions', () => {
    it('returns "allow" decision when failing open', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080', retries: 0 },
        logger: mockLogger,
        failMode: 'open',
      });

      const result = await client.validate(createContext(), [createRule()]);
      expect(result.decision).toBe('allow');
    });

    it('returns "deny" decision when failing closed', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const client = new ValidationAPIClient({
        config: { baseUrl: 'http://localhost:8080', retries: 0 },
        logger: mockLogger,
        failMode: 'closed',
      });

      const result = await client.validate(createContext(), [createRule()]);
      expect(result.decision).toBe('deny');
    });
  });
});
