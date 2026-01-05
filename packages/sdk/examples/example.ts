/**
 * Simple example demonstrating Veto usage.
 *
 * Before running:
 * 1. Run `npx veto init` in your project
 * 2. Configure your API endpoint in veto/veto.config.yaml
 * 3. Add your validation rules in veto/rules/
 */

import { Veto, ToolDefinition, ToolCall } from 'veto';

// Define your tools
const tools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a file from the filesystem',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path to read' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path to write' },
        content: { type: 'string', description: 'The content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
      },
      required: ['command'],
    },
  },
];

async function main() {
  // Initialize Veto - loads config and rules from ./veto automatically
  const veto = await Veto.init();

  // Wrap your tools - schemas remain unchanged
  const wrappedTools = veto.wrapTools(tools);

  // Pass wrappedTools to your AI provider (OpenAI, Anthropic, etc.)
  console.log('Tools ready for AI provider:', wrappedTools.map((t) => t.name));

  // When the AI model makes a tool call, validate it
  const toolCall: ToolCall = {
    id: 'call_123',
    name: 'read_file',
    arguments: { path: '/etc/passwd' },
  };

  console.log('\nValidating tool call:', toolCall);

  const result = await veto.validateToolCall(toolCall);

  if (result.allowed) {
    console.log('[ALLOWED] Tool call passed validation');
    // Execute the tool here
  } else {
    console.log('[BLOCKED] Tool call denied');
    console.log('  Reason:', result.validationResult.reason);
  }

  // Example: A safe tool call
  const safeCall: ToolCall = {
    id: 'call_456',
    name: 'read_file',
    arguments: { path: './README.md' },
  };

  console.log('\nValidating safe tool call:', safeCall);

  const safeResult = await veto.validateToolCall(safeCall);

  if (safeResult.allowed) {
    console.log('[ALLOWED] Tool call passed validation');
  } else {
    console.log('[BLOCKED] Tool call denied');
    console.log('  Reason:', safeResult.validationResult.reason);
  }
}

main().catch(console.error);
