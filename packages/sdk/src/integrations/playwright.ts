import type { Veto } from '../core/veto.js';
import { BaseBrowserAdapter, BrowserActionDeniedError } from './adapter.js';
import type { BrowserAction, BrowserAdapterConfig } from './types.js';

export interface PlaywrightPage {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  click(selector: string, options?: Record<string, unknown>): Promise<void>;
  fill(selector: string, value: string, options?: Record<string, unknown>): Promise<void>;
  type(selector: string, text: string, options?: Record<string, unknown>): Promise<void>;
  selectOption(selector: string, values: unknown, options?: Record<string, unknown>): Promise<unknown>;
  evaluate(pageFunction: unknown, ...args: unknown[]): Promise<unknown>;
  screenshot(options?: Record<string, unknown>): Promise<Buffer>;
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
  fill: (args) => ({
    type: 'fill',
    params: {
      selector: args[0] as string,
      value: args[1] as string,
      ...(args[2] as Record<string, unknown> ?? {}),
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
  selectOption: (args) => ({
    type: 'select',
    params: {
      selector: args[0] as string,
      values: args[1] as unknown,
      ...(args[2] as Record<string, unknown> ?? {}),
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

export class PlaywrightAdapter extends BaseBrowserAdapter {
  constructor(veto: Veto, config?: BrowserAdapterConfig) {
    super('playwright', veto, config);
  }

  override wrap<T>(target: T): T {
    const page = target as unknown as PlaywrightPage;
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

export function wrapPlaywright(veto: Veto, config?: BrowserAdapterConfig): PlaywrightAdapter {
  return new PlaywrightAdapter(veto, config);
}

export function wrapPage<T extends PlaywrightPage>(
  veto: Veto,
  page: T,
  config?: BrowserAdapterConfig
): T {
  const adapter = new PlaywrightAdapter(veto, config);
  return adapter.wrap(page);
}

export { BrowserActionDeniedError };
