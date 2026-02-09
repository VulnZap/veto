/**
 * Type definitions for policy bundle signing and verification.
 *
 * @module signing/types
 */

/**
 * A signed policy bundle containing the payload, signature, and metadata.
 */
export interface SignedBundle {
  /** Canonical JSON payload (the policy content) */
  payload: string;
  /** Base64-encoded Ed25519 signature of the payload */
  signature: string;
  /** Identifier for the public key used to verify this signature */
  publicKeyId: string;
  /** Version of the bundle format */
  version: string;
  /** SHA-256 hash of the payload for pinning */
  payloadHash: string;
  /** ISO timestamp when the bundle was signed */
  signedAt: string;
}

/**
 * Signing configuration in veto.config.yaml.
 */
export interface SigningConfig {
  /** Whether signing verification is enabled */
  enabled: boolean;
  /**
   * Public keys for verification (supports key rotation).
   * Each entry maps a key ID to a base64-encoded Ed25519 public key.
   */
  publicKeys: Record<string, string>;
  /** Whether to require valid signatures (fail closed). Defaults to true when enabled. */
  required?: boolean;
  /** Pin to a specific bundle version */
  pinnedVersion?: string;
  /** Pin to a specific payload hash (SHA-256, hex) */
  pinnedHash?: string;
}

/**
 * Default value for signing.required when not explicitly specified.
 * When signing is enabled, this controls whether verification failures are fatal.
 * Security-first: defaults to true (fail closed).
 */
export const SIGNING_REQUIRED_DEFAULT = true;

/**
 * Check if signing is required based on config.
 * Single source of truth for signing.required semantics.
 *
 * @param config - Signing configuration (may be undefined)
 * @returns true if signing is required, false otherwise
 */
export function isSigningRequired(config: SigningConfig | undefined): boolean {
  if (!config || !config.enabled) {
    return false;
  }
  return config.required ?? SIGNING_REQUIRED_DEFAULT;
}

/**
 * Error thrown when signature verification fails.
 */
export class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

/**
 * Error thrown when a signed bundle has an invalid format.
 */
export class BundleFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleFormatError';
  }
}

/**
 * Error thrown when a pinned version or hash does not match.
 */
export class BundlePinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundlePinError';
  }
}
