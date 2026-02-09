import type { Veto } from '../core/veto.js';
import { BaseBrowserAdapter, BrowserActionDeniedError } from './adapter.js';
import type { BrowserAction, BrowserAdapterConfig } from './types.js';

const DEFAULT_VALIDATED_ACTIONS = new Set([
  'navigate',
  'search',
  'click',
  'input',
  'extract',
  'scroll',
  'done',
]);

export interface BrowserUseConfig extends BrowserAdapterConfig {
  validatedActions?: Set<string>;
}

export class BrowserUseAdapter extends BaseBrowserAdapter {
  private readonly validatedActions: Set<string>;

  constructor(veto: Veto, config: BrowserUseConfig = {}) {
    super('browser-use', veto, config);
    this.validatedActions = config.validatedActions ?? DEFAULT_VALIDATED_ACTIONS;
  }

  override wrap<T>(target: T): T {
    const targetAny = target as Record<string, unknown>;

    if (typeof targetAny.act !== 'function') {
      throw new Error(
        'Target does not have an act() method. ' +
        'Expected a browser-use Tools instance.'
      );
    }

    const originalAct = targetAny.act.bind(target) as (
      action: unknown,
      browserSession: unknown,
      ...args: unknown[]
    ) => Promise<unknown>;
    const interceptFn = this.intercept.bind(this);
    const validatedActions = this.validatedActions;

    targetAny.act = async (
      action: unknown,
      browserSession: unknown,
      ...args: unknown[]
    ): Promise<unknown> => {
      const actionObj = action as { model_dump?: (opts: unknown) => Record<string, unknown> } & Record<string, unknown>;

      let actionDict: Record<string, unknown>;
      if (typeof actionObj.model_dump === 'function') {
        actionDict = actionObj.model_dump({ exclude_unset: true });
      } else if (typeof actionObj === 'object' && actionObj !== null) {
        actionDict = { ...actionObj };
      } else {
        return originalAct(action, browserSession, ...args);
      }

      const actionName = Object.keys(actionDict)[0];
      if (!actionName || !validatedActions.has(actionName)) {
        return originalAct(action, browserSession, ...args);
      }

      const rawParams = actionDict[actionName];
      const params = typeof rawParams === 'object' && rawParams !== null
        ? rawParams as Record<string, unknown>
        : { value: rawParams };

      const browserAction: BrowserAction = {
        type: actionName as BrowserAction['type'],
        params,
      };

      const result = await interceptFn(browserAction);

      if (!result.allowed) {
        const reason = result.validationResult.reason ?? 'Policy violation';
        return {
          error: `Action blocked by Veto: ${reason}`,
        };
      }

      return originalAct(action, browserSession, ...args);
    };

    return target;
  }
}

export function wrapBrowserUse(veto: Veto, config?: BrowserUseConfig): BrowserUseAdapter {
  return new BrowserUseAdapter(veto, config);
}

export { BrowserActionDeniedError };
