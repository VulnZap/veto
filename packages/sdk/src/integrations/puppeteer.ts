import type { Veto } from '../core/veto.js';
import { BaseBrowserAdapter, BrowserActionDeniedError } from './adapter.js';
import type { BrowserAction, BrowserAdapterConfig } from './types.js';

export interface PuppeteerPage {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  click(selector: string, options?: Record<string, unknown>): Promise<void>;
  type(selector: string, text: string, options?: Record<string, unknown>): Promise<void>;
  select(selector: string, ...values: string[]): Promise<string[]>;
  evaluate(pageFunction: unknown, ...args: unknown[]): Promise<unknown>;
  screenshot(options?: Record<string, unknown>): Promise<Buffer | string>;
  [key: string]: unknown;
}

const WRAPPED_METHODS: Record<string, (args: unknown[]) => BrowserAction> = {
  goto: (args) => ({
    type: 'navigate',
    params: {
      url: args[0] as string,
      ...(args[1] as Record<string, unknown> ?? {}),
    },
  }),
  click: (args) => ({
    type: 'click',
    params: {
      selector: args[0] as string,
      ...(args[1] as Record<string, unknown> ?? {}),
    },
  }),
  type: (args) => ({
    type: 'type',
    params: {
      selector: args[0] as string,
      value: args[1] as string,
      ...(args[2] as Record<string, unknown> ?? {}),
    },
  }),
  select: (args) => ({
    type: 'select',
    params: {
      selector: args[0] as string,
      values: (args as unknown[]).slice(1),
    },
  }),
  evaluate: (args) => ({
    type: 'evaluate',
    params: {
      pageFunction: String(args[0]),
    },
  }),
  screenshot: (args) => ({
    type: 'screenshot',
    params: args[0] as Record<string, unknown> ?? {},
  }),
};

export class PuppeteerAdapter extends BaseBrowserAdapter {
  constructor(veto: Veto, config?: BrowserAdapterConfig) {
    super('puppeteer', veto, config);
  }

  override wrap<T>(target: T): T {
    const page = target as unknown as PuppeteerPage;
    const validateFn = this.validateOrThrow.bind(this);

    for (const [method, toAction] of Object.entries(WRAPPED_METHODS)) {
      if (typeof page[method] !== 'function') continue;

      const original = (page[method] as (...args: unknown[]) => Promise<unknown>).bind(target);

      page[method] = async (...args: unknown[]): Promise<unknown> => {
        const action = toAction(args);
        await validateFn(action);
        return original(...args);
      };
    }

    return target;
  }
}

export function wrapPuppeteer(veto: Veto, config?: BrowserAdapterConfig): PuppeteerAdapter {
  return new PuppeteerAdapter(veto, config);
}

export function wrapPage<T extends PuppeteerPage>(
  veto: Veto,
  page: T,
  config?: BrowserAdapterConfig
): T {
  const adapter = new PuppeteerAdapter(veto, config);
  return adapter.wrap(page);
}

export { BrowserActionDeniedError };
