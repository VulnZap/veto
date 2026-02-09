import { describe, it, expect } from 'vitest';
import {
  generateSigningKeyPair,
  signPayload,
  verifySignature,
  sha256Hex,
  canonicalize,
} from '../../src/signing/signer.js';

describe('generateSigningKeyPair', () => {
  it('should generate a valid key pair', () => {
    const { publicKey, privateKey, keyId } = generateSigningKeyPair();

    expect(publicKey).toBeTruthy();
    expect(privateKey).toBeTruthy();
    expect(keyId).toHaveLength(16);
    // Base64-encoded DER keys
    expect(Buffer.from(publicKey, 'base64').length).toBeGreaterThan(0);
    expect(Buffer.from(privateKey, 'base64').length).toBeGreaterThan(0);
  });

  it('should generate unique key pairs', () => {
    const pair1 = generateSigningKeyPair();
    const pair2 = generateSigningKeyPair();

    expect(pair1.publicKey).not.toBe(pair2.publicKey);
    expect(pair1.privateKey).not.toBe(pair2.privateKey);
    expect(pair1.keyId).not.toBe(pair2.keyId);
  });
});

describe('signPayload / verifySignature', () => {
  it('should sign and verify a payload', () => {
    const { publicKey, privateKey } = generateSigningKeyPair();
    const payload = 'hello world';

    const signature = signPayload(payload, privateKey);
    expect(signature).toBeTruthy();

    const valid = verifySignature(payload, signature, publicKey);
    expect(valid).toBe(true);
  });

  it('should reject a tampered payload', () => {
    const { publicKey, privateKey } = generateSigningKeyPair();
    const payload = 'original data';

    const signature = signPayload(payload, privateKey);
    const valid = verifySignature('tampered data', signature, publicKey);
    expect(valid).toBe(false);
  });

  it('should reject a tampered signature', () => {
    const { publicKey, privateKey } = generateSigningKeyPair();
    const payload = 'some data';

    const signature = signPayload(payload, privateKey);
    // Flip a byte in the signature
    const sigBuf = Buffer.from(signature, 'base64');
    sigBuf[0] = sigBuf[0] ^ 0xff;
    const tamperedSig = sigBuf.toString('base64');

    const valid = verifySignature(payload, tamperedSig, publicKey);
    expect(valid).toBe(false);
  });

  it('should reject with wrong public key', () => {
    const pair1 = generateSigningKeyPair();
    const pair2 = generateSigningKeyPair();
    const payload = 'test data';

    const signature = signPayload(payload, pair1.privateKey);
    const valid = verifySignature(payload, signature, pair2.publicKey);
    expect(valid).toBe(false);
  });
});

describe('sha256Hex', () => {
  it('should produce consistent hashes', () => {
    const hash1 = sha256Hex('hello');
    const hash2 = sha256Hex('hello');
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different input', () => {
    const hash1 = sha256Hex('hello');
    const hash2 = sha256Hex('world');
    expect(hash1).not.toBe(hash2);
  });

  it('should produce 64-character hex string', () => {
    const hash = sha256Hex('test');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe('canonicalize', () => {
  it('should sort object keys', () => {
    const result = canonicalize({ b: 1, a: 2 });
    expect(result).toBe('{"a":2,"b":1}');
  });

  it('should sort nested object keys', () => {
    const result = canonicalize({ z: { b: 1, a: 2 }, a: 1 });
    expect(result).toBe('{"a":1,"z":{"a":2,"b":1}}');
  });

  it('should preserve array order', () => {
    const result = canonicalize({ items: [3, 1, 2] });
    expect(result).toBe('{"items":[3,1,2]}');
  });

  it('should produce consistent output', () => {
    const obj = { name: 'test', rules: [{ id: 'r1', action: 'block' }] };
    const r1 = canonicalize(obj);
    const r2 = canonicalize(obj);
    expect(r1).toBe(r2);
  });

  it('should handle null and undefined', () => {
    expect(canonicalize(null)).toBe('null');
    // undefined in JSON becomes undefined
    expect(canonicalize({ a: undefined })).toBe('{}');
  });
});
