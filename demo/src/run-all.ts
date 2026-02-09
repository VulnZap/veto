import * as reporter from './lib/reporter.js';
import { run as runEmailGuard } from './scenarios/01-email-guard/run.js';
import { run as runBrowserGuard } from './scenarios/02-browser-guard/run.js';
import { run as runMultiAgent } from './scenarios/03-multi-agent/run.js';

async function main(): Promise<void> {
  reporter.banner('Veto Investor Demo', 'The permission layer for AI agents');

  const scenarios = [
    { name: 'Email Guard', run: runEmailGuard },
    { name: 'Browser Guard', run: runBrowserGuard },
    { name: 'Multi-Agent Coordination', run: runMultiAgent },
  ];

  let allPassed = true;

  for (const scenario of scenarios) {
    const pass = await scenario.run();
    if (!pass) {
      allPassed = false;
    }
    console.log();
  }

  reporter.banner(
    allPassed ? 'ALL SCENARIOS PASSED' : 'SOME SCENARIOS FAILED',
    allPassed
      ? 'Demo completed successfully. All outputs match expected results.'
      : 'Some scenario outputs did not match expected results.',
  );

  process.exit(allPassed ? 0 : 1);
}

main();
