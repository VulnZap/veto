import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const TEMPLATES_DIR = resolve(import.meta.dirname, '../../templates/browser');

function loadPolicy(filename: string) {
  const content = readFileSync(resolve(TEMPLATES_DIR, filename), 'utf-8');
  return parseYaml(content) as {
    version: string;
    name: string;
    description: string;
    rules: Array<{
      id: string;
      name: string;
      enabled: boolean;
      severity: string;
      action: string;
      tools: string[];
      conditions: Array<{ field: string; operator: string; value: unknown }>;
    }>;
  };
}

describe('browser starter policies', () => {
  describe('browser-safe-navigation.yaml', () => {
    const policy = loadPolicy('browser-safe-navigation.yaml');

    it('should be a valid rule set', () => {
      expect(policy.version).toBe('1.0');
      expect(policy.name).toBe('browser-safe-navigation');
      expect(policy.rules.length).toBeGreaterThan(0);
    });

    it('should have all rules enabled', () => {
      for (const rule of policy.rules) {
        expect(rule.enabled).toBe(true);
      }
    });

    it('should target browser.navigate tool', () => {
      for (const rule of policy.rules) {
        expect(rule.tools).toContain('browser.navigate');
      }
    });

    it('should block data: URLs', () => {
      const dataRule = policy.rules.find(r => r.id === 'block-data-urls');
      expect(dataRule).toBeDefined();
      expect(dataRule!.action).toBe('block');
      expect(dataRule!.severity).toBe('critical');
    });

    it('should block javascript: URLs', () => {
      const jsRule = policy.rules.find(r => r.id === 'block-javascript-urls');
      expect(jsRule).toBeDefined();
      expect(jsRule!.action).toBe('block');
      expect(jsRule!.severity).toBe('critical');
    });

    it('should block file: URLs', () => {
      const fileRule = policy.rules.find(r => r.id === 'block-file-urls');
      expect(fileRule).toBeDefined();
      expect(fileRule!.action).toBe('block');
    });

    it('should block internal network addresses', () => {
      const internalRule = policy.rules.find(r => r.id === 'block-internal-networks');
      expect(internalRule).toBeDefined();
      expect(internalRule!.action).toBe('block');
    });
  });

  describe('browser-safe-input.yaml', () => {
    const policy = loadPolicy('browser-safe-input.yaml');

    it('should be a valid rule set', () => {
      expect(policy.version).toBe('1.0');
      expect(policy.name).toBe('browser-safe-input');
      expect(policy.rules.length).toBeGreaterThan(0);
    });

    it('should block password field filling', () => {
      const pwRule = policy.rules.find(r => r.id === 'block-password-fill');
      expect(pwRule).toBeDefined();
      expect(pwRule!.action).toBe('block');
      expect(pwRule!.severity).toBe('critical');
    });

    it('should block credit card field filling', () => {
      const ccRule = policy.rules.find(r => r.id === 'block-credit-card-fill');
      expect(ccRule).toBeDefined();
      expect(ccRule!.action).toBe('block');
    });

    it('should target browser.fill and browser.type tools', () => {
      const inputRule = policy.rules.find(r => r.id === 'block-password-fill');
      expect(inputRule!.tools).toContain('browser.fill');
      expect(inputRule!.tools).toContain('browser.type');
    });
  });

  describe('browser-safe-downloads.yaml', () => {
    const policy = loadPolicy('browser-safe-downloads.yaml');

    it('should be a valid rule set', () => {
      expect(policy.version).toBe('1.0');
      expect(policy.name).toBe('browser-safe-downloads');
      expect(policy.rules.length).toBeGreaterThan(0);
    });

    it('should block executable downloads', () => {
      const exeRule = policy.rules.find(r => r.id === 'block-executable-downloads');
      expect(exeRule).toBeDefined();
      expect(exeRule!.action).toBe('block');
      expect(exeRule!.severity).toBe('critical');
    });

    it('should target browser.download tool', () => {
      for (const rule of policy.rules) {
        expect(rule.tools).toContain('browser.download');
      }
    });

    it('should allow safe document downloads', () => {
      const safeRule = policy.rules.find(r => r.id === 'allow-safe-document-downloads');
      expect(safeRule).toBeDefined();
      expect(safeRule!.action).toBe('allow');
    });

    it('should have all required rule fields', () => {
      for (const rule of policy.rules) {
        expect(rule.id).toBeDefined();
        expect(rule.name).toBeDefined();
        expect(rule.action).toBeDefined();
        expect(rule.severity).toBeDefined();
        expect(rule.tools).toBeDefined();
        expect(rule.conditions).toBeDefined();
        expect(rule.conditions.length).toBeGreaterThan(0);
      }
    });
  });
});
