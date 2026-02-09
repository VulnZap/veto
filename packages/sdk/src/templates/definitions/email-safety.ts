import type { PolicyTemplate } from '../types.js';

const emailSafety: PolicyTemplate = {
  metadata: {
    id: 'email-safety',
    name: 'Email Safety',
    description: 'Restrict email sending to approved domains and cap recipients per message',
    category: 'communication',
    complexity: 'basic',
    params: {
      allowedDomains: {
        type: 'array',
        items: 'string',
        description: 'Approved email domains (e.g. company.com)',
        required: true,
      },
      maxRecipients: {
        type: 'number',
        description: 'Maximum recipients per email',
        default: 10,
      },
    },
    tags: ['email', 'communication', 'safety'],
  },
  template: `version: "1.0"
name: email-safety
description: Restrict email sending to approved domains and cap recipients

rules:
  - id: email-domain-allowlist
    name: Email domain allowlist
    description: Only allow emails to approved domains
    enabled: true
    severity: high
    action: block
    tools:
      - send_email
      - send_message
      - gmail_send
    conditions:
      - field: arguments.to
        operator: not_in
        value: {{allowedDomains}}

  - id: email-recipient-limit
    name: Email recipient limit
    description: Cap the number of recipients per email
    enabled: true
    severity: medium
    action: block
    tools:
      - send_email
      - send_message
      - gmail_send
    conditions:
      - field: arguments.to
        operator: greater_than
        value: {{maxRecipients}}
`,
};

export default emailSafety;
