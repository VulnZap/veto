import { describe, it, expect, vi } from 'vitest';
import { BrowserUseAdapter, wrapBrowserUse } from '../../src/integrations/browser-use.js';

function createMockVeto(decision: 'allow' | 'deny' = 'allow', reason?: string) {
  return {
    validateToolCall: vi.fn().mockResolvedValue({
      allowed: decision !== 'deny',
      validationResult: { decision, reason },
      originalCall: { id: 'test', name: 'test', arguments: {} },
      finalArguments: {},
      aggregatedResult: { finalResult: { decision }, validatorResults: [], totalDurationMs: 0 },
    }),
  } as unknown as import('../../src/core/veto.js').Veto;
}

describe('BrowserUseAdapter', () => {
  describe('constructor', () => {
    it('should set default validated actions', () => {
      const veto = createMockVeto();
      const adapter = new BrowserUseAdapter(veto);

      expect(adapter.name).toBe('browser-use');
    });

    it('should accept custom validated actions', () => {
      const veto = createMockVeto();
      const adapter = new BrowserUseAdapter(veto, {
        validatedActions: new Set(['navigate', 'click']),
      });

      expect(adapter.name).toBe('browser-use');
    });
  });

  describe('wrap', () => {
    it('should throw if target has no act method', () => {
      const veto = createMockVeto();
      const adapter = new BrowserUseAdapter(veto);

      expect(() => adapter.wrap({ name: 'not-a-tools' })).toThrow(
        'Target does not have an act() method'
      );
    });

    it('should wrap act method on target', () => {
      const veto = createMockVeto();
      const adapter = new BrowserUseAdapter(veto);
      const originalAct = vi.fn().mockResolvedValue({ result: 'ok' });
      const tools = { act: originalAct };

      adapter.wrap(tools);

      expect(tools.act).not.toBe(originalAct);
    });

    it('should validate actions through act and call original on allow', async () => {
      const veto = createMockVeto('allow');
      const adapter = new BrowserUseAdapter(veto);
      const originalAct = vi.fn().mockResolvedValue({ result: 'ok' });
      const tools = { act: originalAct };

      adapter.wrap(tools);

      const action = {
        model_dump: () => ({ navigate: { url: 'https://example.com' } }),
      };
      const session = {};

      const result = await tools.act(action, session);

      expect(result).toEqual({ result: 'ok' });
      expect(originalAct).toHaveBeenCalledWith(action, session);
    });

    it('should block actions and return error on deny', async () => {
      const veto = createMockVeto('deny', 'URL blocked');
      const adapter = new BrowserUseAdapter(veto);
      const originalAct = vi.fn().mockResolvedValue({ result: 'ok' });
      const tools = { act: originalAct };

      adapter.wrap(tools);

      const action = {
        model_dump: () => ({ navigate: { url: 'javascript:alert(1)' } }),
      };

      const result = await tools.act(action, {}) as Record<string, unknown>;

      expect(result.error).toContain('Action blocked by Veto');
      expect(originalAct).not.toHaveBeenCalled();
    });

    it('should pass through actions not in validated set', async () => {
      const veto = createMockVeto('allow');
      const adapter = new BrowserUseAdapter(veto, {
        validatedActions: new Set(['navigate']),
      });
      const originalAct = vi.fn().mockResolvedValue({ result: 'ok' });
      const tools = { act: originalAct };

      adapter.wrap(tools);

      const action = {
        model_dump: () => ({ click: { selector: '#btn' } }),
      };

      await tools.act(action, {});

      expect(originalAct).toHaveBeenCalled();
      expect((veto as unknown as { validateToolCall: ReturnType<typeof vi.fn> }).validateToolCall).not.toHaveBeenCalled();
    });

    it('should handle plain object actions without model_dump', async () => {
      const veto = createMockVeto('allow');
      const adapter = new BrowserUseAdapter(veto);
      const originalAct = vi.fn().mockResolvedValue({ result: 'ok' });
      const tools = { act: originalAct };

      adapter.wrap(tools);

      const action = { navigate: { url: 'https://example.com' } };
      await tools.act(action, {});

      expect(originalAct).toHaveBeenCalled();
    });
  });
});

describe('wrapBrowserUse', () => {
  it('should return a BrowserUseAdapter', () => {
    const veto = createMockVeto();
    const adapter = wrapBrowserUse(veto);

    expect(adapter).toBeInstanceOf(BrowserUseAdapter);
    expect(adapter.name).toBe('browser-use');
  });
});
