import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Veto } from '../../src/core/veto.js';

const TEST_DIR = '/tmp/veto-test-' + Date.now();
const VETO_DIR = join(TEST_DIR, 'veto');
const RULES_DIR = join(VETO_DIR, 'rules');

// Mock fetch for API tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Veto', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Create test directory structure
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(RULES_DIR, { recursive: true });

    // Create default config
    writeFileSync(
      join(VETO_DIR, 'veto.config.yaml'),
      `
version: "1.0"
mode: "strict"
api:
  baseUrl: "http://localhost:8080"
  endpoint: "/tool/call/check"
  timeout: 5000
  retries: 0
logging:
  level: "silent"
rules:
  directory: "./rules"
`,
      'utf-8'
    );
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('init', () => {
    it('should initialize with config from directory', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });
      expect(veto).toBeInstanceOf(Veto);
    });

    it('should handle missing config gracefully', async () => {
      rmSync(join(VETO_DIR, 'veto.config.yaml'));
      const veto = await Veto.init({ configDir: VETO_DIR });
      expect(veto).toBeInstanceOf(Veto);
    });

    it('should load rules from directory', async () => {
      // Create a rule
      writeFileSync(
        join(RULES_DIR, 'test.yaml'),
        `
rules:
  - id: test-rule
    name: Test Rule
    enabled: true
    action: block
    tools: [test_tool]
`,
        'utf-8'
      );

      await Veto.init({ configDir: VETO_DIR });
      // Logic for verifying rules loaded is indirect via usage below
    });
  });

  describe('wrap', () => {
    it('should wrap tools and preserve execution', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const tools = [{
        name: 'test_tool',
        description: 'Test tool',
        handler,
        inputSchema: {}
      }];

      const veto = await Veto.init({ configDir: VETO_DIR });
      const wrapped = veto.wrap(tools);

      expect(wrapped).toHaveLength(1);
      expect(wrapped[0].name).toBe('test_tool');

      // Execute
      const result = await wrapped[0].handler({});
      expect(result).toBe('result');
      expect(handler).toHaveBeenCalled();
    });

    it('should block execution when rule matches and API blocks', async () => {
      // Setup rule
      const rulePath = join(RULES_DIR, 'block.yaml');
      writeFileSync(
        rulePath,
        `
rules:
  - id: block-rule
    name: Block Rule
    enabled: true
    action: block
    tools: [blocked_tool]
`,
        'utf-8'
      );

      // Mock API block response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          decision: 'block',
          reasoning: 'Blocked by test',
          should_block_weight: 1
        }),
      });

      const handler = vi.fn();
      const tools = [{
        name: 'blocked_tool',
        description: 'Blocked',
        handler,
        inputSchema: {}
      }];

      const veto = await Veto.init({
        configDir: VETO_DIR,
        logLevel: 'debug'
      });
      const wrapped = veto.wrap(tools);

      // Execute -> Should throw
      try {
        await wrapped[0].handler({});
        // If we reach here, fail
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Tool call denied');
      }
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('history', () => {
    it('should track allowed and blocked calls', async () => {
      // Setup: 1 allow, 1 block
      const rulePath = join(RULES_DIR, 'history-rules.yaml');
      writeFileSync(
        rulePath,
        `
rules:
  - id: block
    name: Block
    enabled: true
    action: block
    tools: [blocked_tool]
`,
        'utf-8'
      );

      // Call 1: Allow (no rules for allowed_tool)
      // Call 2: Block (rule for blocked_tool + API block)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          decision: 'block',
          reasoning: 'blocked',
          should_block_weight: 1
        })
      });

      const tools = [
        { name: 'allowed_tool', handler: async () => 'ok', inputSchema: {} },
        { name: 'blocked_tool', handler: async () => 'ok', inputSchema: {} }
      ];

      const veto = await Veto.init({ configDir: VETO_DIR, logLevel: 'debug' });
      const wrapped = veto.wrap(tools);

      await wrapped[0].handler(); // Should pass

      try {
        await wrapped[1].handler();
      } catch {
        // Expected to throw
      }

      const stats = veto.getHistoryStats();
      console.log('History stats:', stats);

      // allowed_tool allows -> 1 allowed
      // blocked_tool denies -> 1 denied
      expect(stats.totalCalls).toBe(2);
      expect(stats.allowedCalls).toBe(1);
      expect(stats.deniedCalls).toBe(1);
    });

    it('should clear history', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });
      const tools = [{ name: 't', handler: async () => 'ok', inputSchema: {} }];
      const wrapped = veto.wrap(tools);

      await wrapped[0].handler();
      expect(veto.getHistoryStats().totalCalls).toBe(1);

      veto.clearHistory();
      expect(veto.getHistoryStats().totalCalls).toBe(0);
    });
  });

  describe('Integration: Kernel Mode', () => {
    it('should use kernel client for validation', async () => {
      writeFileSync(
        join(VETO_DIR, 'veto.config.yaml'),
        `
version: "1.0"
mode: "strict"
validation:
  mode: "kernel"
logging:
  level: "debug"
rules:
  directory: "./rules"
`,
        'utf-8'
      );

      // Create rule to trigger validation
      const rulePath = join(RULES_DIR, 'k-rule.yaml');
      writeFileSync(rulePath, `
rules:
  - id: k-rule
    name: K Rule
    enabled: true
    action: block
    tools: [k_tool]
`);

      const mockKernelClient = {
        evaluate: vi.fn().mockResolvedValue({
          decision: 'block',
          reasoning: 'Kernel blocked',
          block_weight: 1.0,
          pass_weight: 0.0
        }),
        healthCheck: vi.fn().mockResolvedValue(true)
      };

      const veto = await Veto.init({
        configDir: VETO_DIR,
        kernelClient: mockKernelClient as never
      });

      const tools = [{ name: 'k_tool', handler: vi.fn(), inputSchema: {} }];
      // @ts-expect-error -- kernel client type mismatch is intentional
      const wrapped = veto.wrap(tools);

      try {
        await wrapped[0].handler({});
        expect(true).toBe(false); // Fail if no throw
      } catch (error: any) {
        expect(error.message).toContain('Kernel blocked') // Or 'Tool call denied'
      }
      expect(mockKernelClient.evaluate).toHaveBeenCalled();
    });
  });

  describe('API authentication headers', () => {
    it('should send X-Veto-API-Key header when apiKey is configured', async () => {
      // Config with apiKey
      writeFileSync(
        join(VETO_DIR, 'veto.config.yaml'),
        `
version: "1.0"
mode: "strict"
api:
  baseUrl: "http://localhost:8080"
  endpoint: "/v1/tools/validate"
  timeout: 5000
  retries: 0
  apiKey: "veto_test_key_abc123"
logging:
  level: "silent"
rules:
  directory: "./rules"
`,
        'utf-8'
      );

      // Create rule to trigger API validation
      writeFileSync(
        join(RULES_DIR, 'api-auth.yaml'),
        `
rules:
  - id: auth-test
    name: Auth Test Rule
    enabled: true
    severity: high
    action: block
    tools: [auth_tool]
`,
        'utf-8'
      );

      // Mock API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          decision: 'allow',
          reasoning: 'Allowed',
          should_pass_weight: 1.0,
          should_block_weight: 0.0
        }),
      });

      const veto = await Veto.init({ configDir: VETO_DIR });
      const tools = [{ name: 'auth_tool', handler: async () => 'ok', inputSchema: {} }];
      const wrapped = veto.wrap(tools);

      await wrapped[0].handler({});

      // Verify X-Veto-API-Key header was sent
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Veto-API-Key': 'veto_test_key_abc123',
          }),
        })
      );
    });

    it('should not send auth header when no apiKey is configured', async () => {
      // Config without apiKey
      writeFileSync(
        join(VETO_DIR, 'veto.config.yaml'),
        `
version: "1.0"
mode: "strict"
api:
  baseUrl: "http://localhost:8080"
  endpoint: "/v1/tools/validate"
  timeout: 5000
  retries: 0
logging:
  level: "silent"
rules:
  directory: "./rules"
`,
        'utf-8'
      );

      // Create rule
      writeFileSync(
        join(RULES_DIR, 'no-auth.yaml'),
        `
rules:
  - id: no-auth-test
    name: No Auth Test Rule
    enabled: true
    severity: high
    action: block
    tools: [no_auth_tool]
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          decision: 'allow',
          reasoning: 'Allowed',
          should_pass_weight: 1.0,
          should_block_weight: 0.0
        }),
      });

      const veto = await Veto.init({ configDir: VETO_DIR });
      const tools = [{ name: 'no_auth_tool', handler: async () => 'ok', inputSchema: {} }];
      const wrapped = veto.wrap(tools);

      await wrapped[0].handler({});

      // Get the headers from the fetch call
      const callHeaders = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
      expect(callHeaders['X-Veto-API-Key']).toBeUndefined();
      expect(callHeaders['Authorization']).toBeUndefined();
    });
  });

  describe('API response normalization - legacy decisions', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('should accept canonical "allow" decision without warning', async () => {
      writeFileSync(
        join(RULES_DIR, 'canonical-allow.yaml'),
        `
rules:
  - id: canonical-allow
    name: Canonical Allow
    enabled: true
    severity: high
    action: block
    tools: [canonical_tool]
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          decision: 'allow',
          reasoning: 'Canonical allow',
          should_pass_weight: 1.0,
          should_block_weight: 0.0
        }),
      });

      const veto = await Veto.init({ configDir: VETO_DIR, logLevel: 'silent' });
      const tools = [{ name: 'canonical_tool', handler: async () => 'ok', inputSchema: {} }];
      const wrapped = veto.wrap(tools);

      await wrapped[0].handler({});

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Deprecation'));
    });

    it('should map legacy "pass" to "allow" with deprecation warning', async () => {
      writeFileSync(
        join(RULES_DIR, 'legacy-pass.yaml'),
        `
rules:
  - id: legacy-pass
    name: Legacy Pass
    enabled: true
    severity: high
    action: block
    tools: [legacy_pass_tool]
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          decision: 'pass',
          reasoning: 'Legacy pass',
          should_pass_weight: 1.0,
          should_block_weight: 0.0
        }),
      });

      const veto = await Veto.init({ configDir: VETO_DIR, logLevel: 'silent' });
      const tools = [{ name: 'legacy_pass_tool', handler: async () => 'ok', inputSchema: {} }];
      const wrapped = veto.wrap(tools);

      await wrapped[0].handler({});

      // Should emit deprecation warning
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Deprecation'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"pass"'));
    });

    it('should map legacy "block" to "deny" with deprecation warning', async () => {
      writeFileSync(
        join(RULES_DIR, 'legacy-block.yaml'),
        `
rules:
  - id: legacy-block
    name: Legacy Block
    enabled: true
    severity: high
    action: block
    tools: [legacy_block_tool]
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          decision: 'block',
          reasoning: 'Legacy block',
          should_pass_weight: 0.0,
          should_block_weight: 1.0
        }),
      });

      const veto = await Veto.init({ configDir: VETO_DIR, logLevel: 'silent' });
      const tools = [{ name: 'legacy_block_tool', handler: vi.fn(), inputSchema: {} }];
      const wrapped = veto.wrap(tools);

      try {
        await wrapped[0].handler({});
        expect(true).toBe(false); // Should throw
      } catch (error: any) {
        expect(error.message).toContain('Tool call denied');
      }

      // Should emit deprecation warning
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Deprecation'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"block"'));
    });
  });
});
