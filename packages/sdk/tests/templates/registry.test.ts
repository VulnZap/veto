import { describe, it, expect } from 'vitest';
import {
  listTemplates,
  getTemplate,
  listByCategory,
  getTemplateIds,
} from '../../src/templates/registry.js';

describe('Template registry', () => {
  it('should list all templates', () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(6);
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.complexity).toBeTruthy();
      expect(t.tags.length).toBeGreaterThan(0);
    }
  });

  it('should return unique template ids', () => {
    const ids = getTemplateIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should get template by id', () => {
    const template = getTemplate('email-safety');
    expect(template).toBeDefined();
    expect(template!.metadata.id).toBe('email-safety');
    expect(template!.template).toContain('version:');
  });

  it('should return undefined for unknown id', () => {
    expect(getTemplate('nonexistent')).toBeUndefined();
  });

  it('should filter by category', () => {
    const network = listByCategory('network');
    expect(network.length).toBeGreaterThanOrEqual(2);
    for (const t of network) {
      expect(t.category).toBe('network');
    }
  });

  it('should have params defined for every template', () => {
    const templates = listTemplates();
    for (const t of templates) {
      expect(Object.keys(t.params).length).toBeGreaterThan(0);
      for (const [name, schema] of Object.entries(t.params)) {
        expect(name).toBeTruthy();
        expect(schema.type).toBeTruthy();
        expect(schema.description).toBeTruthy();
      }
    }
  });

  it('should have at least one required param or all optional with defaults', () => {
    const templates = listTemplates();
    for (const t of templates) {
      const hasRequired = Object.values(t.params).some((s) => s.required);
      const allHaveDefaults = Object.values(t.params).every(
        (s) => s.required || s.default !== undefined
      );
      expect(hasRequired || allHaveDefaults).toBe(true);
    }
  });
});
