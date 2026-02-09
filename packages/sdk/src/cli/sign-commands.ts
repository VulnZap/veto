/**
 * CLI commands for signing, verifying, and key generation.
 *
 * @module cli/sign-commands
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { parse } from 'yaml';
import { generateSigningKeyPair, sha256Hex } from '../signing/signer.js';
import {
  createSignedBundle,
  readSignedBundle,
  verifyBundle,
  writeSignedBundle,
} from '../signing/bundle.js';
import type { RuleSet } from '../rules/types.js';

/**
 * Generate a new Ed25519 key pair and write to disk.
 *
 * @param outputDir - Directory to write keys (defaults to current directory)
 */
export function keygenCommand(outputDir?: string): void {
  const dir = resolve(outputDir ?? '.');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const { publicKey, privateKey, keyId } = generateSigningKeyPair();

  const privPath = join(dir, 'veto.key');
  const pubPath = join(dir, 'veto.pub');
  const idPath = join(dir, 'veto.keyid');

  writeFileSync(privPath, privateKey, 'utf-8');
  writeFileSync(pubPath, publicKey, 'utf-8');
  writeFileSync(idPath, keyId, 'utf-8');

  console.log(`Generated Ed25519 key pair:`);
  console.log(`  Private key: ${privPath}`);
  console.log(`  Public key:  ${pubPath}`);
  console.log(`  Key ID:      ${keyId}`);
  console.log('');
  console.log('Add the public key to veto.config.yaml:');
  console.log('  signing:');
  console.log('    enabled: true');
  console.log('    publicKeys:');
  console.log(`      ${keyId}: "${publicKey}"`);
}

interface SignOptions {
  keyPath: string;
  inputDir?: string;
  outputFile?: string;
}

/**
 * Sign rules from a directory into a signed bundle.
 *
 * @param options - Sign command options
 */
export function signCommand(options: SignOptions): void {
  const keyPath = resolve(options.keyPath);
  if (!existsSync(keyPath)) {
    throw new Error(`Private key not found: ${keyPath}`);
  }

  const privateKey = readFileSync(keyPath, 'utf-8').trim();

  // Read the key ID from the sibling .keyid file, or derive it
  const keyIdPath = keyPath.replace(/\.key$/, '.keyid');
  let keyId: string;
  if (existsSync(keyIdPath)) {
    keyId = readFileSync(keyIdPath, 'utf-8').trim();
  } else {
    // Derive from the public key if available
    const pubPath = keyPath.replace(/\.key$/, '.pub');
    if (existsSync(pubPath)) {
      const pubKey = readFileSync(pubPath, 'utf-8').trim();
      keyId = sha256Hex(pubKey).slice(0, 16);
    } else {
      keyId = 'default';
    }
  }

  const inputDir = resolve(options.inputDir ?? join('.', 'veto', 'rules'));
  if (!existsSync(inputDir)) {
    throw new Error(`Rules directory not found: ${inputDir}`);
  }

  const ruleSet = loadRulesFromDir(inputDir);
  const bundle = createSignedBundle(ruleSet, privateKey, keyId);

  const outputFile = resolve(options.outputFile ?? 'rules.signed.json');
  writeSignedBundle(bundle, outputFile);

  console.log(`Signed bundle created:`);
  console.log(`  Output:       ${outputFile}`);
  console.log(`  Key ID:       ${keyId}`);
  console.log(`  Rules:        ${ruleSet.rules.length}`);
  console.log(`  Payload hash: ${bundle.payloadHash}`);
  console.log(`  Signed at:    ${bundle.signedAt}`);
}

interface VerifyOptions {
  keyPath: string;
  bundlePath: string;
}

/**
 * Verify a signed bundle.
 *
 * @param options - Verify command options
 * @returns true if verification succeeds
 */
export function verifyCommand(options: VerifyOptions): boolean {
  const keyPath = resolve(options.keyPath);
  const bundlePath = resolve(options.bundlePath);

  if (!existsSync(keyPath)) {
    console.error(`Public key not found: ${keyPath}`);
    return false;
  }
  if (!existsSync(bundlePath)) {
    console.error(`Bundle not found: ${bundlePath}`);
    return false;
  }

  const publicKey = readFileSync(keyPath, 'utf-8').trim();

  // Read key ID
  const keyIdPath = keyPath.replace(/\.pub$/, '.keyid');
  let keyId: string;
  if (existsSync(keyIdPath)) {
    keyId = readFileSync(keyIdPath, 'utf-8').trim();
  } else {
    keyId = 'default';
  }

  const bundle = readSignedBundle(bundlePath);

  try {
    verifyBundle(bundle, { [keyId]: publicKey });
    const payload = JSON.parse(bundle.payload) as RuleSet;
    console.log(`Verification successful.`);
    console.log(`  Bundle version: ${bundle.version}`);
    console.log(`  Key ID:         ${bundle.publicKeyId}`);
    console.log(`  Rules:          ${payload.rules?.length ?? 0}`);
    console.log(`  Payload hash:   ${bundle.payloadHash}`);
    console.log(`  Signed at:      ${bundle.signedAt}`);
    return true;
  } catch (err) {
    console.error(`Verification failed: ${(err as Error).message}`);
    return false;
  }
}

function loadRulesFromDir(dirPath: string): RuleSet {
  const yamlFiles = findYamlFiles(dirPath);
  const allRules: RuleSet['rules'] = [];

  for (const filePath of yamlFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parse(content) as Record<string, unknown>;
    if (!parsed) continue;

    if (Array.isArray(parsed)) {
      for (const rule of parsed) {
        allRules.push(rule as RuleSet['rules'][number]);
      }
    } else if (parsed.rules && Array.isArray(parsed.rules)) {
      for (const rule of parsed.rules as unknown[]) {
        allRules.push(rule as RuleSet['rules'][number]);
      }
    } else if (parsed.id && parsed.name) {
      allRules.push(parsed as unknown as RuleSet['rules'][number]);
    }
  }

  return {
    version: '1.0',
    name: 'signed-bundle',
    rules: allRules,
  };
}

function findYamlFiles(dirPath: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dirPath);

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findYamlFiles(fullPath));
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();
      if (ext === '.yaml' || ext === '.yml') {
        files.push(fullPath);
      }
    }
  }

  return files;
}
