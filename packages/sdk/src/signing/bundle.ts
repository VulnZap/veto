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
 * Options for bundle verification.
 */
export interface VerifyBundleOptions {
  /**
   * If true, when bundle.publicKeyId is not found in publicKeys, try all keys.
   * This supports key rotation scenarios where the key ID may have changed.
   * Default: false (strict mode - require explicit key ID match)
   */
  allowKeyRotation?: boolean;
}

/**
 * Verify a signed bundle against a set of trusted public keys.
 *
 * Security semantics:
 * - If bundle.publicKeyId exists in publicKeys, ONLY that key is tried
 * - If bundle.publicKeyId is NOT in publicKeys:
 *   - With allowKeyRotation=false (default): fail immediately
 *   - With allowKeyRotation=true: try all keys (for rotation scenarios)
 *
 * @param bundle - The signed bundle to verify
 * @param publicKeys - Map of key ID to base64-encoded public key
 * @param options - Verification options
 * @throws SignatureVerificationError if no key can verify the signature
 * @throws BundleFormatError if the bundle is malformed
 */
export function verifyBundle(
  bundle: SignedBundle,
  publicKeys: Record<string, string>,
  options: VerifyBundleOptions = {}
): void {
  validateBundleFormat(bundle);

  const { allowKeyRotation = false } = options;
  const matchingKey = publicKeys[bundle.publicKeyId];

  if (matchingKey) {
    // Key ID found - use only this key (strict trust)
    if (!verifySignature(bundle.payload, bundle.signature, matchingKey)) {
      throw new SignatureVerificationError(
        `Signature verification failed for key ID "${bundle.publicKeyId}"`
      );
    }
    return;
  }

  // Key ID not found in trusted keys
  if (!allowKeyRotation) {
    throw new SignatureVerificationError(
      `Bundle key ID "${bundle.publicKeyId}" is not in trusted public keys`
    );
  }

  // Key rotation mode: try all keys
  for (const pubKey of Object.values(publicKeys)) {
    if (verifySignature(bundle.payload, bundle.signature, pubKey)) {
      return; // Verification succeeded with rotated key
    }
  }

  throw new SignatureVerificationError(
    `No trusted public key could verify the signature (bundle key ID: "${bundle.publicKeyId}")`
  );
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
  // Use allowKeyRotation=true to support key rotation scenarios in production
  verifyBundle(bundle, config.publicKeys, { allowKeyRotation: true });

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
