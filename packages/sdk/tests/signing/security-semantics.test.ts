/**
 * Tests for signing security semantics.
 *
 * Addresses Greptile findings:
 * 1. signing.required default consistency
 * 2. verifyBundle key-id trust semantics
 * 3. RuleLoader duplicate state accumulation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { RuleLoader } from '../../src/rules/loader.js';
import { generateSigningKeyPair } from '../../src/signing/signer.js';
import {
  createSignedBundle,
  verifyBundle,
  writeSignedBundle,
} from '../../src/signing/bundle.js';
import {
  SignatureVerificationError,
  SIGNING_REQUIRED_DEFAULT,
  isSigningRequired,
} from '../../src/signing/types.js';
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
  name: 'test-rules',
  rules: [
    {
      id: 'rule-1',
      name: 'Test Rule',
      enabled: true,
      severity: 'high',
      action: 'block',
      tools: ['test_tool'],
    },
  ],
};

describe('signing.required default semantics', () => {
  it('SIGNING_REQUIRED_DEFAULT should be true (fail closed)', () => {
    expect(SIGNING_REQUIRED_DEFAULT).toBe(true);
  });

  describe('isSigningRequired helper', () => {
    it('should return false when config is undefined', () => {
      expect(isSigningRequired(undefined)).toBe(false);
    });

    it('should return false when signing is not enabled', () => {
      const config: SigningConfig = {
        enabled: false,
        publicKeys: {},
      };
      expect(isSigningRequired(config)).toBe(false);
    });

    it('should return true (default) when enabled and required is undefined', () => {
      const config: SigningConfig = {
        enabled: true,
        publicKeys: {},
        // required is undefined
      };
      expect(isSigningRequired(config)).toBe(true);
    });

    it('should return true when enabled and required is true', () => {
      const config: SigningConfig = {
        enabled: true,
        publicKeys: {},
        required: true,
      };
      expect(isSigningRequired(config)).toBe(true);
    });

    it('should return false when enabled and required is false', () => {
      const config: SigningConfig = {
        enabled: true,
        publicKeys: {},
        required: false,
      };
      expect(isSigningRequired(config)).toBe(false);
    });
  });

  it('config parser and loader should use same default', () => {
    // This test documents the expected behavior:
    // When signing.enabled=true and required is not specified,
    // both config parser and loader should treat it as required=true
    const config: SigningConfig = {
      enabled: true,
      publicKeys: {},
      // required not specified - should default to SIGNING_REQUIRED_DEFAULT
    };
    expect(isSigningRequired(config)).toBe(SIGNING_REQUIRED_DEFAULT);
  });
});

describe('verifyBundle key-id trust semantics', () => {
  it('should verify with matching key ID', () => {
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    // Should succeed - key ID matches
    expect(() => verifyBundle(bundle, { [keyId]: publicKey })).not.toThrow();
  });

  it('should fail when key ID is not in trusted keys (strict mode)', () => {
    const signingKey = generateSigningKeyPair();
    const otherKey = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, signingKey.privateKey, signingKey.keyId);

    // By default (strict mode), should fail because bundle.publicKeyId is not in trusted keys
    expect(() => verifyBundle(bundle, { [otherKey.keyId]: otherKey.publicKey }))
      .toThrow(SignatureVerificationError);
  });

  it('should fail with clear error message when key ID not trusted', () => {
    const signingKey = generateSigningKeyPair();
    const otherKey = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, signingKey.privateKey, signingKey.keyId);

    expect(() => verifyBundle(bundle, { [otherKey.keyId]: otherKey.publicKey }))
      .toThrow(/not in trusted public keys/);
  });

  it('should NOT try all keys by default when key ID not found', () => {
    const signingKey = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, signingKey.privateKey, signingKey.keyId);

    // Even though the key is in the set (under different ID), strict mode should fail
    const publicKeys = {
      'different-key-id': signingKey.publicKey,
    };

    expect(() => verifyBundle(bundle, publicKeys)).toThrow(SignatureVerificationError);
  });

  it('should try all keys when allowKeyRotation=true and key ID not found', () => {
    const signingKey = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, signingKey.privateKey, signingKey.keyId);

    // Key registered under different ID
    const publicKeys = {
      'rotated-key-id': signingKey.publicKey,
    };

    // With allowKeyRotation, should succeed
    expect(() => verifyBundle(bundle, publicKeys, { allowKeyRotation: true })).not.toThrow();
  });

  it('should fail even with allowKeyRotation if no key can verify', () => {
    const signingKey = generateSigningKeyPair();
    const otherKey = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, signingKey.privateKey, signingKey.keyId);

    const publicKeys = {
      'some-id': otherKey.publicKey,
    };

    expect(() => verifyBundle(bundle, publicKeys, { allowKeyRotation: true }))
      .toThrow(SignatureVerificationError);
  });

  it('should only use matching key when key ID is in trusted keys', () => {
    const signingKey = generateSigningKeyPair();
    const otherKey = generateSigningKeyPair();

    // Create bundle with signingKey
    const bundle = createSignedBundle(testRuleSet, signingKey.privateKey, signingKey.keyId);

    // Tamper: register wrong public key under the correct key ID
    const publicKeys = {
      [signingKey.keyId]: otherKey.publicKey, // Wrong key for this ID
      'backup-key': signingKey.publicKey, // Correct key under different ID
    };

    // Should fail because it only tries the key matching bundle.publicKeyId
    expect(() => verifyBundle(bundle, publicKeys)).toThrow(SignatureVerificationError);
  });
});

describe('RuleLoader duplicate state accumulation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `veto-loader-dup-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it('should clear state on repeated loadFromDirectory calls', () => {
    writeFileSync(
      join(tmpDir, 'rules.yaml'),
      `rules:
  - id: rule-1
    name: Rule 1
    enabled: true
    severity: low
    action: warn
`,
      'utf-8'
    );

    const logger = createMockLogger();
    const loader = new RuleLoader({ logger });
    loader.setYamlParser(parse);

    // First load
    const rules1 = loader.loadFromDirectory(tmpDir);
    expect(rules1.allRules).toHaveLength(1);
    expect(rules1.sourceFiles).toHaveLength(1);

    // Second load - should NOT accumulate
    const rules2 = loader.loadFromDirectory(tmpDir);
    expect(rules2.allRules).toHaveLength(1);
    expect(rules2.sourceFiles).toHaveLength(1);

    // Third load - still no accumulation
    const rules3 = loader.loadFromDirectory(tmpDir);
    expect(rules3.allRules).toHaveLength(1);
    expect(rules3.sourceFiles).toHaveLength(1);
  });

  it('should not have duplicate rules after multiple loads', () => {
    writeFileSync(
      join(tmpDir, 'a.yaml'),
      `rules:
  - id: rule-a
    name: Rule A
    enabled: true
    severity: low
    action: warn
`,
      'utf-8'
    );

    writeFileSync(
      join(tmpDir, 'b.yaml'),
      `rules:
  - id: rule-b
    name: Rule B
    enabled: true
    severity: low
    action: warn
`,
      'utf-8'
    );

    const logger = createMockLogger();
    const loader = new RuleLoader({ logger });
    loader.setYamlParser(parse);

    // Load multiple times
    loader.loadFromDirectory(tmpDir);
    loader.loadFromDirectory(tmpDir);
    loader.loadFromDirectory(tmpDir);

    const rules = loader.getRules();
    expect(rules.allRules).toHaveLength(2);
    expect(rules.sourceFiles).toHaveLength(2);

    const ruleIds = rules.allRules.map(r => r.id);
    expect(ruleIds).toContain('rule-a');
    expect(ruleIds).toContain('rule-b');
  });

  it('should skip duplicate source files in direct loadFromFile calls', () => {
    const filePath = join(tmpDir, 'rules.yaml');
    writeFileSync(
      filePath,
      `rules:
  - id: rule-1
    name: Rule 1
    enabled: true
    severity: low
    action: warn
`,
      'utf-8'
    );

    const logger = createMockLogger();
    const loader = new RuleLoader({ logger });
    loader.setYamlParser(parse);

    // Load file first time
    loader.loadFromFile(filePath);
    expect(loader.getRules().sourceFiles).toHaveLength(1);
    expect(loader.getRules().ruleSets).toHaveLength(1);

    // Try to load same file again - should be skipped
    loader.loadFromFile(filePath);
    expect(loader.getRules().sourceFiles).toHaveLength(1);
    expect(loader.getRules().ruleSets).toHaveLength(1);

    // Build index to verify rules
    const rules = loader.getRules();
    // Note: allRules is only populated after buildIndex (called in loadFromDirectory)
    // For direct loadFromFile calls, check ruleSets
    expect(rules.ruleSets).toHaveLength(1);
    expect(rules.ruleSets[0].rules).toHaveLength(1);
  });

  it('should rebuild index correctly after clear', () => {
    writeFileSync(
      join(tmpDir, 'rules.yaml'),
      `rules:
  - id: rule-tool
    name: Tool Rule
    enabled: true
    severity: low
    action: warn
    tools: [my_tool]
  - id: rule-global
    name: Global Rule
    enabled: true
    severity: low
    action: warn
`,
      'utf-8'
    );

    const logger = createMockLogger();
    const loader = new RuleLoader({ logger });
    loader.setYamlParser(parse);

    loader.loadFromDirectory(tmpDir);
    let rules = loader.getRules();

    expect(rules.globalRules).toHaveLength(1);
    expect(rules.rulesByTool.get('my_tool')).toHaveLength(1);

    // Clear and reload
    loader.clear();
    expect(loader.getRules().allRules).toHaveLength(0);
    expect(loader.getRules().globalRules).toHaveLength(0);

    loader.loadFromDirectory(tmpDir);
    rules = loader.getRules();

    expect(rules.globalRules).toHaveLength(1);
    expect(rules.rulesByTool.get('my_tool')).toHaveLength(1);
  });

  it('should handle signed bundles without duplication', () => {
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

    // Load multiple times
    loader.loadFromDirectory(tmpDir);
    loader.loadFromDirectory(tmpDir);

    const rules = loader.getRules();
    expect(rules.allRules).toHaveLength(1);
    expect(rules.sourceFiles).toHaveLength(1);
  });
});
