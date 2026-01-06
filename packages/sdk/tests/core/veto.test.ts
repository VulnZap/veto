import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Veto, ToolCallDeniedError } from '../../src/core/veto.js';
import { RuleSchemaError } from '../../src/rules/types.js';
import type { ToolDefinition, ToolCall } from '../../src/types/tool.js';

const TEST_DIR = '/tmp/veto-test-' + Date.now();
const VETO_DIR = join(TEST_DIR, 'veto');
const RULES_DIR = join(VETO_DIR, 'rules');

const sampleTools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a file',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
];

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

    it('should load rules from rules directory', async () => {
      writeFileSync(
        join(RULES_DIR, 'test.yaml'),
        `
rules:
  - id: test-rule
    name: Test Rule
    enabled: true
    severity: high
    action: block
    tools:
      - read_file
    conditions:
      - field: arguments.path
        operator: starts_with
        value: /etc
`,
        'utf-8'
      );

      const veto = await Veto.init({ configDir: VETO_DIR });

      const rules = veto.getLoadedRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('test-rule');
    });

    it('should handle missing config gracefully', async () => {
      rmSync(join(VETO_DIR, 'veto.config.yaml'));

      const veto = await Veto.init({ configDir: VETO_DIR });

      expect(veto).toBeInstanceOf(Veto);
    });

    it('should override config with options', async () => {
      const veto = await Veto.init({
        configDir: VETO_DIR,
        mode: 'log',
        logLevel: 'silent',
      });

      expect(veto).toBeInstanceOf(Veto);
      expect(veto.getMode()).toBe('log');
    });

    it('should load rules from single rule file', async () => {
      writeFileSync(
        join(RULES_DIR, 'single.yaml'),
        `
id: single-rule
name: Single Rule
enabled: true
severity: medium
action: warn
`,
        'utf-8'
      );

      const veto = await Veto.init({ configDir: VETO_DIR });

      const rules = veto.getLoadedRules();
      expect(rules.some((r) => r.id === 'single-rule')).toBe(true);
    });

    it('should skip disabled rules', async () => {
      writeFileSync(
        join(RULES_DIR, 'disabled.yaml'),
        `
rules:
  - id: disabled-rule
    name: Disabled Rule
    enabled: false
    severity: low
    action: log
`,
        'utf-8'
      );

      const veto = await Veto.init({ configDir: VETO_DIR });

      const rules = veto.getLoadedRules();
      expect(rules.some((r) => r.id === 'disabled-rule')).toBe(false);
    });

    it('should return mode from config', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });

      expect(veto.getMode()).toBe('strict');
    });

    it('should allow mode override from options', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR, mode: 'log' });

      expect(veto.getMode()).toBe('log');
    });

    it('should throw RuleSchemaError for invalid rule YAML', async () => {
      writeFileSync(
        join(RULES_DIR, 'invalid.yaml'),
        `
rules:
  - id: invalid-rule
    name: Invalid Rule
    enabled: true
    severity: invalid_severity
    action: block
`,
        'utf-8'
      );

      await expect(Veto.init({ configDir: VETO_DIR })).rejects.toThrow(
        'Invalid severity'
      );
    });

    it('should throw RuleSchemaError for missing required fields', async () => {
      writeFileSync(
        join(RULES_DIR, 'missing-fields.yaml'),
        `
rules:
  - name: Missing ID Rule
    enabled: true
`,
        'utf-8'
      );

      await expect(Veto.init({ configDir: VETO_DIR })).rejects.toThrow(
        'Invalid id'
      );
    });

    it('should throw RuleSchemaError for invalid condition operator', async () => {
      writeFileSync(
        join(RULES_DIR, 'invalid-operator.yaml'),
        `
rules:
  - id: invalid-operator-rule
    name: Invalid Operator Rule
    enabled: true
    severity: high
    action: block
    conditions:
      - field: arguments.path
        operator: invalid_operator
        value: /etc
`,
        'utf-8'
      );

      await expect(Veto.init({ configDir: VETO_DIR })).rejects.toThrow(
        'Invalid operator'
      );
    });
  });

  describe('wrapTools', () => {
    it('should return definitions and implementations', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const tools = [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: { type: 'object' as const },
          handler,
        },
      ];

      const veto = await Veto.init({ configDir: VETO_DIR });
      const { definitions, implementations } = veto.wrapTools(tools);

      // Definitions should not have handlers
      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe('test_tool');
      expect((definitions[0] as Record<string, unknown>).handler).toBeUndefined();

      // Implementations should have the wrapped handler
      expect(implementations).toHaveProperty('test_tool');
      expect(typeof implementations.test_tool).toBe('function');
    });

    it('should track registered tools', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });

      veto.wrapTools(sampleTools);

      const registered = veto.getRegisteredTools();
      expect(registered).toHaveLength(2);
    });

    it('should wrap handlers with automatic validation', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      const executableTools = [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: { type: 'object' as const },
          handler,
        },
      ];

      const veto = await Veto.init({ configDir: VETO_DIR });
      const { implementations } = veto.wrapTools(executableTools);

      // Execute - should call original handler (no rules = allowed)
      const result = await implementations.test_tool({ test: 'value' });

      expect(result).toBe('result');
      expect(handler).toHaveBeenCalledWith({ test: 'value' });
    });

    it('should block execution when validation fails', async () => {
      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: block-test
    name: Block Test
    enabled: true
    severity: critical
    action: block
    tools:
      - blocked_tool
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          should_pass_weight: 0,
          should_block_weight: 1,
          decision: 'block',
          reasoning: 'Blocked by rule',
        }),
      });

      const handler = vi.fn().mockResolvedValue('result');
      const executableTools = [
        {
          name: 'blocked_tool',
          description: 'Blocked tool',
          inputSchema: { type: 'object' as const },
          handler,
        },
      ];

      const veto = await Veto.init({ configDir: VETO_DIR });
      const { implementations } = veto.wrapTools(executableTools);

      // Execute - should throw ToolCallDeniedError
      await expect(implementations.blocked_tool({ test: 'value' })).rejects.toThrow(
        ToolCallDeniedError
      );

      // Original handler should not be called
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return empty implementations for tools without handlers', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });
      const { definitions, implementations } = veto.wrapTools(sampleTools);

      expect(definitions).toHaveLength(2);
      expect(Object.keys(implementations)).toHaveLength(0);
    });
  });

  describe('validateToolCall', () => {
    it('should allow calls when API returns pass', async () => {
      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: test
    name: Test
    enabled: true
    severity: high
    action: block
    tools:
      - read_file
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          should_pass_weight: 0.9,
          should_block_weight: 0.1,
          decision: 'pass',
          reasoning: 'Allowed by policy',
        }),
      });

      const veto = await Veto.init({ configDir: VETO_DIR });
      veto.wrapTools(sampleTools);

      const result = await veto.validateToolCall({
        id: 'call_1',
        name: 'read_file',
        arguments: { path: '/home/user/file.txt' },
      });

      expect(result.allowed).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should deny calls when API returns block', async () => {
      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: block-etc
    name: Block etc
    enabled: true
    severity: critical
    action: block
    tools:
      - read_file
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          should_pass_weight: 0.1,
          should_block_weight: 0.9,
          decision: 'block',
          reasoning: 'Access to /etc is blocked',
        }),
      });

      const veto = await Veto.init({ configDir: VETO_DIR });
      veto.wrapTools(sampleTools);

      const result = await veto.validateToolCall({
        id: 'call_2',
        name: 'read_file',
        arguments: { path: '/etc/passwd' },
      });

      expect(result.allowed).toBe(false);
      expect(result.validationResult.reason).toBe('Access to /etc is blocked');
    });

    it('should allow calls with no matching rules', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });
      veto.wrapTools(sampleTools);

      const result = await veto.validateToolCall({
        id: 'call_3',
        name: 'read_file',
        arguments: { path: '/test.txt' },
      });

      expect(result.allowed).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fail closed when API fails', async () => {
      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: test
    name: Test
    enabled: true
    severity: high
    action: block
