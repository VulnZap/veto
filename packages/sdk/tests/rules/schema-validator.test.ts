import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { validatePolicyIR, PolicySchemaError } from '../../src/rules/schema-validator.js';

const FIXTURES_DIR = join(__dirname, '..', '..', '..', '..', 'conformance', 'fixtures', 'policy-ir');

function loadFixture(name: string): unknown {
  const content = readFileSync(join(FIXTURES_DIR, name), 'utf-8');
  return parseYaml(content);
}

describe('Policy IR v1 Schema Validator', () => {
  describe('valid documents', () => {
    it('should accept valid-minimal.yaml', () => {
      const data = loadFixture('valid-minimal.yaml');
      expect(() => validatePolicyIR(data)).not.toThrow();
    });

    it('should accept valid-full.yaml', () => {
      const data = loadFixture('valid-full.yaml');
      expect(() => validatePolicyIR(data)).not.toThrow();
    });
  });

  describe('invalid documents', () => {
    it('should reject missing version', () => {
      const data = loadFixture('invalid-missing-version.yaml');
      expect(() => validatePolicyIR(data)).toThrow(PolicySchemaError);
      try {
        validatePolicyIR(data);
      } catch (e) {
        const err = e as PolicySchemaError;
        expect(err.errors.some((v) => v.message.includes('version'))).toBe(true);
      }
    });

    it('should reject wrong version', () => {
      const data = loadFixture('invalid-wrong-version.yaml');
      expect(() => validatePolicyIR(data)).toThrow(PolicySchemaError);
    });

    it('should reject missing rules', () => {
      const data = loadFixture('invalid-missing-rules.yaml');
      expect(() => validatePolicyIR(data)).toThrow(PolicySchemaError);
      try {
        validatePolicyIR(data);
      } catch (e) {
        const err = e as PolicySchemaError;
        expect(err.errors.some((v) => v.message.includes('rules'))).toBe(true);
      }
    });

    it('should reject bad action', () => {
      const data = loadFixture('invalid-bad-action.yaml');
      expect(() => validatePolicyIR(data)).toThrow(PolicySchemaError);
    });

    it('should reject bad operator', () => {
      const data = loadFixture('invalid-bad-operator.yaml');
      expect(() => validatePolicyIR(data)).toThrow(PolicySchemaError);
    });

    it('should reject extra fields on rules', () => {
      const data = loadFixture('invalid-extra-field.yaml');
      expect(() => validatePolicyIR(data)).toThrow(PolicySchemaError);
    });

    it('should reject rule missing id', () => {
      const data = loadFixture('invalid-rule-missing-id.yaml');
      expect(() => validatePolicyIR(data)).toThrow(PolicySchemaError);
    });
  });

  describe('error quality', () => {
    it('should produce actionable error messages', () => {
      try {
        validatePolicyIR({
          version: '1.0',
          rules: [
            { name: 'no-id-no-action' },
          ],
        });
        expect.unreachable('should have thrown');
      } catch (e) {
        const err = e as PolicySchemaError;
        expect(err.errors.length).toBeGreaterThanOrEqual(2);
        const paths = err.errors.map((v) => v.path);
        expect(paths.some((p) => p.includes('/rules/0'))).toBe(true);
        expect(err.message).toContain('Invalid policy document');
      }
    });

    it('should report all errors at once', () => {
      try {
        validatePolicyIR({});
        expect.unreachable('should have thrown');
      } catch (e) {
        const err = e as PolicySchemaError;
        expect(err.errors.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
