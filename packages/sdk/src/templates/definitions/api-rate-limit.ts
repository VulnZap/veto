import type { PolicyTemplate } from '../types.js';

const apiRateLimit: PolicyTemplate = {
  metadata: {
    id: 'api-rate-limit',
    name: 'API Rate Limit',
    description: 'Enforce maximum call frequency for external API tools',
    category: 'network',
    complexity: 'intermediate',
    params: {
      tools: {
        type: 'array',
        items: 'string',
        description: 'Tool names subject to rate limiting',
        required: true,
      },
      maxCalls: {
        type: 'number',
        description: 'Maximum number of calls allowed in the window',
        default: 100,
      },
      windowSeconds: {
        type: 'number',
        description: 'Time window in seconds',
        default: 60,
      },
    },
    tags: ['api', 'rate-limit', 'network'],
  },
  template: `version: "1.0"
name: api-rate-limit
description: Enforce call frequency limits on API tools

settings:
  default_action: allow

rules:
  - id: api-call-frequency
    name: API call frequency limit
    description: Block calls that exceed the rate limit
    enabled: true
    severity: medium
    action: block
    tools: {{tools}}
    metadata:
      max_calls: {{maxCalls}}
      window_seconds: {{windowSeconds}}
      rate_limit: true
`,
};

export default apiRateLimit;
