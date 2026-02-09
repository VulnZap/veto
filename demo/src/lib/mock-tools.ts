import type { ExecutableTool } from 'veto-sdk';

export const sendEmail: ExecutableTool = {
  name: 'send_email',
  description: 'Send an email to a recipient',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject line' },
      body: { type: 'string', description: 'Email body content' },
      cc: { type: 'string', description: 'CC recipients (comma-separated)' },
    },
    required: ['to', 'subject', 'body'],
  },
  handler: async (args) => {
    return { status: 'sent', messageId: 'msg-demo-001', to: args.to };
  },
};

export const readFile: ExecutableTool = {
  name: 'read_file',
  description: 'Read contents of a file',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
    },
    required: ['path'],
  },
  handler: async (args) => {
    return { content: `[simulated content of ${args.path}]`, size: 1024 };
  },
};

export const writeFile: ExecutableTool = {
  name: 'write_file',
  description: 'Write content to a file',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  },
  handler: async (args) => {
    return { written: true, path: args.path, bytes: 256 };
  },
};

export const navigateUrl: ExecutableTool = {
  name: 'navigate_url',
  description: 'Navigate browser to a URL',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to' },
    },
    required: ['url'],
  },
  handler: async (args) => {
    return { status: 'loaded', url: args.url, title: 'Page Title' };
  },
};

export const clickElement: ExecutableTool = {
  name: 'click_element',
  description: 'Click an element on the page',
  inputSchema: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of element to click' },
    },
    required: ['selector'],
  },
  handler: async (args) => {
    return { clicked: true, selector: args.selector };
  },
};

export const fillForm: ExecutableTool = {
  name: 'fill_form',
  description: 'Fill in a form field',
  inputSchema: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of form field' },
      value: { type: 'string', description: 'Value to fill in' },
    },
    required: ['selector', 'value'],
  },
  handler: async (args) => {
    return { filled: true, selector: args.selector };
  },
};

export const executeCommand: ExecutableTool = {
  name: 'execute_command',
  description: 'Execute a shell command',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to execute' },
    },
    required: ['command'],
  },
  handler: async (args) => {
    return { stdout: `[simulated output of: ${args.command}]`, exitCode: 0 };
  },
};

export const searchWeb: ExecutableTool = {
  name: 'search_web',
  description: 'Search the web for information',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  handler: async (args) => {
    return { results: [`Result 1 for: ${args.query}`, `Result 2 for: ${args.query}`] };
  },
};

export const submitPayment: ExecutableTool = {
  name: 'submit_payment',
  description: 'Submit a payment transaction',
  inputSchema: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Payment amount in USD' },
      recipient: { type: 'string', description: 'Payment recipient' },
      memo: { type: 'string', description: 'Payment memo' },
    },
    required: ['amount', 'recipient'],
  },
  handler: async (args) => {
    return { transactionId: 'txn-demo-001', amount: args.amount, status: 'completed' };
  },
};

export const allTools: ExecutableTool[] = [
  sendEmail,
  readFile,
  writeFile,
  navigateUrl,
  clickElement,
  fillForm,
  executeCommand,
  searchWeb,
  submitPayment,
];
