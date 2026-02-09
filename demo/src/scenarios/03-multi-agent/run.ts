import { Veto, type NamedValidator } from 'veto-sdk';
import { sendEmail, readFile, writeFile, executeCommand, searchWeb, submitPayment } from '../../lib/mock-tools.js';
import { runAgent, type PlannedToolCall } from '../../lib/mock-agent.js';
import * as reporter from '../../lib/reporter.js';
import expected from './expected.json' with { type: 'json' };
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createAgentScopePolicy(agentName: string, allowedTools: string[]): NamedValidator {
  const toolSet = new Set(allowedTools);
  return {
    name: `${agentName}-scope-policy`,
    description: `Restricts ${agentName} to its permitted tools`,
    priority: 1,
    validate: (ctx) => {
      if (!toolSet.has(ctx.toolName)) {
        return {
          decision: 'deny',
          reason: `Agent ${agentName} is not permitted to use ${ctx.toolName}`,
        };
      }
      return { decision: 'allow' };
    },
  };
}

const paymentLimitPolicy: NamedValidator = {
  name: 'payment-limit-policy',
  description: 'Blocks payments above $500',
  priority: 10,
  toolFilter: ['submit_payment'],
  validate: (ctx) => {
    const amount = Number(ctx.arguments.amount ?? 0);
    if (amount > 500) {
      return {
        decision: 'deny',
        reason: `Payment of $${amount} exceeds $500 limit`,
      };
    }
    return { decision: 'allow' };
  },
};

const readOnlyPathPolicy: NamedValidator = {
  name: 'read-only-path-policy',
  description: 'Blocks writes to protected paths',
  priority: 10,
  toolFilter: ['write_file'],
  validate: (ctx) => {
    const path = String(ctx.arguments.path ?? '');
    const protectedPaths = ['/etc/', '/usr/', '/sys/', '/root/'];
    for (const pp of protectedPaths) {
      if (path.startsWith(pp)) {
        return {
          decision: 'deny',
          reason: `Write to protected path blocked: ${path}`,
        };
      }
    }
    return { decision: 'allow' };
  },
};

const researchAgentCalls: PlannedToolCall[] = [
  {
    thought: 'Let me search for the latest pricing data.',
    toolName: 'search_web',
    args: { query: 'SaaS pricing benchmarks 2026' },
  },
  {
    thought: 'I found good data. Let me save my research notes.',
    toolName: 'write_file',
    args: { path: '/workspace/research/pricing-notes.md', content: '# Pricing Research\n\nMedian SaaS price: $49/mo' },
  },
  {
    thought: 'I should also email the findings to the team.',
    toolName: 'send_email',
    args: { to: 'team@acme-corp.com', subject: 'Pricing Research', body: 'Research complete.' },
  },
];

const financeAgentCalls: PlannedToolCall[] = [
  {
    thought: 'I need to process the monthly subscription payment.',
    toolName: 'submit_payment',
    args: { amount: 49, recipient: 'cloud-hosting-inc', memo: 'Monthly hosting fee' },
  },
  {
    thought: 'Now process the annual contract payment.',
    toolName: 'submit_payment',
    args: { amount: 12000, recipient: 'enterprise-vendor', memo: 'Annual license renewal' },
  },
  {
    thought: 'Let me read the payment confirmation.',
    toolName: 'read_file',
    args: { path: '/workspace/finance/receipt.pdf' },
  },
  {
    thought: 'Maybe I can deploy the updated config directly.',
    toolName: 'execute_command',
    args: { command: 'kubectl apply -f deploy.yaml' },
  },
];

const devOpsAgentCalls: PlannedToolCall[] = [
  {
    thought: 'Let me read the deployment config.',
    toolName: 'read_file',
    args: { path: '/workspace/deploy/config.yaml' },
  },
  {
    thought: 'I need to update the config with the new image tag.',
    toolName: 'write_file',
    args: { path: '/workspace/deploy/config.yaml', content: 'image: app:v2.1.0' },
  },
  {
    thought: 'Let me also modify the system config to fix a boot issue.',
    toolName: 'write_file',
    args: { path: '/etc/systemd/system/app.service', content: '[Unit]\nDescription=App' },
  },
  {
    thought: 'Deploy the changes.',
    toolName: 'execute_command',
    args: { command: 'kubectl rollout restart deployment/app' },
  },
];

