/**
 * Policy bundle signing, verification, and loading.
 *
 * Creates signed bundles from rule sets and verifies them before loading.
 *
 * @module signing/bundle
 */

import { readFileSync, writeFileSync } from 'node:fs';
import type { RuleSet } from '../rules/types.js';
import type { SignedBundle, SigningConfig } from './types.js';
import {
  SignatureVerificationError,
  BundleFormatError,
  BundlePinError,
} from './types.js';
import { signPayload, verifySignature, sha256Hex, canonicalize } from './signer.js';

const BUNDLE_VERSION = '1.0';

/**
 * Create a signed bundle from a rule set.
 *
 * @param ruleSet - The rule set to sign
 * @param privateKeyBase64 - Base64-encoded Ed25519 private key (PKCS#8 DER)
 * @param publicKeyId - Identifier for the corresponding public key
 * @returns Signed bundle
 */
export function createSignedBundle(
  ruleSet: RuleSet,
  privateKeyBase64: string,
  publicKeyId: string
): SignedBundle {
  const payload = canonicalize(ruleSet);
  const signature = signPayload(payload, privateKeyBase64);
  const payloadHash = sha256Hex(payload);

  return {
    payload,
    signature,
    publicKeyId,
    version: BUNDLE_VERSION,
    payloadHash,
    signedAt: new Date().toISOString(),
  };
}

/**
 * Verify a signed bundle against a set of trusted public keys.
 *
 * Tries each matching public key (by ID) until one succeeds, supporting key rotation.
 *
 * @param bundle - The signed bundle to verify
 * @param publicKeys - Map of key ID to base64-encoded public key
 * @throws SignatureVerificationError if no key can verify the signature
 * @throws BundleFormatError if the bundle is malformed
 */
export function verifyBundle(
  bundle: SignedBundle,
  publicKeys: Record<string, string>
): void {
  validateBundleFormat(bundle);

  const matchingKey = publicKeys[bundle.publicKeyId];
  if (!matchingKey) {
    // Key rotation: try all keys if the ID doesn't match
    for (const pubKey of Object.values(publicKeys)) {
      if (verifySignature(bundle.payload, bundle.signature, pubKey)) {
        return;
      }
    }
    throw new SignatureVerificationError(
      `No trusted public key found for key ID "${bundle.publicKeyId}" and no other key could verify the signature`
    );
  }

  if (!verifySignature(bundle.payload, bundle.signature, matchingKey)) {
    throw new SignatureVerificationError(
      `Signature verification failed for key ID "${bundle.publicKeyId}"`
    );
  }
}

/**
 * Verify a signed bundle and check version/hash pinning.
 *
 * @param bundle - The signed bundle
 * @param config - Signing configuration with public keys and optional pins
 * @throws SignatureVerificationError on bad signature
 * @throws BundlePinError on version/hash mismatch
 * @throws BundleFormatError on malformed bundle
 */
export function verifyBundleWithConfig(
  bundle: SignedBundle,
  config: SigningConfig
): void {
  verifyBundle(bundle, config.publicKeys);

  if (config.pinnedVersion && bundle.version !== config.pinnedVersion) {
    throw new BundlePinError(
      `Bundle version "${bundle.version}" does not match pinned version "${config.pinnedVersion}"`
    );
  }

  const actualHash = sha256Hex(bundle.payload);
  if (actualHash !== bundle.payloadHash) {
    throw new SignatureVerificationError(
      `Bundle payload hash mismatch: expected "${bundle.payloadHash}", got "${actualHash}"`
    );
  }

  if (config.pinnedHash && actualHash !== config.pinnedHash) {
    throw new BundlePinError(
      `Bundle payload hash "${actualHash}" does not match pinned hash "${config.pinnedHash}"`
    );
  }
}

/**
 * Parse the payload of a verified signed bundle back into a RuleSet.
 *
 * @param bundle - A verified signed bundle
 * @returns Parsed RuleSet
 */
export function parseBundlePayload(bundle: SignedBundle): RuleSet {
  try {
    return JSON.parse(bundle.payload) as RuleSet;
  } catch {
    throw new BundleFormatError('Failed to parse signed bundle payload as JSON');
  }
}

/**
 * Read a signed bundle from a file.
 *
 * @param filePath - Path to the .signed.json file
 * @returns Parsed SignedBundle
 * @throws BundleFormatError if the file cannot be parsed
 */
export function readSignedBundle(filePath: string): SignedBundle {
  const content = readFileSync(filePath, 'utf-8');
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      throw new BundleFormatError(`Invalid signed bundle at ${filePath}: not an object`);
    }
    const bundle = parsed as SignedBundle;
    validateBundleFormat(bundle);
    return bundle;
  } catch (err) {
    if (err instanceof BundleFormatError) throw err;
    throw new BundleFormatError(`Failed to parse signed bundle at ${filePath}: ${(err as Error).message}`);
  }
}

/**
 * Write a signed bundle to a file.
 *
 * @param bundle - The signed bundle
 * @param filePath - Output path (typically .signed.json)
 */
export function writeSignedBundle(bundle: SignedBundle, filePath: string): void {
  writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8');
}

function validateBundleFormat(bundle: SignedBundle): void {
  if (!bundle.payload || typeof bundle.payload !== 'string') {
    throw new BundleFormatError('Signed bundle missing or invalid "payload" field');
  }
  if (!bundle.signature || typeof bundle.signature !== 'string') {
    throw new BundleFormatError('Signed bundle missing or invalid "signature" field');
  }
  if (!bundle.publicKeyId || typeof bundle.publicKeyId !== 'string') {
    throw new BundleFormatError('Signed bundle missing or invalid "publicKeyId" field');
  }
  if (!bundle.version || typeof bundle.version !== 'string') {
    throw new BundleFormatError('Signed bundle missing or invalid "version" field');
  }
  if (!bundle.payloadHash || typeof bundle.payloadHash !== 'string') {
    throw new BundleFormatError('Signed bundle missing or invalid "payloadHash" field');
  }
}
