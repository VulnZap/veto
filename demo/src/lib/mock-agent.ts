import type { ToolCallDeniedError } from 'veto-sdk';
import * as reporter from './reporter.js';

export interface PlannedToolCall {
  toolName: string;
  args: Record<string, unknown>;
  thought?: string;
}

export interface AgentConfig {
  name: string;
  tools: Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
}

export async function runAgent(
  config: AgentConfig,
  calls: PlannedToolCall[],
): Promise<reporter.DemoResult[]> {
  const results: reporter.DemoResult[] = [];

  for (const call of calls) {
    if (call.thought) {
      reporter.agentThinking(config.name, call.thought);
    }

    reporter.toolCall(config.name, call.toolName, call.args);

    const handler = config.tools[call.toolName];
    if (!handler) {
      reporter.denied(`Unknown tool: ${call.toolName}`);
      results.push({
        toolName: call.toolName,
        args: call.args,
        decision: 'deny',
        reason: `Unknown tool: ${call.toolName}`,
      });
      continue;
    }

    try {
      const result = await handler(call.args);
      reporter.allowed();
      reporter.toolResult(JSON.stringify(result));
      results.push({
        toolName: call.toolName,
        args: call.args,
        decision: 'allow',
      });
    } catch (err) {
      const error = err as Error & { reason?: string };
      if (error.name === 'ToolCallDeniedError') {
        const denied = err as ToolCallDeniedError;
        reporter.denied(denied.reason);
        results.push({
          toolName: call.toolName,
          args: call.args,
          decision: 'deny',
          reason: denied.reason,
        });
      } else {
        reporter.denied(error.message);
        results.push({
          toolName: call.toolName,
          args: call.args,
          decision: 'deny',
          reason: error.message,
        });
      }
    }
  }

  return results;
}
