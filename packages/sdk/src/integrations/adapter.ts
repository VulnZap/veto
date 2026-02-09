import type { Veto } from '../core/veto.js';
import type { InterceptionResult } from '../core/interceptor.js';
import { generateToolCallId } from '../utils/id.js';
import type {
  BrowserAction,
  BrowserAdapterConfig,
  BrowserValidationResult,
} from './types.js';

export interface BrowserAgentAdapter {
  readonly name: string;
  intercept(action: BrowserAction): Promise<BrowserValidationResult>;
  wrap<T>(target: T): T;
}

// Veto.validateToolCall is private. Internal integrations access it
// the same way the Python SDK does: through a type-erased reference.
type VetoInternal = {
  validateToolCall(call: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<InterceptionResult>;
};

function getVetoInternal(veto: Veto): VetoInternal {
  return veto as unknown as VetoInternal;
}

export class BaseBrowserAdapter implements BrowserAgentAdapter {
  readonly name: string;
  protected readonly veto: Veto;
  protected readonly config: Required<BrowserAdapterConfig>;

  constructor(
    name: string,
    veto: Veto,
    config: BrowserAdapterConfig = {}
  ) {
    this.name = name;
    this.veto = veto;
    this.config = {
      mode: config.mode ?? 'strict',
      onAllow: config.onAllow ?? (() => {}),
      onDeny: config.onDeny ?? (() => {}),
    };
  }

  async intercept(action: BrowserAction): Promise<BrowserValidationResult> {
    const toolName = `browser.${action.type}`;
    const internal = getVetoInternal(this.veto);

    const result = await internal.validateToolCall({
      id: generateToolCallId(),
      name: toolName,
      arguments: action.params,
    });

    const validationResult: BrowserValidationResult = {
      allowed: result.allowed,
      action,
      validationResult: result.validationResult,
    };

    if (result.allowed) {
      await this.config.onAllow(action);
    } else {
      const reason = result.validationResult.reason ?? 'Policy violation';
      await this.config.onDeny(action, reason);
    }

    return validationResult;
  }

  wrap<T>(target: T): T {
    return target;
  }

  protected async validateOrThrow(action: BrowserAction): Promise<void> {
    const result = await this.intercept(action);
    if (!result.allowed) {
      const reason = result.validationResult.reason ?? 'Policy violation';
      if (this.config.mode === 'strict') {
        throw new BrowserActionDeniedError(action, reason);
      }
    }
  }
}

export class BrowserActionDeniedError extends Error {
  readonly action: BrowserAction;
  readonly reason: string;

  constructor(action: BrowserAction, reason: string) {
    super(`Browser action denied: ${action.type} - ${reason}`);
    this.name = 'BrowserActionDeniedError';
    this.action = action;
    this.reason = reason;
  }
}