`,
        'utf-8'
      );

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const veto = await Veto.init({ configDir: VETO_DIR });

      const result = await veto.validateToolCall({
        id: 'call_4',
        name: 'read_file',
        arguments: { path: '/test.txt' },
      });

      expect(result.allowed).toBe(false);
      expect(result.validationResult.reason).toContain('API unavailable');
    });

    it('should allow in log mode when API blocks', async () => {
      writeFileSync(
        join(VETO_DIR, 'veto.config.yaml'),
        `
version: "1.0"
mode: "log"
api:
  baseUrl: "http://localhost:8080"
  retries: 0
logging:
  level: "silent"
`,
        'utf-8'
      );

      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: test
    name: Test
    enabled: true
    severity: high
    action: block
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          should_pass_weight: 0.1,
          should_block_weight: 0.9,
          decision: 'block',
          reasoning: 'Blocked by policy',
        }),
      });

      const veto = await Veto.init({ configDir: VETO_DIR });

      const result = await veto.validateToolCall({
        id: 'call_5',
        name: 'read_file',
        arguments: { path: '/test.txt' },
      });

      expect(result.allowed).toBe(true);
      expect(result.validationResult.reason).toContain('LOG MODE');
      expect(result.validationResult.metadata?.blocked_in_strict_mode).toBe(true);
    });

    it('should allow in log mode when API fails', async () => {
      writeFileSync(
        join(VETO_DIR, 'veto.config.yaml'),
        `
