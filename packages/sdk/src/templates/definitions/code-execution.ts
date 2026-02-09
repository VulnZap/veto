import type { PolicyTemplate } from '../types.js';

const codeExecution: PolicyTemplate = {
  metadata: {
    id: 'code-execution',
    name: 'Code Execution',
    description: 'Restrict command and script execution to safe operations',
    category: 'execution',
    complexity: 'intermediate',
    params: {
      blockedCommands: {
        type: 'array',
        items: 'string',
        description: 'Commands or substrings to block',
        default: ['rm -rf', 'sudo', 'chmod 777', 'mkfs', 'dd if=', '> /dev/'],
      },
      allowedInterpreters: {
        type: 'array',
        items: 'string',
        description: 'Allowed script interpreters (e.g. python, node)',
        default: ['python', 'python3', 'node'],
      },
      blockNetworkCommands: {
        type: 'boolean',
        description: 'Block commands that access the network (curl, wget, nc)',
        default: true,
      },
    },
    tags: ['execution', 'command', 'safety'],
  },
  template: `version: "1.0"
name: code-execution
description: Restrict command and script execution to safe operations

rules:
  - id: block-dangerous-commands
    name: Block dangerous commands
    description: Prevent execution of destructive or privileged commands
    enabled: true
    severity: critical
    action: block
    tools:
      - execute_command
      - run_shell
      - bash
      - terminal
    metadata:
      blocked_commands: {{blockedCommands}}

  - id: allowed-interpreters
    name: Allowed script interpreters
    description: Only allow scripts to run under approved interpreters
    enabled: true
    severity: high
    action: block
    tools:
      - execute_command
      - run_shell
      - bash
      - terminal
    metadata:
      allowed_interpreters: {{allowedInterpreters}}

  - id: block-network-commands
    name: Block network commands
    description: Prevent commands that access the network
    enabled: {{blockNetworkCommands}}
    severity: high
    action: block
    tools:
      - execute_command
      - run_shell
      - bash
      - terminal
    conditions:
      - field: arguments.command
        operator: matches
        value: "\\\\b(curl|wget|nc|netcat|ncat|ssh|scp|rsync|ftp)\\\\b"
`,
};

export default codeExecution;
