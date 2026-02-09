/**
 * Signed policy bundle module.
 *
 * @module signing
 */

export type { SignedBundle, SigningConfig } from './types.js';
export {
  SignatureVerificationError,
  BundleFormatError,
  BundlePinError,
  SIGNING_REQUIRED_DEFAULT,
  isSigningRequired,
} from './types.js';
export {
  generateSigningKeyPair,
  deriveKeyId,
  signPayload,
  verifySignature,
  sha256Hex,
  canonicalize,
} from './signer.js';
export type { VerifyBundleOptions } from './bundle.js';
export {
  createSignedBundle,
  verifyBundle,
  verifyBundleWithConfig,
  parseBundlePayload,
  readSignedBundle,
  writeSignedBundle,
} from './bundle.js';
