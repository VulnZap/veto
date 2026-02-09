import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { RuleLoader } from '../../src/rules/loader.js';
import { generateSigningKeyPair } from '../../src/signing/signer.js';
import { createSignedBundle, writeSignedBundle } from '../../src/signing/bundle.js';
import { SignatureVerificationError } from '../../src/signing/types.js';
import type { SigningConfig } from '../../src/signing/types.js';
import type { RuleSet } from '../../src/rules/types.js';

const mockLogger = () => ({
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

function makeTmpDir(): string {
  const dir = join(tmpdir(), `veto-loader-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('RuleLoader signed bundle integration', () => {
  it('should load verified signed bundles from directory', () => {
    const dir = makeTmpDir();
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);
    writeSignedBundle(bundle, join(dir, 'rules.signed.json'));

    const signing: SigningConfig = {
      enabled: true,
      publicKeys: { [keyId]: publicKey },
      required: true,
    };

    const loader = new RuleLoader({ logger: mockLogger(), signing });
    loader.setYamlParser(() => ({}));
    const rules = loader.loadFromDirectory(dir);

    expect(rules.allRules).toHaveLength(1);
    expect(rules.allRules[0].id).toBe('signed-rule-1');

    rmSync(dir, { recursive: true });
  });

  it('should reject tampered signed bundle', () => {
    const dir = makeTmpDir();
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    // Tamper with the payload
    bundle.payload = '{"tampered": true}';
    writeFileSync(join(dir, 'rules.signed.json'), JSON.stringify(bundle, null, 2), 'utf-8');

    const signing: SigningConfig = {
      enabled: true,
      publicKeys: { [keyId]: publicKey },
      required: true,
    };

    const loader = new RuleLoader({ logger: mockLogger(), signing });
    loader.setYamlParser(() => ({}));

    expect(() => loader.loadFromDirectory(dir)).toThrow(SignatureVerificationError);

    rmSync(dir, { recursive: true });
  });

  it('should fail when signing is required but not configured', () => {
    const dir = makeTmpDir();
    const { privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);
    writeSignedBundle(bundle, join(dir, 'rules.signed.json'));

    // No signing config
    const loader = new RuleLoader({ logger: mockLogger() });
    loader.setYamlParser(() => ({}));

    expect(() => loader.loadFromSignedBundle(join(dir, 'rules.signed.json')))
      .toThrow(SignatureVerificationError);

    rmSync(dir, { recursive: true });
  });

  it('should load both YAML and signed bundles from the same directory', () => {
    const dir = makeTmpDir();
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();

    // Create signed bundle
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);
    writeSignedBundle(bundle, join(dir, 'signed.signed.json'));

    // Create YAML file
    writeFileSync(join(dir, 'extra.yaml'), `
rules:
  - id: yaml-rule-1
    name: YAML rule
    enabled: true
    severity: low
    action: warn
`, 'utf-8');

    const signing: SigningConfig = {
      enabled: true,
      publicKeys: { [keyId]: publicKey },
      required: true,
    };

    const loader = new RuleLoader({ logger: mockLogger(), signing });
    loader.setYamlParser(parse);
    const rules = loader.loadFromDirectory(dir);

    // Should have rules from both sources
    expect(rules.allRules.length).toBe(2);
    const ruleIds = rules.allRules.map(r => r.id);
    expect(ruleIds).toContain('signed-rule-1');
    expect(ruleIds).toContain('yaml-rule-1');

    rmSync(dir, { recursive: true });
  });
});
