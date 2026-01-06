import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Veto } from '../../src/core/veto.js';
import { join } from 'node:path';

describe('Rate Limiting', () => {
  const testConfigDir = join(import.meta.dirname, '../fixtures/basic-config');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow calls within rate limit', async () => {
    const veto = await Veto.init({
      configDir: testConfigDir,
      mode: 'log',
    });

    const tools = [
      {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
        handler: async () => 'ok',
      },
    ];

    const { implementations } = veto.wrapTools(tools);

    for (let i = 0; i < 10; i++) {
      await expect(implementations.test_tool({})).resolves.toBe('ok');
    }
  });

  it('should block calls exceeding rate limit', async () => {
    const veto = await Veto.init({
      configDir: testConfigDir,
      mode: 'log',
    });

    const tools = [
      {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
        handler: async () => 'ok',
      },
    ];

    const { implementations } = veto.wrapTools(tools);

    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 101; i++) {
      promises.push(implementations.test_tool({}));
    }

    await expect(Promise.all(promises)).rejects.toThrow(/Rate limit exceeded/);
  });

  it('should track rate limits per tool', async () => {
    const veto = await Veto.init({
      configDir: testConfigDir,
      mode: 'log',
    });

    const tools = [
      {
        name: 'tool_a',
        description: 'Tool A',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
        handler: async () => 'a',
      },
      {
        name: 'tool_b',
        description: 'Tool B',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
        handler: async () => 'b',
      },
    ];

    const { implementations } = veto.wrapTools(tools);

    for (let i = 0; i < 50; i++) {
      await expect(implementations.tool_a({})).resolves.toBe('a');
    }

    for (let i = 0; i < 50; i++) {
      await expect(implementations.tool_b({})).resolves.toBe('b');
    }
  });



  it('should include rate limit info in error message', async () => {
    const veto = await Veto.init({
      configDir: testConfigDir,
      mode: 'log',
    });

    const tools = [
      {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
        handler: async () => 'ok',
      },
    ];

    const { implementations } = veto.wrapTools(tools);

    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 101; i++) {
      promises.push(implementations.test_tool({}));
    }

    try {
      await Promise.all(promises);
      expect.fail('Should have thrown rate limit error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/100 validations per 60s/);
    }
  });
});
