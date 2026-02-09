import type { PolicyTemplate } from '../types.js';

const dataClassification: PolicyTemplate = {
  metadata: {
    id: 'data-classification',
    name: 'Data Classification',
    description: 'Block tool calls that contain PII or sensitive data patterns',
    category: 'data-protection',
    complexity: 'intermediate',
    params: {
      blockSSN: {
        type: 'boolean',
        description: 'Block social security number patterns',
        default: true,
      },
      blockCreditCard: {
        type: 'boolean',
        description: 'Block credit card number patterns',
        default: true,
      },
      blockEmail: {
        type: 'boolean',
        description: 'Block email address patterns in outbound data',
        default: false,
      },
      customPatterns: {
        type: 'array',
        items: 'string',
        description: 'Additional regex patterns to block',
        default: [],
      },
    },
    tags: ['pii', 'data-protection', 'compliance'],
  },
  template: `version: "1.0"
name: data-classification
description: Block tool calls containing PII or sensitive data

rules:
  - id: block-ssn-patterns
    name: Block SSN patterns
    description: Prevent sending social security numbers
    enabled: {{blockSSN}}
    severity: critical
    action: block
    conditions:
      - field: arguments
        operator: matches
        value: "\\\\b\\\\d{3}-\\\\d{2}-\\\\d{4}\\\\b"

  - id: block-credit-card-patterns
    name: Block credit card patterns
    description: Prevent sending credit card numbers
    enabled: {{blockCreditCard}}
    severity: critical
    action: block
    conditions:
      - field: arguments
        operator: matches
        value: "\\\\b\\\\d{4}[- ]?\\\\d{4}[- ]?\\\\d{4}[- ]?\\\\d{4}\\\\b"

  - id: block-email-patterns
    name: Block email address patterns
    description: Prevent leaking email addresses in outbound data
    enabled: {{blockEmail}}
    severity: high
    action: block
    conditions:
      - field: arguments
        operator: matches
        value: "\\\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\\\.[A-Z|a-z]{2,}\\\\b"

  - id: block-custom-patterns
    name: Block custom sensitive patterns
    description: Block data matching custom regex patterns
    enabled: true
    severity: high
    action: block
    metadata:
      patterns: {{customPatterns}}
`,
};

export default dataClassification;