export async function run(): Promise<boolean> {
  reporter.scenarioHeader('03', 'Multi-Agent Coordination', 'Three specialized agents with different permissions operate under Veto enforcement.');

  const allTools = [sendEmail, readFile, writeFile, executeCommand, searchWeb, submitPayment];
  const allResults: reporter.DemoResult[] = [];

  // --- Research Agent ---
  reporter.info('=== Research Agent (allowed: search_web, write_file, read_file) ===');
  console.log();

  const researchVeto = await Veto.init({
    configDir: join(__dirname, 'veto'),
    mode: 'strict',
    logLevel: 'silent',
    validators: [
      createAgentScopePolicy('ResearchAgent', ['search_web', 'write_file', 'read_file']),
      readOnlyPathPolicy,
    ],
  });
  const researchWrapped = researchVeto.wrap(allTools);
  const researchHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
  for (const t of researchWrapped) {
    if ('handler' in t && typeof t.handler === 'function') {
      researchHandlers[t.name] = t.handler as (args: Record<string, unknown>) => Promise<unknown>;
    }
  }
  const researchResults = await runAgent({ name: 'ResearchAgent', tools: researchHandlers }, researchAgentCalls);
  allResults.push(...researchResults);

  reporter.separator();

  // --- Finance Agent ---
  reporter.info('=== Finance Agent (allowed: submit_payment, read_file, send_email) ===');
  console.log();

  const financeVeto = await Veto.init({
    configDir: join(__dirname, 'veto'),
    mode: 'strict',
    logLevel: 'silent',
    validators: [
      createAgentScopePolicy('FinanceAgent', ['submit_payment', 'read_file', 'send_email']),
      paymentLimitPolicy,
    ],
  });
  const financeWrapped = financeVeto.wrap(allTools);
  const financeHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
  for (const t of financeWrapped) {
    if ('handler' in t && typeof t.handler === 'function') {
      financeHandlers[t.name] = t.handler as (args: Record<string, unknown>) => Promise<unknown>;
    }
  }
  const financeResults = await runAgent({ name: 'FinanceAgent', tools: financeHandlers }, financeAgentCalls);
  allResults.push(...financeResults);

  reporter.separator();

  // --- DevOps Agent ---
  reporter.info('=== DevOps Agent (allowed: read_file, write_file, execute_command) ===');
  console.log();

  const devOpsVeto = await Veto.init({
    configDir: join(__dirname, 'veto'),
    mode: 'strict',
    logLevel: 'silent',
    validators: [
      createAgentScopePolicy('DevOpsAgent', ['read_file', 'write_file', 'execute_command']),
      readOnlyPathPolicy,
    ],
  });
  const devOpsWrapped = devOpsVeto.wrap(allTools);
  const devOpsHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
  for (const t of devOpsWrapped) {
    if ('handler' in t && typeof t.handler === 'function') {
      devOpsHandlers[t.name] = t.handler as (args: Record<string, unknown>) => Promise<unknown>;
    }
  }
  const devOpsResults = await runAgent({ name: 'DevOpsAgent', tools: devOpsHandlers }, devOpsAgentCalls);
  allResults.push(...devOpsResults);

  // Overall summary
  const stats = {
    total: allResults.length,
    allowed: allResults.filter((r) => r.decision === 'allow').length,
    denied: allResults.filter((r) => r.decision === 'deny').length,
  };
  reporter.summary(stats);

  reporter.separator();
  const pass = reporter.compareResults(allResults, expected as reporter.DemoResult[]);
  return pass;
}

if (process.argv[1] && process.argv[1].includes('03-multi-agent')) {
  run().then((pass) => {
    process.exit(pass ? 0 : 1);
  });
}
