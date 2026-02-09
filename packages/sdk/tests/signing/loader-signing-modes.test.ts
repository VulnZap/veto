/**
 * Tests for RuleLoader signed bundle handling behavior.
 * Addresses Greptile finding: ensure .signed.json files don't cause fatal errors
 * when signing is not configured or not required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { RuleLoader } from '../../src/rules/loader.js';
import { generateSigningKeyPair } from '../../src/signing/signer.js';
import { createSignedBundle, writeSignedBundle } from '../../src/signing/bundle.js';
import { SignatureVerificationError } from '../../src/signing/types.js';
import type { SigningConfig } from '../../src/signing/types.js';
import type { RuleSet } from '../../src/rules/types.js';

const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const testRuleSet: RuleSet = {
  version: '1.0',
  name: 'signed-rules',
  rules: [
    {
      id: 'signed-rule-1',
      name: 'No file deletion',
      enabled: true,
      severity: 'critical',
      action: 'block',
      tools: ['delete_file'],
    },
  ],
};

describe('RuleLoader signed bundle handling modes', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `veto-loader-signing-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true });
    }
  });

  describe('signing not configured', () => {
    it('should skip signed bundles with warning when signing is not configured', () => {
      // Create a valid signed bundle
      const { privateKey, keyId } = generateSigningKeyPair();
      const bundle = createSignedBundle(testRuleSet, privateKey, keyId);
      writeSignedBundle(bundle, join(tmpDir, 'rules.signed.json'));

      // Also create a YAML file to ensure other rules load
      writeFileSync(
        join(tmpDir, 'rules.yaml'),
        `rules:
  - id: yaml-rule
    name: YAML Rule
    enabled: true
    severity: low
    action: warn
`,
        'utf-8'
      );

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger }); // No signing config
      loader.setYamlParser(parse);

      // Should NOT throw
      const rules = loader.loadFromDirectory(tmpDir);

      // Should have only the YAML rule (signed bundle skipped)
      expect(rules.allRules).toHaveLength(1);
      expect(rules.allRules[0].id).toBe('yaml-rule');

      // Should have logged a warning
      expect(logger.warn).toHaveBeenCalledWith(
        'Skipping signed bundle: signing not configured',
        expect.objectContaining({ path: expect.stringContaining('rules.signed.json') })
      );
    });

    it('should not crash on default config with signed bundles present', () => {
      const { privateKey, keyId } = generateSigningKeyPair();
      const bundle = createSignedBundle(testRuleSet, privateKey, keyId);
      writeSignedBundle(bundle, join(tmpDir, 'policies.signed.json'));

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger }); // Default config, no signing
      loader.setYamlParser(parse);

      // This should NOT throw - the key behavior we're testing
      expect(() => loader.loadFromDirectory(tmpDir)).not.toThrow();
    });
  });

  describe('signing.enabled=false', () => {
    it('should skip signed bundles with warning when signing is disabled', () => {
      const { privateKey, keyId } = generateSigningKeyPair();
      const bundle = createSignedBundle(testRuleSet, privateKey, keyId);
      writeSignedBundle(bundle, join(tmpDir, 'rules.signed.json'));

      const signing: SigningConfig = {
        enabled: false,
        publicKeys: {},
      };

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger, signing });
      loader.setYamlParser(parse);

      const rules = loader.loadFromDirectory(tmpDir);

      expect(rules.allRules).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        'Skipping signed bundle: signing is disabled',
        expect.objectContaining({ path: expect.stringContaining('rules.signed.json') })
      );
    });
  });

  describe('signing.enabled=true, required=false', () => {
    it('should warn and skip on verification failure when required=false', () => {
      const { publicKey, keyId } = generateSigningKeyPair();
      const otherKey = generateSigningKeyPair();
      // Sign with a different key than configured
      const bundle = createSignedBundle(testRuleSet, otherKey.privateKey, otherKey.keyId);
      writeSignedBundle(bundle, join(tmpDir, 'rules.signed.json'));

      const signing: SigningConfig = {
        enabled: true,
        publicKeys: { [keyId]: publicKey },
        required: false,
      };

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger, signing });
      loader.setYamlParser(parse);

      // Should NOT throw
      const rules = loader.loadFromDirectory(tmpDir);

      // Rules from failed bundle should not be loaded
      expect(rules.allRules).toHaveLength(0);

      // Should warn about verification failure
      expect(logger.warn).toHaveBeenCalledWith(
        'Signed bundle verification failed, skipping',
        expect.objectContaining({
          path: expect.stringContaining('rules.signed.json'),
          error: expect.any(String),
        })
      );
    });

    it('should load valid signed bundles when required=false', () => {
      const { publicKey, privateKey, keyId } = generateSigningKeyPair();
      const bundle = createSignedBundle(testRuleSet, privateKey, keyId);
      writeSignedBundle(bundle, join(tmpDir, 'rules.signed.json'));

      const signing: SigningConfig = {
        enabled: true,
        publicKeys: { [keyId]: publicKey },
        required: false,
      };

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger, signing });
      loader.setYamlParser(parse);

      const rules = loader.loadFromDirectory(tmpDir);

      expect(rules.allRules).toHaveLength(1);
      expect(rules.allRules[0].id).toBe('signed-rule-1');
    });

    it('should continue loading YAML rules when signed bundle fails and required=false', () => {
      const { publicKey, keyId } = generateSigningKeyPair();
      const otherKey = generateSigningKeyPair();
      // Sign with wrong key
      const bundle = createSignedBundle(testRuleSet, otherKey.privateKey, otherKey.keyId);
      writeSignedBundle(bundle, join(tmpDir, 'bad.signed.json'));

      // Add a YAML rule
      writeFileSync(
        join(tmpDir, 'good.yaml'),
        `rules:
  - id: yaml-rule
    name: YAML Rule
    enabled: true
    severity: low
    action: warn
`,
        'utf-8'
      );

      const signing: SigningConfig = {
        enabled: true,
        publicKeys: { [keyId]: publicKey },
        required: false,
      };

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger, signing });
      loader.setYamlParser(parse);

      const rules = loader.loadFromDirectory(tmpDir);

      // Should have the YAML rule but not the signed bundle rule
      expect(rules.allRules).toHaveLength(1);
      expect(rules.allRules[0].id).toBe('yaml-rule');
    });
  });

  describe('signing.enabled=true, required=true (fail closed)', () => {
    it('should throw on verification failure when required=true', () => {
      const { publicKey, keyId } = generateSigningKeyPair();
      const otherKey = generateSigningKeyPair();
      // Sign with a different key
      const bundle = createSignedBundle(testRuleSet, otherKey.privateKey, otherKey.keyId);
      writeSignedBundle(bundle, join(tmpDir, 'rules.signed.json'));

      const signing: SigningConfig = {
        enabled: true,
        publicKeys: { [keyId]: publicKey },
        required: true,
      };

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger, signing });
      loader.setYamlParser(parse);

      expect(() => loader.loadFromDirectory(tmpDir)).toThrow(SignatureVerificationError);
    });

    it('should throw on tampered bundle when required=true', () => {
      const { publicKey, privateKey, keyId } = generateSigningKeyPair();
      const bundle = createSignedBundle(testRuleSet, privateKey, keyId);
      bundle.payload = '{"tampered": true}'; // Tamper with payload
      writeFileSync(join(tmpDir, 'rules.signed.json'), JSON.stringify(bundle, null, 2), 'utf-8');

      const signing: SigningConfig = {
        enabled: true,
        publicKeys: { [keyId]: publicKey },
        required: true,
      };

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger, signing });
      loader.setYamlParser(parse);

      expect(() => loader.loadFromDirectory(tmpDir)).toThrow(SignatureVerificationError);
    });

    it('should load valid signed bundles when required=true', () => {
      const { publicKey, privateKey, keyId } = generateSigningKeyPair();
      const bundle = createSignedBundle(testRuleSet, privateKey, keyId);
      writeSignedBundle(bundle, join(tmpDir, 'rules.signed.json'));

      const signing: SigningConfig = {
        enabled: true,
        publicKeys: { [keyId]: publicKey },
        required: true,
      };

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger, signing });
      loader.setYamlParser(parse);

      const rules = loader.loadFromDirectory(tmpDir);

      expect(rules.allRules).toHaveLength(1);
      expect(rules.allRules[0].id).toBe('signed-rule-1');
    });
  });

  describe('signing.required undefined (defaults to true - fail closed)', () => {
    it('should fail closed when required is undefined (security-first default)', () => {
      const { publicKey, keyId } = generateSigningKeyPair();
      const otherKey = generateSigningKeyPair();
      const bundle = createSignedBundle(testRuleSet, otherKey.privateKey, otherKey.keyId);
      writeSignedBundle(bundle, join(tmpDir, 'rules.signed.json'));

      const signing: SigningConfig = {
        enabled: true,
        publicKeys: { [keyId]: publicKey },
        // required is NOT set (undefined) - defaults to true
      };

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger, signing });
      loader.setYamlParser(parse);

      // Should throw because undefined required defaults to true (fail closed)
      expect(() => loader.loadFromDirectory(tmpDir)).toThrow(SignatureVerificationError);
    });
  });

  describe('multiple signed bundles', () => {
    it('should stop at first failure when required=true', () => {
      const { publicKey, privateKey, keyId } = generateSigningKeyPair();
      const otherKey = generateSigningKeyPair();

      // First bundle is valid
      const validBundle = createSignedBundle(testRuleSet, privateKey, keyId);
      writeSignedBundle(validBundle, join(tmpDir, '1-valid.signed.json'));

      // Second bundle is invalid
      const invalidBundle = createSignedBundle(testRuleSet, otherKey.privateKey, otherKey.keyId);
      writeSignedBundle(invalidBundle, join(tmpDir, '2-invalid.signed.json'));

      const signing: SigningConfig = {
        enabled: true,
        publicKeys: { [keyId]: publicKey },
        required: true,
      };

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger, signing });
      loader.setYamlParser(parse);

      expect(() => loader.loadFromDirectory(tmpDir)).toThrow(SignatureVerificationError);
    });

    it('should load all valid bundles and skip invalid when required=false', () => {
      const { publicKey, privateKey, keyId } = generateSigningKeyPair();
      const otherKey = generateSigningKeyPair();

      // Valid bundle
      const validRules: RuleSet = { ...testRuleSet, rules: [{ ...testRuleSet.rules[0], id: 'valid-rule' }] };
      const validBundle = createSignedBundle(validRules, privateKey, keyId);
      writeSignedBundle(validBundle, join(tmpDir, '1-valid.signed.json'));

      // Invalid bundle
      const invalidBundle = createSignedBundle(testRuleSet, otherKey.privateKey, otherKey.keyId);
      writeSignedBundle(invalidBundle, join(tmpDir, '2-invalid.signed.json'));

      const signing: SigningConfig = {
        enabled: true,
        publicKeys: { [keyId]: publicKey },
        required: false,
      };

      const logger = createMockLogger();
      const loader = new RuleLoader({ logger, signing });
      loader.setYamlParser(parse);

      const rules = loader.loadFromDirectory(tmpDir);

      // Should have only the valid bundle's rule
      expect(rules.allRules).toHaveLength(1);
      expect(rules.allRules[0].id).toBe('valid-rule');

      // Should warn about the invalid one
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
