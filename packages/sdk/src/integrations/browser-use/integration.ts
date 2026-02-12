import type { Veto } from '../../core/veto.js';
import type { CloudToolRegistration, CloudToolParameter } from '../../cloud/types.js';
import { generateToolCallId } from '../../utils/id.js';

/**
 * Default browser-use-node actions validated through Veto.
 * These names match the static `getName()` values in browser-use-node's action classes.
 */
export const DEFAULT_VALIDATED_ACTIONS = new Set([
  'go_to_url',
  'click_element',
  'input_text',
  'extract_page_content',
  'scroll',
  'done',
  'tab',
]);

export interface WrapBrowserUseOptions {
  /** Set of action names to validate. Defaults to all standard browser-use-node actions. */
  validatedActions?: Set<string>;
  /** Called when an action is allowed by Veto. */
  onAllow?: (actionName: string, params: Record<string, unknown>) => void | Promise<void>;
  /** Called when an action is denied by Veto. */
  onDeny?: (actionName: string, params: Record<string, unknown>, reason: string) => void | Promise<void>;
}

type BrowserUseModule = any;

/**
 * Extract the action name from a browser-use-node ActionModel instance.
 * Uses the static `getName()` method on the action's constructor.
 */
function extractActionName(action: unknown): string | undefined {
  if (!action || typeof action !== 'object') return undefined;

  const ctor = (action as { constructor: { getName?: () => string } }).constructor;
  if (typeof ctor?.getName === 'function') {
    return ctor.getName();
  }

  return undefined;
}

/**
 * Extract parameters from a browser-use-node ActionModel instance.
 * Collects all own enumerable properties, excluding internal/inherited ones.
 */
function extractParams(action: unknown): Record<string, unknown> {
  if (!action || typeof action !== 'object') return {};

  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(action)) {
    if (value !== undefined && value !== null) {
      params[key] = value;
    }
  }
  return params;
}

/**
 * Build CloudToolRegistration entries from the controller's action registry.
 */
function buildToolRegistrations(
  registry: any
): CloudToolRegistration[] {
  const registrations: CloudToolRegistration[] = [];

  if (!registry?.actions) return registrations;

  const actions: Map<string, { name: string; description: string; paramModel?: { prototype: object } }> =
    registry.actions;

  for (const [, action] of actions) {
    const parameters: CloudToolParameter[] = [];

    if (action.paramModel?.prototype) {
      for (const key of Object.getOwnPropertyNames(action.paramModel.prototype)) {
        if (key === 'constructor' || key === 'title' || key.startsWith('_')) continue;
        parameters.push({
          name: key,
          type: 'string',
          description: undefined,
        });
      }
    }

    registrations.push({
      name: action.name,
      description: action.description,
      parameters,
    });
  }

  return registrations;
}

/**
 * Create a browser-use-node Controller with Veto validation on every action.
 *
 * Returns a drop-in replacement for `Controller` where each browser action
 * in `validatedActions` is validated through Veto before execution.
 * Actions not in the set pass through unvalidated.
 *
 * Tool schemas are automatically registered with Veto Cloud (if in cloud mode)
 * so policies can be configured via the dashboard.
 *
 * @example
 * ```ts
 * import { Veto } from 'veto-sdk';
 * import { wrapBrowserUse } from 'veto-sdk/integrations/browser-use';
 * import { Agent, Browser } from 'browser-use-node';
 *
 * const veto = await Veto.init();
 * const controller = await wrapBrowserUse(veto, {
 *   onDeny: (action, params, reason) => {
 *     console.log(`Blocked ${action}: ${reason}`);
 *   },
 * });
 *
 * const agent = new Agent({
 *   task: "Search DuckDuckGo for 'best laptops 2025'",
 *   llm: myLLM,
 *   browser: new Browser(),
 *   controller,
 * });
 * await agent.run();
 * ```
 */
export async function wrapBrowserUse(
  veto: Veto,
  options?: WrapBrowserUseOptions,
): Promise<any> {
  let browserUse: BrowserUseModule;
  try {
    browserUse = await import('browser-use-node');
  } catch {
    throw new Error(
      'browser-use-node is required for this integration. ' +
      'Install it with: npm install browser-use-node'
    );
  }

  const { Controller, ActionResult } = browserUse;
  const actionsToValidate = options?.validatedActions ?? DEFAULT_VALIDATED_ACTIONS;

  class VetoController extends Controller {
    async act(action: any, browserContext: any): Promise<any> {
      const actionName = extractActionName(action);
      const params = extractParams(action);

      if (!actionName || !actionsToValidate.has(actionName)) {
        return super.act(action, browserContext);
      }

      try {
        const result = await veto.validateToolCall({
          id: generateToolCallId(),
          name: actionName,
          arguments: params,
        });

        if (!result.allowed) {
          const reason = result.validationResult.reason ?? 'Policy violation';

          if (options?.onDeny) {
            await options.onDeny(actionName, params, reason);
          }

          return new ActionResult({
            error: `Action blocked by Veto: ${reason}`,
          });
        }

        if (options?.onAllow) {
          await options.onAllow(actionName, params);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new ActionResult({
          error: `Veto validation error: ${message}`,
        });
      }

      return super.act(action, browserContext);
    }
  }

  const controller = new VetoController();

  // Register tool schemas with Veto Cloud (no-op if not in cloud mode)
  const registrations = buildToolRegistrations(controller.registry);
  await veto.registerTools(registrations);

  return controller;
}
