import { describe, it, expect, vi } from 'vitest';
import { PuppeteerAdapter, wrapPuppeteer, wrapPage } from '../../src/integrations/puppeteer.js';
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
    type: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue([]),
    evaluate: vi.fn().mockResolvedValue('result'),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('png')),
  };
}

describe('PuppeteerAdapter', () => {
  describe('wrap', () => {
    it('should wrap goto method', async () => {
      const veto = createMockVeto('allow');
      const adapter = new PuppeteerAdapter(veto);
      const page = createMockPage();

      adapter.wrap(page);
      await page.goto('https://example.com');

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
      const adapter = new PuppeteerAdapter(veto);
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

    it('should wrap type method', async () => {
      const veto = createMockVeto('allow');
      const adapter = new PuppeteerAdapter(veto);
      const page = createMockPage();

      adapter.wrap(page);
      await page.type('#search', 'hello');

      const validateCall = (veto as unknown as { validateToolCall: ReturnType<typeof vi.fn> }).validateToolCall;
      expect(validateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'browser.type',
          arguments: expect.objectContaining({
            selector: '#search',
            value: 'hello',
          }),
        })
      );
    });

    it('should block navigation when denied', async () => {
      const veto = createMockVeto('deny', 'blocked');
      const adapter = new PuppeteerAdapter(veto, { mode: 'strict' });
      const page = createMockPage();

      adapter.wrap(page);

      await expect(page.goto('data:text/html,<h1>bad</h1>')).rejects.toThrow(BrowserActionDeniedError);
    });

    it('should call original method on allow', async () => {
      const veto = createMockVeto('allow');
      const adapter = new PuppeteerAdapter(veto);
      const originalGoto = vi.fn().mockResolvedValue(null);
      const page = createMockPage();
      page.goto = originalGoto;

      adapter.wrap(page);
      await page.goto('https://example.com', { waitUntil: 'networkidle0' });

      expect(originalGoto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'networkidle0' });
    });

    it('should wrap select method', async () => {
      const veto = createMockVeto('allow');
      const adapter = new PuppeteerAdapter(veto);
      const page = createMockPage();

      adapter.wrap(page);
      await page.select('#country', 'US');

      const validateCall = (veto as unknown as { validateToolCall: ReturnType<typeof vi.fn> }).validateToolCall;
      expect(validateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'browser.select',
          arguments: expect.objectContaining({ selector: '#country' }),
        })
      );
    });
  });
});

describe('wrapPuppeteer', () => {
  it('should return a PuppeteerAdapter', () => {
    const veto = createMockVeto();
    const adapter = wrapPuppeteer(veto);

    expect(adapter).toBeInstanceOf(PuppeteerAdapter);
    expect(adapter.name).toBe('puppeteer');
  });
});

describe('wrapPage', () => {
  it('should wrap and return the same page object', async () => {
    const veto = createMockVeto('allow');
    const page = createMockPage();

    const wrappedPage = wrapPage(veto, page as unknown as import('../../src/integrations/puppeteer.js').PuppeteerPage);

    expect(wrappedPage).toBe(page);
    await wrappedPage.goto('https://example.com');

    const validateCall = (veto as unknown as { validateToolCall: ReturnType<typeof vi.fn> }).validateToolCall;
    expect(validateCall).toHaveBeenCalled();
  });
});