version: "1.0"
mode: "log"
api:
  baseUrl: "http://localhost:8080"
  retries: 0
logging:
  level: "silent"
`,
        'utf-8'
      );

      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: test
    name: Test
    enabled: true
    severity: high
    action: block
`,
        'utf-8'
      );

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const veto = await Veto.init({ configDir: VETO_DIR });

      const result = await veto.validateToolCall({
        id: 'call_6',
        name: 'read_file',
        arguments: { path: '/test.txt' },
      });

      expect(result.allowed).toBe(true);
      expect(result.validationResult.reason).toContain('API unavailable');
    });

    it('should generate call ID if not provided', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });

      const result = await veto.validateToolCall({
        name: 'read_file',
        arguments: {},
      });

      // The original call preserves the undefined id, but internally one is generated
      expect(result.allowed).toBe(true);
    });
  });

  describe('validateToolCallOrThrow', () => {
    it('should throw when call is denied', async () => {
      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: block-all
    name: Block All
    enabled: true
    severity: critical
    action: block
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          should_pass_weight: 0,
          should_block_weight: 1,
          decision: 'block',
          reasoning: 'Blocked',
        }),
      });

      const veto = await Veto.init({ configDir: VETO_DIR });

      await expect(
        veto.validateToolCallOrThrow({
          id: 'call_throw',
          name: 'read_file',
          arguments: {},
        })
      ).rejects.toThrow(ToolCallDeniedError);
    });

    it('should return result when allowed', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });

      const result = await veto.validateToolCallOrThrow({
        id: 'call_ok',
        name: 'read_file',
        arguments: {},
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('history tracking', () => {
    it('should track call history', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });

      await veto.validateToolCall({ id: 'call_1', name: 'read_file', arguments: {} });
      await veto.validateToolCall({ id: 'call_2', name: 'write_file', arguments: {} });

      const stats = veto.getHistoryStats();
      expect(stats.totalCalls).toBe(2);
    });

    it('should clear history', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });

      await veto.validateToolCall({ id: 'call_1', name: 'read_file', arguments: {} });

      veto.clearHistory();

      const stats = veto.getHistoryStats();
      expect(stats.totalCalls).toBe(0);
    });
  });

  describe('API request', () => {
    it('should send correct payload to API', async () => {
      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: test-rule
    name: Test Rule
    enabled: true
    severity: high
    action: block
    tools:
      - read_file
    conditions:
      - field: arguments.path
        operator: starts_with
        value: /etc
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          should_pass_weight: 1,
          should_block_weight: 0,
          decision: 'pass',
          reasoning: 'OK',
        }),
      });

      const veto = await Veto.init({ configDir: VETO_DIR });

      await veto.validateToolCall({
        id: 'call_api',
        name: 'read_file',
        arguments: { path: '/test' },
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('http://localhost:8080/tool/call/check');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.context.tool_name).toBe('read_file');
      expect(body.context.arguments).toEqual({ path: '/test' });
      expect(body.rules).toHaveLength(1);
      expect(body.rules[0].id).toBe('test-rule');
    });

    it('should handle non-OK API responses', async () => {
      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: test
    name: Test
    enabled: true
    severity: high
    action: block
`,
        'utf-8'
      );

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const veto = await Veto.init({ configDir: VETO_DIR });

      const result = await veto.validateToolCall({
        id: 'call_500',
        name: 'read_file',
        arguments: {},
      });

      expect(result.allowed).toBe(false);
      expect(result.validationResult.reason).toContain('API unavailable');
    });
  });

  describe('kernel mode', () => {
    it('should use kernel for validation when mode is kernel', async () => {
      writeFileSync(
        join(VETO_DIR, 'veto.config.yaml'),
        `
version: "1.0"
mode: "strict"
validation:
  mode: "kernel"
kernel:
  baseUrl: "http://localhost:11434/v1"
  model: "veto-warden:latest"
  temperature: 0.1
logging:
  level: "silent"
rules:
  directory: "./rules"
`,
        'utf-8'
      );

      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: block-etc
    name: Block etc
    enabled: true
    severity: critical
    action: block
    tools:
      - read_file
    conditions:
      - field: arguments.path
        operator: starts_with
        value: /etc
`,
        'utf-8'
      );

      // Mock kernel client response
      const mockKernelResponse = {
        pass_weight: 0.02,
        block_weight: 0.98,
        decision: 'block',
        reasoning: 'Access to /etc blocked',
        matched_rules: ['block-etc'],
      };

      const mockKernelClient = {
        evaluate: vi.fn().mockResolvedValue(mockKernelResponse),
        healthCheck: vi.fn().mockResolvedValue(true),
      };

      const veto = await Veto.init({
        configDir: VETO_DIR,
        kernelClient: mockKernelClient as never,
      });

      const result = await veto.validateToolCall({
        id: 'call_kernel',
        name: 'read_file',
        arguments: { path: '/etc/passwd' },
      });

      expect(result.allowed).toBe(false);
      expect(result.validationResult.reason).toBe('Access to /etc blocked');
      expect(mockKernelClient.evaluate).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should allow calls when kernel returns pass', async () => {
      writeFileSync(
        join(VETO_DIR, 'veto.config.yaml'),
        `
version: "1.0"
mode: "strict"
validation:
  mode: "kernel"
kernel:
  baseUrl: "http://localhost:11434/v1"
  model: "veto-warden:latest"
logging:
  level: "silent"
rules:
  directory: "./rules"
`,
        'utf-8'
      );

      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: block-etc
    name: Block etc
    enabled: true
    severity: critical
    action: block
    tools:
      - read_file
`,
        'utf-8'
      );

      const mockKernelResponse = {
        pass_weight: 0.95,
        block_weight: 0.05,
        decision: 'pass',
        reasoning: 'Safe file access',
      };

      const mockKernelClient = {
        evaluate: vi.fn().mockResolvedValue(mockKernelResponse),
        healthCheck: vi.fn().mockResolvedValue(true),
      };

      const veto = await Veto.init({
        configDir: VETO_DIR,
        kernelClient: mockKernelClient as never,
      });

      const result = await veto.validateToolCall({
        id: 'call_safe',
        name: 'read_file',
        arguments: { path: '/home/user/file.txt' },
      });

      expect(result.allowed).toBe(true);
    });

    it('should block when kernel fails in strict mode', async () => {
      writeFileSync(
        join(VETO_DIR, 'veto.config.yaml'),
        `
version: "1.0"
mode: "strict"
validation:
  mode: "kernel"
kernel:
  baseUrl: "http://localhost:11434/v1"
  model: "veto-warden:latest"
logging:
  level: "silent"
rules:
  directory: "./rules"
`,
        'utf-8'
      );

      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: test
    name: Test
    enabled: true
    severity: high
    action: block
`,
        'utf-8'
      );

      const mockKernelClient = {
        evaluate: vi.fn().mockRejectedValue(new Error('Kernel unavailable')),
        healthCheck: vi.fn().mockResolvedValue(false),
      };

      const veto = await Veto.init({
        configDir: VETO_DIR,
        kernelClient: mockKernelClient as never,
      });

      const result = await veto.validateToolCall({
        id: 'call_fail',
        name: 'read_file',
        arguments: { path: '/test.txt' },
      });

      expect(result.allowed).toBe(false);
      expect(result.validationResult.reason).toContain('Kernel');
    });

    it('should allow when kernel fails in log mode', async () => {
      writeFileSync(
        join(VETO_DIR, 'veto.config.yaml'),
        `
version: "1.0"
mode: "log"
validation:
  mode: "kernel"
kernel:
  baseUrl: "http://localhost:11434/v1"
  model: "veto-warden:latest"
logging:
  level: "silent"
rules:
  directory: "./rules"
`,
        'utf-8'
      );

      writeFileSync(
        join(RULES_DIR, 'rule.yaml'),
        `
rules:
  - id: test
    name: Test
    enabled: true
    severity: high
    action: block
`,
        'utf-8'
      );

      const mockKernelClient = {
        evaluate: vi.fn().mockRejectedValue(new Error('Kernel unavailable')),
        healthCheck: vi.fn().mockResolvedValue(false),
      };

      const veto = await Veto.init({
        configDir: VETO_DIR,
        kernelClient: mockKernelClient as never,
      });

      const result = await veto.validateToolCall({
        id: 'call_log',
        name: 'read_file',
        arguments: { path: '/test.txt' },
      });

      expect(result.allowed).toBe(true);
      expect(result.validationResult.reason).toContain('Kernel');
    });

    it('should return validation mode from getter', async () => {
      writeFileSync(
        join(VETO_DIR, 'veto.config.yaml'),
        `
version: "1.0"
mode: "strict"
validation:
  mode: "kernel"
kernel:
  baseUrl: "http://localhost:11434/v1"
  model: "veto-warden:latest"
logging:
  level: "silent"
`,
        'utf-8'
      );

      const veto = await Veto.init({ configDir: VETO_DIR });

      expect(veto.getValidationMode()).toBe('kernel');
    });

    it('should default to api mode when validation.mode not specified', async () => {
      const veto = await Veto.init({ configDir: VETO_DIR });

      expect(veto.getValidationMode()).toBe('api');
    });
  });
});
