import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateSigningKeyPair } from '../../src/signing/signer.js';
import {
  createSignedBundle,
  verifyBundle,
  verifyBundleWithConfig,
  parseBundlePayload,
  readSignedBundle,
  writeSignedBundle,
} from '../../src/signing/bundle.js';
import {
  SignatureVerificationError,
  BundleFormatError,
  BundlePinError,
} from '../../src/signing/types.js';
import type { SigningConfig } from '../../src/signing/types.js';
import type { RuleSet } from '../../src/rules/types.js';

const testRuleSet: RuleSet = {
  version: '1.0',
  name: 'test-rules',
  rules: [
    {
      id: 'rule-1',
      name: 'Block dangerous tools',
      enabled: true,
      severity: 'high',
      action: 'block',
      tools: ['rm_rf'],
      conditions: [
        { field: 'arguments.path', operator: 'starts_with', value: '/' },
      ],
    },
  ],
};

function makeTmpDir(): string {
  const dir = join(tmpdir(), `veto-signing-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('createSignedBundle', () => {
  it('should create a valid signed bundle', () => {
    const { privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    expect(bundle.payload).toBeTruthy();
    expect(bundle.signature).toBeTruthy();
    expect(bundle.publicKeyId).toBe(keyId);
    expect(bundle.version).toBe('1.0');
    expect(bundle.payloadHash).toHaveLength(64);
    expect(bundle.signedAt).toBeTruthy();
  });

  it('should produce deterministic payloads', () => {
    const { privateKey, keyId } = generateSigningKeyPair();
    const bundle1 = createSignedBundle(testRuleSet, privateKey, keyId);
    const bundle2 = createSignedBundle(testRuleSet, privateKey, keyId);

    expect(bundle1.payload).toBe(bundle2.payload);
    expect(bundle1.payloadHash).toBe(bundle2.payloadHash);
  });
});

describe('verifyBundle', () => {
  it('should verify a valid bundle', () => {
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    expect(() => verifyBundle(bundle, { [keyId]: publicKey })).not.toThrow();
  });

  it('should reject a tampered payload', () => {
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    bundle.payload = '{"tampered": true}';

    expect(() => verifyBundle(bundle, { [keyId]: publicKey }))
      .toThrow(SignatureVerificationError);
  });

  it('should reject a tampered signature', () => {
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    const sigBuf = Buffer.from(bundle.signature, 'base64');
    sigBuf[0] = sigBuf[0] ^ 0xff;
    bundle.signature = sigBuf.toString('base64');

    expect(() => verifyBundle(bundle, { [keyId]: publicKey }))
      .toThrow(SignatureVerificationError);
  });

  it('should reject with unknown key ID and no matching key', () => {
    const pair1 = generateSigningKeyPair();
    const pair2 = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, pair1.privateKey, pair1.keyId);

    expect(() => verifyBundle(bundle, { [pair2.keyId]: pair2.publicKey }))
      .toThrow(SignatureVerificationError);
  });

  it('should support key rotation - verify with any trusted key', () => {
    const oldKey = generateSigningKeyPair();
    const newKey = generateSigningKeyPair();

    // Sign with old key
    const bundle = createSignedBundle(testRuleSet, oldKey.privateKey, oldKey.keyId);

    // Verify succeeds when old key is in the set, even if under different ID
    const publicKeys = {
      [newKey.keyId]: newKey.publicKey,
      [oldKey.keyId]: oldKey.publicKey,
    };
    expect(() => verifyBundle(bundle, publicKeys)).not.toThrow();
  });

  it('should try all keys when key ID does not match', () => {
    const signingKey = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, signingKey.privateKey, signingKey.keyId);

    // Key is registered under a different ID
    const publicKeys = {
      'rotated-key-id': signingKey.publicKey,
    };
    expect(() => verifyBundle(bundle, publicKeys)).not.toThrow();
  });
});

describe('verifyBundleWithConfig', () => {
  it('should verify with signing config', () => {
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    const config: SigningConfig = {
      enabled: true,
      publicKeys: { [keyId]: publicKey },
      required: true,
    };

    expect(() => verifyBundleWithConfig(bundle, config)).not.toThrow();
  });

  it('should reject pinned version mismatch', () => {
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    const config: SigningConfig = {
      enabled: true,
      publicKeys: { [keyId]: publicKey },
      pinnedVersion: '2.0',
    };

    expect(() => verifyBundleWithConfig(bundle, config)).toThrow(BundlePinError);
  });

  it('should reject pinned hash mismatch', () => {
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    const config: SigningConfig = {
      enabled: true,
      publicKeys: { [keyId]: publicKey },
      pinnedHash: 'deadbeef'.repeat(8),
    };

    expect(() => verifyBundleWithConfig(bundle, config)).toThrow(BundlePinError);
  });

  it('should accept correct pinned hash', () => {
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    const config: SigningConfig = {
      enabled: true,
      publicKeys: { [keyId]: publicKey },
      pinnedHash: bundle.payloadHash,
    };

    expect(() => verifyBundleWithConfig(bundle, config)).not.toThrow();
  });

  it('should detect payload hash tampering', () => {
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    // Tamper the payload hash but keep signature (signature covers payload, not hash)
    bundle.payloadHash = 'deadbeef'.repeat(8);

    const config: SigningConfig = {
      enabled: true,
      publicKeys: { [keyId]: publicKey },
    };

    expect(() => verifyBundleWithConfig(bundle, config))
      .toThrow(SignatureVerificationError);
  });
});

describe('parseBundlePayload', () => {
  it('should parse a valid bundle payload', () => {
    const { privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    const ruleSet = parseBundlePayload(bundle);
    expect(ruleSet.name).toBe('test-rules');
    expect(ruleSet.rules).toHaveLength(1);
    expect(ruleSet.rules[0].id).toBe('rule-1');
  });

  it('should throw on invalid JSON', () => {
    const bundle = {
      payload: 'not json',
      signature: 'sig',
      publicKeyId: 'key',
      version: '1.0',
      payloadHash: 'hash',
      signedAt: new Date().toISOString(),
    };

    expect(() => parseBundlePayload(bundle)).toThrow(BundleFormatError);
  });
});

describe('readSignedBundle / writeSignedBundle', () => {
  it('should round-trip a bundle through file I/O', () => {
    const dir = makeTmpDir();
    const filePath = join(dir, 'test.signed.json');

    const { privateKey, keyId } = generateSigningKeyPair();
    const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

    writeSignedBundle(bundle, filePath);
    const loaded = readSignedBundle(filePath);

    expect(loaded.payload).toBe(bundle.payload);
    expect(loaded.signature).toBe(bundle.signature);
    expect(loaded.publicKeyId).toBe(bundle.publicKeyId);
    expect(loaded.payloadHash).toBe(bundle.payloadHash);

    rmSync(dir, { recursive: true });
  });

  it('should reject malformed bundle file', () => {
    const dir = makeTmpDir();
    const filePath = join(dir, 'bad.signed.json');

    writeFileSync(filePath, '{"payload": "ok"}', 'utf-8');

    expect(() => readSignedBundle(filePath)).toThrow(BundleFormatError);

    rmSync(dir, { recursive: true });
  });

  it('should reject non-JSON file', () => {
    const dir = makeTmpDir();
    const filePath = join(dir, 'bad.signed.json');

    writeFileSync(filePath, 'not json at all', 'utf-8');

    expect(() => readSignedBundle(filePath)).toThrow(BundleFormatError);

    rmSync(dir, { recursive: true });
  });
});
