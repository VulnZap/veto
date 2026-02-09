import type { PolicyTemplate } from '../types.js';

const browserNavigation: PolicyTemplate = {
  metadata: {
    id: 'browser-navigation',
    name: 'Browser Navigation',
    description: 'Control which URLs the agent may visit with allowlist and blocklist',
    category: 'network',
    complexity: 'basic',
    params: {
      allowedDomains: {
        type: 'array',
        items: 'string',
        description: 'Domains the agent may navigate to',
        required: true,
      },
      blockedDomains: {
        type: 'array',
        items: 'string',
        description: 'Domains that are always blocked',
        default: [],
      },
      blockDataUrls: {
        type: 'boolean',
        description: 'Block data: URIs to prevent exfiltration',
        default: true,
      },
    },
    tags: ['browser', 'navigation', 'url-control'],
  },
  template: `version: "1.0"
name: browser-navigation
description: Control which URLs the agent may visit

rules:
  - id: browser-allowed-domains
    name: Browser domain allowlist
    description: Only allow navigation to approved domains
    enabled: true
    severity: high
    action: block
    tools:
      - navigate
      - goto
      - open_url
      - browser_navigate
    conditions:
      - field: arguments.url
        operator: not_in
        value: {{allowedDomains}}

  - id: browser-blocked-domains
    name: Browser domain blocklist
    description: Always block navigation to specific domains
    enabled: true
    severity: critical
    action: block
    tools:
      - navigate
      - goto
      - open_url
      - browser_navigate
    conditions:
      - field: arguments.url
        operator: in
        value: {{blockedDomains}}

  - id: browser-block-data-urls
    name: Block data URIs
    description: Prevent data URI navigation to block exfiltration
    enabled: {{blockDataUrls}}
    severity: critical
    action: block
    tools:
      - navigate
      - goto
      - open_url
      - browser_navigate
    conditions:
      - field: arguments.url
        operator: starts_with
        value: "data:"
`,
};

export default browserNavigation;
