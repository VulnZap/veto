import { Veto, type NamedValidator } from 'veto-sdk';
import { sendEmail, readFile, searchWeb } from '../../lib/mock-tools.js';
import { runAgent, type PlannedToolCall } from '../../lib/mock-agent.js';
import * as reporter from '../../lib/reporter.js';
import expected from './expected.json' with { type: 'json' };
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const emailPolicy: NamedValidator = {
  name: 'email-safety-policy',
  description: 'Blocks emails to external domains and with sensitive content',
  priority: 10,
  toolFilter: ['send_email'],
  validate: (ctx) => {
    const to = String(ctx.arguments.to ?? '');
    const body = String(ctx.arguments.body ?? '');
    const subject = String(ctx.arguments.subject ?? '');

    const allowedDomains = ['@acme-corp.com', '@acme-corp.internal'];
    const isInternalRecipient = allowedDomains.some((d) => to.endsWith(d));
    if (!isInternalRecipient) {
      return {
        decision: 'deny',
        reason: `External recipient blocked: ${to} is not in allowed domains`,
      };
    }

    const sensitivePatterns = [/\bSSN\b/i, /\b\d{3}-\d{2}-\d{4}\b/, /\bpassword\b/i, /\bsecret\b/i, /\bcredential/i];
    const combined = `${subject} ${body}`;
    for (const pattern of sensitivePatterns) {
      if (pattern.test(combined)) {
        return {
          decision: 'deny',
          reason: `Sensitive content detected in email: matches pattern ${pattern.source}`,
        };
      }
    }

    return { decision: 'allow', reason: 'Email passes safety checks' };
  },
};

const calls: PlannedToolCall[] = [
  {
    thought: 'I need to send a status update to the team.',
    toolName: 'send_email',
    args: {
      to: 'team@acme-corp.com',
      subject: 'Sprint 14 Status Update',
      body: 'All tasks on track. Deploy scheduled for Friday.',
    },
  },
  {
    thought: 'Let me also email our external vendor about the delivery timeline.',
    toolName: 'send_email',
    args: {
      to: 'vendor@external-supplier.com',
      subject: 'Delivery Timeline',
      body: 'When can we expect the Q3 shipment?',
    },
  },
  {
    thought: 'I should send the new hire their onboarding credentials.',
    toolName: 'send_email',
    args: {
      to: 'alice@acme-corp.com',
      subject: 'Your login credentials',
      body: 'Hi Alice, your temporary password is: TempP@ss123. Please change it on first login.',
    },
  },
  {
    thought: 'Let me search for the meeting agenda first.',
    toolName: 'search_web',
    args: { query: 'team standup best practices' },
  },
  {
    thought: 'Now send the meeting notes to the internal list.',
    toolName: 'send_email',
    args: {
      to: 'engineering@acme-corp.internal',
      subject: 'Standup Notes - Feb 2026',
      body: 'Action items: 1) Fix auth bug, 2) Update docs, 3) Review PRs.',
    },
  },
];

export async function run(): Promise<boolean> {
  reporter.scenarioHeader('01', 'Email Guard', 'Veto enforces email safety: blocks external recipients and sensitive content.');

  const veto = await Veto.init({
    configDir: join(__dirname, 'veto'),
    mode: 'strict',
    logLevel: 'silent',
    validators: [emailPolicy],
  });

  const tools = [sendEmail, readFile, searchWeb];
  const wrapped = veto.wrap(tools);

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
  for (const t of wrapped) {
    if ('handler' in t && typeof t.handler === 'function') {
      handlers[t.name] = t.handler as (args: Record<string, unknown>) => Promise<unknown>;
    }
  }

  const results = await runAgent({ name: 'EmailAgent', tools: handlers }, calls);

  const stats = {
    total: results.length,
    allowed: results.filter((r) => r.decision === 'allow').length,
    denied: results.filter((r) => r.decision === 'deny').length,
  };
  reporter.summary(stats);

  reporter.separator();
  const pass = reporter.compareResults(results, expected as reporter.DemoResult[]);
  return pass;
}

if (process.argv[1] && process.argv[1].includes('01-email-guard')) {
  run().then((pass) => {
    process.exit(pass ? 0 : 1);
  });
}
