import { describe, it, expect } from 'vitest';
import {
  applyTemplate,
  validateParams,
  TemplateValidationError,
} from '../../src/templates/engine.js';
import { getTemplate, getTemplateIds } from '../../src/templates/registry.js';

describe('Template engine', () => {
  describe('validateParams', () => {
    it('should accept valid params', () => {
      const template = getTemplate('email-safety')!;
      const resolved = validateParams(template, {
        allowedDomains: ['company.com', 'partner.com'],
        maxRecipients: 5,
      });
      expect(resolved.allowedDomains).toEqual(['company.com', 'partner.com']);
      expect(resolved.maxRecipients).toBe(5);
    });

    it('should apply defaults for missing optional params', () => {
      const template = getTemplate('email-safety')!;
      const resolved = validateParams(template, {
        allowedDomains: ['company.com'],
      });
      expect(resolved.maxRecipients).toBe(10);
    });

    it('should throw on missing required param', () => {
      const template = getTemplate('email-safety')!;
      expect(() => validateParams(template, {})).toThrow(TemplateValidationError);
      expect(() => validateParams(template, {})).toThrow('required');
    });

    it('should throw on wrong type', () => {
      const template = getTemplate('email-safety')!;
      expect(() =>
        validateParams(template, { allowedDomains: 'not-an-array' })
      ).toThrow(TemplateValidationError);
      expect(() =>
        validateParams(template, { allowedDomains: 'not-an-array' })
      ).toThrow('expected array');
    });

    it('should throw on wrong array item type', () => {
      const template = getTemplate('email-safety')!;
      expect(() =>
        validateParams(template, { allowedDomains: [123, 456] })
      ).toThrow(TemplateValidationError);
      expect(() =>
        validateParams(template, { allowedDomains: [123, 456] })
      ).toThrow('expected string');
    });

    it('should throw on unknown param', () => {
      const template = getTemplate('email-safety')!;
      expect(() =>
        validateParams(template, {
          allowedDomains: ['a.com'],
          unknownParam: 'hello',
        })
      ).toThrow(TemplateValidationError);
      expect(() =>
        validateParams(template, {
          allowedDomains: ['a.com'],
          unknownParam: 'hello',
        })
      ).toThrow('unknown parameter');
    });

    it('should validate boolean params', () => {
      const template = getTemplate('data-classification')!;
      const resolved = validateParams(template, { blockSSN: false });
      expect(resolved.blockSSN).toBe(false);
    });

    it('should reject non-boolean for boolean params', () => {
      const template = getTemplate('data-classification')!;
      expect(() =>
        validateParams(template, { blockSSN: 'yes' })
      ).toThrow('expected boolean');
    });

    it('should reject NaN for number params', () => {
      const template = getTemplate('email-safety')!;
      expect(() =>
        validateParams(template, {
          allowedDomains: ['a.com'],
          maxRecipients: NaN,
        })
      ).toThrow('expected number');
    });
  });

  describe('applyTemplate', () => {
    it('should substitute params into template', () => {
      const template = getTemplate('email-safety')!;
      const output = applyTemplate(template, {
        allowedDomains: ['company.com', 'partner.com'],
        maxRecipients: 5,
      });
      expect(output).toContain('["company.com", "partner.com"]');
      expect(output).toContain('value: 5');
      expect(output).not.toContain('{{');
    });

    it('should produce valid YAML structure', () => {
      const template = getTemplate('file-access')!;
      const output = applyTemplate(template, {
        allowedRoot: '/home/user/project',
      });
      expect(output).toContain('version: "1.0"');
      expect(output).toContain('name: file-access');
      expect(output).toContain('rules:');
      expect(output).toContain('"/home/user/project"');
    });

    it('should handle boolean substitution', () => {
      const template = getTemplate('browser-navigation')!;
      const output = applyTemplate(template, {
        allowedDomains: ['example.com'],
        blockDataUrls: false,
      });
      expect(output).toContain('enabled: false');
    });

    it('should apply all templates with valid default params', () => {
      const ids = getTemplateIds();
      for (const id of ids) {
        const template = getTemplate(id)!;
        const params: Record<string, unknown> = {};
        for (const [name, schema] of Object.entries(template.metadata.params)) {
          if (schema.required) {
            switch (schema.type) {
              case 'string':
                params[name] = 'test-value';
                break;
              case 'number':
                params[name] = 42;
                break;
              case 'boolean':
                params[name] = true;
                break;
              case 'array':
                params[name] = schema.items === 'number' ? [1, 2, 3] : ['a', 'b', 'c'];
                break;
            }
          }
        }
        const output = applyTemplate(template, params);
        expect(output).toContain('version:');
        expect(output).toContain('rules:');
        expect(output).not.toContain('{{');
      }
    });
  });
});
