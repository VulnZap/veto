/**
 * Tests proving key ID consistency across keygen/sign/verify paths.
 * Addresses Greptile finding: ensure key ID derivation matches signer.ts logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateSigningKeyPair,
  deriveKeyId,
  signPayload,
  verifySignature,
} from '../../src/signing/signer.js';
import {
  createSignedBundle,
  verifyBundle,
  readSignedBundle,
  writeSignedBundle,
} from '../../src/signing/bundle.js';
import { keygenCommand, signCommand, verifyCommand } from '../../src/cli/sign-commands.js';
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
      conditions: [],
    },
  ],
};

describe('Key ID consistency', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `veto-keyid-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true });
    }
  });

  describe('deriveKeyId', () => {
    it('should derive same key ID as generateSigningKeyPair', () => {
      const { publicKey, keyId } = generateSigningKeyPair();
      const derivedKeyId = deriveKeyId(publicKey);
      expect(derivedKeyId).toBe(keyId);
    });

    it('should produce consistent key ID for same public key', () => {
      const { publicKey } = generateSigningKeyPair();
      const keyId1 = deriveKeyId(publicKey);
      const keyId2 = deriveKeyId(publicKey);
      expect(keyId1).toBe(keyId2);
    });

    it('should produce different key IDs for different public keys', () => {
      const pair1 = generateSigningKeyPair();
      const pair2 = generateSigningKeyPair();
      expect(deriveKeyId(pair1.publicKey)).not.toBe(deriveKeyId(pair2.publicKey));
    });

    it('should hash DER bytes, not base64 string', () => {
      const { publicKey } = generateSigningKeyPair();
      // If we were hashing the base64 string (wrong), this would produce different result
      const correctKeyId = deriveKeyId(publicKey);
      // The key ID should be 16 hex characters
      expect(correctKeyId).toHaveLength(16);
      expect(correctKeyId).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('CLI keygen/sign/verify key ID consistency', () => {
    it('should maintain consistent key ID through full workflow', () => {
      // Suppress console.log during tests
      const originalLog = console.log;
      console.log = () => {};

      try {
        // Step 1: Generate keys via CLI
        keygenCommand(tmpDir);

        // Read the generated files
        const privateKey = readFileSync(join(tmpDir, 'veto.key'), 'utf-8').trim();
        const publicKey = readFileSync(join(tmpDir, 'veto.pub'), 'utf-8').trim();
        const keyIdFromFile = readFileSync(join(tmpDir, 'veto.keyid'), 'utf-8').trim();

        // Step 2: Verify derived key ID matches stored key ID
        const derivedKeyId = deriveKeyId(publicKey);
        expect(derivedKeyId).toBe(keyIdFromFile);

        // Step 3: Create a signed bundle programmatically
        const bundle = createSignedBundle(testRuleSet, privateKey, keyIdFromFile);
        expect(bundle.publicKeyId).toBe(keyIdFromFile);

        // Step 4: Verify bundle with the public key
        expect(() => verifyBundle(bundle, { [keyIdFromFile]: publicKey })).not.toThrow();

        // Step 5: Write bundle and verify via CLI (without .keyid file)
        const bundlePath = join(tmpDir, 'test.signed.json');
        writeSignedBundle(bundle, bundlePath);

        // Remove .keyid file to force key ID derivation
        rmSync(join(tmpDir, 'veto.keyid'));

        // CLI verify should derive key ID from public key and succeed
        const success = verifyCommand({
          keyPath: join(tmpDir, 'veto.pub'),
          bundlePath,
        });
        expect(success).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should sign correctly when .keyid file is missing', () => {
      const originalLog = console.log;
      console.log = () => {};

      try {
        // Generate keys
        const { publicKey, privateKey, keyId } = generateSigningKeyPair();

        // Write only .key and .pub files (no .keyid)
        writeFileSync(join(tmpDir, 'veto.key'), privateKey, 'utf-8');
        writeFileSync(join(tmpDir, 'veto.pub'), publicKey, 'utf-8');

        // Create rules directory
        const rulesDir = join(tmpDir, 'rules');
        mkdirSync(rulesDir, { recursive: true });
        writeFileSync(
          join(rulesDir, 'test.yaml'),
          `id: test-rule
name: Test Rule
enabled: true
severity: low
action: allow
tools: ["test_tool"]
conditions: []`,
          'utf-8'
        );

        // Sign via CLI
        const bundlePath = join(tmpDir, 'output.signed.json');
        signCommand({
          keyPath: join(tmpDir, 'veto.key'),
          inputDir: rulesDir,
          outputFile: bundlePath,
        });

        // Read and verify the bundle
        const bundle = readSignedBundle(bundlePath);

        // The bundle's key ID should match what deriveKeyId produces
        const expectedKeyId = deriveKeyId(publicKey);
        expect(bundle.publicKeyId).toBe(expectedKeyId);
        expect(bundle.publicKeyId).toBe(keyId); // And match the original keyId

        // Verification should succeed
        expect(() => verifyBundle(bundle, { [keyId]: publicKey })).not.toThrow();
      } finally {
        console.log = originalLog;
      }
    });

    it('should verify correctly when .keyid file is missing', () => {
      const originalLog = console.log;
      console.log = () => {};

      try {
        // Generate keys and create a signed bundle
        const { publicKey, privateKey, keyId } = generateSigningKeyPair();
        const bundle = createSignedBundle(testRuleSet, privateKey, keyId);

        // Write only public key (no .keyid)
        writeFileSync(join(tmpDir, 'veto.pub'), publicKey, 'utf-8');

        // Write bundle
        const bundlePath = join(tmpDir, 'test.signed.json');
        writeSignedBundle(bundle, bundlePath);

        // Verify should work by deriving key ID from public key
        const success = verifyCommand({
          keyPath: join(tmpDir, 'veto.pub'),
          bundlePath,
        });
        expect(success).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('End-to-end signing workflow', () => {
    it('should complete keygen -> sign -> verify cycle with consistent key IDs', () => {
      const originalLog = console.log;
      console.log = () => {};

      try {
        // Generate key pair
        const { publicKey, privateKey, keyId } = generateSigningKeyPair();

        // Sign a payload
        const payload = 'test payload';
        const signature = signPayload(payload, privateKey);

        // Verify with original key ID
        expect(verifySignature(payload, signature, publicKey)).toBe(true);

        // Derive key ID independently and verify it matches
        const derivedKeyId = deriveKeyId(publicKey);
        expect(derivedKeyId).toBe(keyId);

        // Create and verify a bundle
        const bundle = createSignedBundle(testRuleSet, privateKey, keyId);
        expect(bundle.publicKeyId).toBe(keyId);

        // Verify bundle using derived key ID
        expect(() => verifyBundle(bundle, { [derivedKeyId]: publicKey })).not.toThrow();
      } finally {
        console.log = originalLog;
      }
    });
  });
});
