// src/config/schema.ts
// .leash file schema and validation

import type { Policy } from '../types.js';

export interface LeashConfig {
  version: 1;
  policies: string[];
  settings?: LeashSettings;
  cloud?: LeashCloudConfig;
}

export interface LeashSettings {
  fail_closed?: boolean;
  audit_log?: boolean;
  verbose?: boolean;
}

export interface LeashCloudConfig {
  team_id?: string;
  sync?: boolean;
}

export interface CompiledLeashConfig {
  version: 1;
  policies: Array<{
    restriction: string;
    policy: Policy;
  }>;
  settings: LeashSettings;
  cloud?: LeashCloudConfig;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: LeashSettings = {
  fail_closed: true,
  audit_log: false,
  verbose: false,
};

/**
 * Validate a .leash config object
 */
export function validateConfig(config: unknown): config is LeashConfig {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  const c = config as Record<string, unknown>;

  // Version check
  if (c.version !== 1) {
    return false;
  }

  // Policies must be array of strings
  if (!Array.isArray(c.policies)) {
    return false;
  }

  for (const policy of c.policies) {
    if (typeof policy !== 'string') {
      return false;
    }
  }

  // Settings are optional
  if (c.settings !== undefined) {
    if (typeof c.settings !== 'object' || c.settings === null) {
      return false;
    }
  }

  return true;
}

/**
 * Generate a default .leash config
 */
export function generateDefaultConfig(): LeashConfig {
  return {
    version: 1,
    policies: [
      "don't delete test files",
      "protect .env",
    ],
    settings: {
      fail_closed: true,
      audit_log: false,
    },
  };
}

/**
 * Generate YAML content for a .leash file
 */
export function generateLeashYaml(config: LeashConfig): string {
  const lines: string[] = [
    '# .leash - Veto Leash project configuration',
    '# Commit this file to version control',
    '',
    'version: 1',
    '',
    '# Natural language restrictions',
    'policies:',
  ];

  for (const policy of config.policies) {
    lines.push(`  - "${policy}"`);
  }

  if (config.settings) {
    lines.push('');
    lines.push('# Optional settings');
    lines.push('settings:');
    if (config.settings.fail_closed !== undefined) {
      lines.push(`  fail_closed: ${config.settings.fail_closed}`);
    }
    if (config.settings.audit_log !== undefined) {
      lines.push(`  audit_log: ${config.settings.audit_log}`);
    }
  }

  if (config.cloud) {
    lines.push('');
    lines.push('# Leash Cloud (coming soon)');
    lines.push('# cloud:');
    lines.push('#   team_id: "team_xxx"');
    lines.push('#   sync: true');
  }

  lines.push('');
  return lines.join('\n');
}
