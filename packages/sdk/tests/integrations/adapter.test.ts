import { describe, it, expect, vi } from 'vitest';
import { BaseBrowserAdapter, BrowserActionDeniedError } from '../../src/integrations/adapter.js';
import type { BrowserAction } from '../../src/integrations/types.js';

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

describe('BaseBrowserAdapter', () => {
  describe('intercept', () => {
    it('should allow actions when validation passes', async () => {
      const veto = createMockVeto('allow');
      const adapter = new BaseBrowserAdapter('test', veto);

      const action: BrowserAction = { type: 'navigate', params: { url: 'https://example.com' } };
      const result = await adapter.intercept(action);

      expect(result.allowed).toBe(true);
      expect(result.action).toEqual(action);
    });

    it('should deny actions when validation fails', async () => {
      const veto = createMockVeto('deny', 'blocked by policy');
      const adapter = new BaseBrowserAdapter('test', veto);

      const action: BrowserAction = { type: 'navigate', params: { url: 'javascript:alert(1)' } };
      const result = await adapter.intercept(action);

      expect(result.allowed).toBe(false);
      expect(result.validationResult.reason).toBe('blocked by policy');
    });

    it('should call onAllow callback when allowed', async () => {
      const onAllow = vi.fn();
      const veto = createMockVeto('allow');
      const adapter = new BaseBrowserAdapter('test', veto, { onAllow });

      const action: BrowserAction = { type: 'click', params: { selector: '#btn' } };
      await adapter.intercept(action);

      expect(onAllow).toHaveBeenCalledWith(action);
    });

    it('should call onDeny callback when denied', async () => {
      const onDeny = vi.fn();
      const veto = createMockVeto('deny', 'blocked');
      const adapter = new BaseBrowserAdapter('test', veto, { onDeny });

      const action: BrowserAction = { type: 'navigate', params: { url: 'data:text/html' } };
      await adapter.intercept(action);

      expect(onDeny).toHaveBeenCalledWith(action, 'blocked');
    });

    it('should map action type to browser.* tool name', async () => {
      const veto = createMockVeto('allow');
      const adapter = new BaseBrowserAdapter('test', veto);

      await adapter.intercept({ type: 'navigate', params: { url: 'https://example.com' } });

      const validateCall = (veto as unknown as { validateToolCall: ReturnType<typeof vi.fn> }).validateToolCall;
      expect(validateCall).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'browser.navigate' })
      );
    });

    it('should pass action params as arguments', async () => {
      const veto = createMockVeto('allow');
      const adapter = new BaseBrowserAdapter('test', veto);
      const params = { url: 'https://example.com', waitUntil: 'networkidle' };

      await adapter.intercept({ type: 'navigate', params });

      const validateCall = (veto as unknown as { validateToolCall: ReturnType<typeof vi.fn> }).validateToolCall;
      expect(validateCall).toHaveBeenCalledWith(
        expect.objectContaining({ arguments: params })
      );
    });
  });

  describe('validateOrThrow', () => {
    it('should not throw when allowed', async () => {
      const veto = createMockVeto('allow');
      const adapter = new (class extends BaseBrowserAdapter {
        async testValidate(action: BrowserAction) {
          return this.validateOrThrow(action);
        }
      })('test', veto);

      await expect(
        adapter.testValidate({ type: 'click', params: { selector: '#ok' } })
      ).resolves.toBeUndefined();
    });

    it('should throw BrowserActionDeniedError in strict mode', async () => {
      const veto = createMockVeto('deny', 'not allowed');
      const adapter = new (class extends BaseBrowserAdapter {
        async testValidate(action: BrowserAction) {
          return this.validateOrThrow(action);
        }
      })('test', veto, { mode: 'strict' });

      await expect(
        adapter.testValidate({ type: 'navigate', params: { url: 'file:///etc/passwd' } })
      ).rejects.toThrow(BrowserActionDeniedError);
    });

    it('should not throw in log mode', async () => {
      const veto = createMockVeto('deny', 'would block');
      const adapter = new (class extends BaseBrowserAdapter {
        async testValidate(action: BrowserAction) {
          return this.validateOrThrow(action);
        }
      })('test', veto, { mode: 'log' });

      await expect(
        adapter.testValidate({ type: 'navigate', params: { url: 'file:///etc/passwd' } })
      ).resolves.toBeUndefined();
    });
  });

  describe('wrap', () => {
    it('should return target unchanged by default', () => {
      const veto = createMockVeto('allow');
      const adapter = new BaseBrowserAdapter('test', veto);
      const target = { name: 'original' };

      expect(adapter.wrap(target)).toBe(target);
    });
  });
});

describe('BrowserActionDeniedError', () => {
  it('should have correct properties', () => {
    const action: BrowserAction = { type: 'navigate', params: { url: 'bad.com' } };
    const error = new BrowserActionDeniedError(action, 'blocked');

    expect(error.name).toBe('BrowserActionDeniedError');
    expect(error.action).toEqual(action);
    expect(error.reason).toBe('blocked');
    expect(error.message).toBe('Browser action denied: navigate - blocked');
  });
});
