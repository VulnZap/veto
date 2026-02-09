import type { PolicyTemplate } from '../types.js';

const fileAccess: PolicyTemplate = {
  metadata: {
    id: 'file-access',
    name: 'File Access Control',
    description: 'Restrict filesystem access to an allowed directory tree and block sensitive paths',
    category: 'filesystem',
    complexity: 'basic',
    params: {
      allowedRoot: {
        type: 'string',
        description: 'Root directory the agent may access (e.g. /home/user/project)',
        required: true,
      },
      blockedPaths: {
        type: 'array',
        items: 'string',
        description: 'Paths that are always blocked',
        default: ['/etc', '/root', '/var/log'],
      },
    },
    tags: ['filesystem', 'access-control', 'safety'],
  },
  template: `version: "1.0"
name: file-access
description: Restrict filesystem access to allowed directories

rules:
  - id: file-allowed-root
    name: Restrict to allowed root
    description: Only permit file access under the allowed directory tree
    enabled: true
    severity: critical
    action: block
    tools:
      - read_file
      - write_file
      - delete_file
      - list_directory
    conditions:
      - field: arguments.path
        operator: starts_with
        value: {{allowedRoot}}

  - id: file-blocked-paths
    name: Block sensitive paths
    description: Always block access to sensitive system paths
    enabled: true
    severity: critical
    action: block
    tools:
      - read_file
      - write_file
      - delete_file
      - list_directory
    conditions:
      - field: arguments.path
        operator: in
        value: {{blockedPaths}}
`,
};

export default fileAccess;
