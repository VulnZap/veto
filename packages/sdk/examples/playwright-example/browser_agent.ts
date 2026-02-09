/**
 * Playwright + Veto Example
 *
 * Demonstrates how to wrap Playwright page methods with Veto guardrails
 * to validate navigation, clicks, and form fills against security policies.
 */

import { Veto } from 'veto-sdk';
// import { wrapPlaywrightPage } from 'veto-sdk/integrations/playwright';

async function main(): Promise<void> {
  // 1. Initialize Veto (loads rules from ./veto/rules/)
  const veto = await Veto.init();

  // 2. Normally you'd get a page from Playwright:
  //
  //   import { chromium } from 'playwright';
  //   const browser = await chromium.launch();
  //   const page = await browser.newPage();
  //
  // 3. Wrap the page with one line:
  //
  //   const safePage = wrapPlaywrightPage(veto, page);
  //
  //   // Now every call to safePage.goto(), safePage.click(),
  //   // safePage.fill(), etc. is validated against your Veto rules.
  //
  //   await safePage.goto('https://example.com');        // validated
  //   await safePage.click('#submit');                    // validated
  //   await safePage.fill('#email', 'user@example.com'); // validated
  //   await safePage.goto('javascript:alert(1)');         // BLOCKED
  //
  //   await browser.close();

  // 4. You can also use the adapter directly for manual validation:
  const { PlaywrightAdapter } = await import('veto-sdk/integrations/playwright');
  const adapter = new PlaywrightAdapter(veto, {
    mode: 'strict',
    onDeny: (action, reason) => {
      console.log(`BLOCKED ${action.type}: ${reason}`);
    },
  });

  const navResult = await adapter.intercept({
    type: 'navigate',
    params: { url: 'https://example.com' },
  });
  console.log('Navigation allowed:', navResult.allowed);

  const blockedResult = await adapter.intercept({
    type: 'navigate',
    params: { url: 'file:///etc/passwd' },
  });
  console.log('File navigation allowed:', blockedResult.allowed);

  console.log('\nHistory:', veto.getHistoryStats());
}

main().catch(console.error);
