import { describe, it, expect, vi } from 'vitest';
import { PlaywrightAdapter, wrapPlaywright, wrapPage } from '../../src/integrations/playwright.js';
import { BrowserActionDeniedError } from '../../src/integrations/adapter.js';

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

function createMockPage() {
  return {
    goto: vi.fn().mockResolvedValue(null),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue([]),
    evaluate: vi.fn().mockResolvedValue('result'),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('png')),
  };
}

describe('PlaywrightAdapter', () => {
  describe('wrap', () => {
    it('should wrap goto method', async () => {
      const veto = createMockVeto('allow');
      const adapter = new PlaywrightAdapter(veto);
      const page = createMockPage();

      adapter.wrap(page);
      await page.goto('https://example.com');

      expect(page.goto).toBeDefined();
      const validateCall = (veto as unknown as { validateToolCall: ReturnType<typeof vi.fn> }).validateToolCall;
      expect(validateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'browser.navigate',
          arguments: expect.objectContaining({ url: 'https://example.com' }),
        })
      );
    });

    it('should wrap click method', async () => {
      const veto = createMockVeto('allow');
      const adapter = new PlaywrightAdapter(veto);
      const page = createMockPage();

      adapter.wrap(page);
      await page.click('#submit');

      const validateCall = (veto as unknown as { validateToolCall: ReturnType<typeof vi.fn> }).validateToolCall;
      expect(validateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'browser.click',
          arguments: expect.objectContaining({ selector: '#submit' }),
        })
      );
    });

    it('should wrap fill method', async () => {
      const veto = createMockVeto('allow');
      const adapter = new PlaywrightAdapter(veto);
      const page = createMockPage();

      adapter.wrap(page);
      await page.fill('#email', 'test@example.com');

      const validateCall = (veto as unknown as { validateToolCall: ReturnType<typeof vi.fn> }).validateToolCall;
      expect(validateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'browser.fill',
          arguments: expect.objectContaining({
            selector: '#email',
            value: 'test@example.com',
          }),
        })
      );
    });

    it('should block navigation when denied', async () => {
      const veto = createMockVeto('deny', 'URL blocked');
      const adapter = new PlaywrightAdapter(veto, { mode: 'strict' });
      const page = createMockPage();

      adapter.wrap(page);

      await expect(page.goto('javascript:alert(1)')).rejects.toThrow(BrowserActionDeniedError);
    });

    it('should skip wrapping for methods not on page', () => {
      const veto = createMockVeto('allow');
      const adapter = new PlaywrightAdapter(veto);
      const partialPage = { goto: vi.fn(), click: vi.fn() };

      adapter.wrap(partialPage);

      expect(partialPage.goto).toBeDefined();
      expect(partialPage.click).toBeDefined();
    });

    it('should call original method with original args on allow', async () => {
      const veto = createMockVeto('allow');
      const adapter = new PlaywrightAdapter(veto);
      const originalGoto = vi.fn().mockResolvedValue(null);
      const page = createMockPage();
      page.goto = originalGoto;

      adapter.wrap(page);
      await page.goto('https://example.com', { waitUntil: 'networkidle' });

      expect(originalGoto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'networkidle' });
    });
  });
});

describe('wrapPlaywright', () => {
  it('should return a PlaywrightAdapter', () => {
    const veto = createMockVeto();
    const adapter = wrapPlaywright(veto);

    expect(adapter).toBeInstanceOf(PlaywrightAdapter);
    expect(adapter.name).toBe('playwright');
  });
});

describe('wrapPage', () => {
  it('should wrap and return the same page object', async () => {
    const veto = createMockVeto('allow');
    const page = createMockPage();

    const wrappedPage = wrapPage(veto, page as unknown as import('../../src/integrations/playwright.js').PlaywrightPage);

    expect(wrappedPage).toBe(page);
    await wrappedPage.goto('https://example.com');

    const validateCall = (veto as unknown as { validateToolCall: ReturnType<typeof vi.fn> }).validateToolCall;
    expect(validateCall).toHaveBeenCalled();
  });
});
