/**
 * Ed25519 signing and verification using Node.js built-in crypto.
 *
 * @module signing/signer
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';

/**
 * Generate a new Ed25519 key pair for signing policy bundles.
 *
 * @returns Object with base64-encoded public and private keys, plus a key ID
 */
export function generateSigningKeyPair(): {
  publicKey: string;
  privateKey: string;
  keyId: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  const keyId = createHash('sha256').update(pubDer).digest('hex').slice(0, 16);

  return {
    publicKey: pubDer.toString('base64'),
    privateKey: privDer.toString('base64'),
    keyId,
  };
}

/**
 * Sign a payload with an Ed25519 private key.
 *
 * @param payload - The data to sign
 * @param privateKeyBase64 - Base64-encoded DER (PKCS#8) private key
 * @returns Base64-encoded signature
 */
export function signPayload(payload: string, privateKeyBase64: string): string {
  const keyObj = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const sig = sign(null, Buffer.from(payload, 'utf-8'), keyObj);
  return sig.toString('base64');
}

/**
 * Verify an Ed25519 signature.
 *
 * @param payload - The original data
 * @param signatureBase64 - Base64-encoded signature
 * @param publicKeyBase64 - Base64-encoded DER (SPKI) public key
 * @returns true if the signature is valid
 */
export function verifySignature(
  payload: string,
  signatureBase64: string,
  publicKeyBase64: string
): boolean {
  const keyObj = createPublicKey({
    key: Buffer.from(publicKeyBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  return verify(
    null,
    Buffer.from(payload, 'utf-8'),
    keyObj,
    Buffer.from(signatureBase64, 'base64')
  );
}

/**
 * Compute SHA-256 hex hash of a string.
 */
export function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

/**
 * Canonicalize a JSON-serializable object to a deterministic string.
 * Keys are sorted recursively; no trailing whitespace.
 */
export function canonicalize(obj: unknown): string {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
