/**
 * Browser-Use + Veto Example
 *
 * Demonstrates how to wrap a browser-use agent with Veto guardrails
 * to validate all browser actions against security policies.
 */

import { Veto } from 'veto-sdk';
import { wrapBrowserUse } from 'veto-sdk/integrations/browser-use';

async function main(): Promise<void> {
  // 1. Initialize Veto (loads rules from ./veto/rules/)
  const veto = await Veto.init();

  // 2. Create a browser-use adapter with one line
  const adapter = wrapBrowserUse(veto, {
    onDeny: (action, reason) => {
      console.log(`BLOCKED ${action.type}: ${reason}`);
    },
    onAllow: (action) => {
      console.log(`ALLOWED ${action.type}`);
    },
  });

  // 3. If you have a browser-use Tools instance, wrap it:
  //
  //   import { Tools } from 'browser-use/tools/service';
  //   const tools = new Tools();
  //   adapter.wrap(tools);
  //
  //   // Now pass `tools` to your browser-use Agent as normal.
  //   // Every action (navigate, click, input, etc.) will be
  //   // validated against your Veto rules before executing.

  // 4. Or validate individual actions directly:
  const navResult = await adapter.intercept({
    type: 'navigate',
    params: { url: 'https://example.com' },
  });
  console.log('Navigation allowed:', navResult.allowed);

  const blockedResult = await adapter.intercept({
    type: 'navigate',
    params: { url: 'javascript:alert(1)' },
  });
  console.log('JS navigation allowed:', blockedResult.allowed);

  console.log('\nHistory:', veto.getHistoryStats());
}

main().catch(console.error);
