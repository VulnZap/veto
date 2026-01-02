// src/watchdog/snapshot.ts
// File snapshot system for watchdog mode

import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname, relative } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { glob } from 'glob';
import type { Policy } from '../types.js';
import { isProtected, normalizePath } from '../matcher.js';

const SNAPSHOT_DIR = join(homedir(), '.config', 'veto-leash', 'snapshots');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max per file
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB max total

export interface Snapshot {
  sessionId: string;
  rootDir: string;
  files: Map<string, SnapshotEntry>;
  createdAt: Date;
}

export interface SnapshotEntry {
  path: string;
  hash: string;
  size: number;
  snapshotPath: string;
}

/**
 * Create a snapshot of all files matching the policy
 */
export async function createSnapshot(
  rootDir: string,
  policy: Policy,
  sessionId: string
): Promise<Snapshot> {
  const sessionDir = join(SNAPSHOT_DIR, sessionId);
  mkdirSync(sessionDir, { recursive: true });

  const snapshot: Snapshot = {
    sessionId,
    rootDir: normalizePath(rootDir),
    files: new Map(),
    createdAt: new Date(),
  };

  // Find all files matching include patterns
  const matchedFiles = await findMatchingFiles(rootDir, policy);
  
  let totalSize = 0;
  
  for (const filePath of matchedFiles) {
    const fullPath = join(rootDir, filePath);
    
    if (!existsSync(fullPath)) continue;
    
    const stat = statSync(fullPath);
    if (!stat.isFile()) continue;
    if (stat.size > MAX_FILE_SIZE) continue;
    if (totalSize + stat.size > MAX_TOTAL_SIZE) break;
    
    const content = readFileSync(fullPath);
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    
    // Store with hash prefix for deduplication
    const snapshotPath = join(sessionDir, hash);
    if (!existsSync(snapshotPath)) {
      writeFileSync(snapshotPath, content);
    }
    
    snapshot.files.set(filePath, {
      path: filePath,
      hash,
      size: stat.size,
      snapshotPath,
    });
    
    totalSize += stat.size;
  }

  // Write manifest
  const manifest = {
    sessionId,
    rootDir: snapshot.rootDir,
    createdAt: snapshot.createdAt.toISOString(),
    files: Array.from(snapshot.files.entries()).map(([path, entry]) => ({
      path,
      hash: entry.hash,
      size: entry.size,
    })),
  };
  
  writeFileSync(join(sessionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  
  return snapshot;
}

/**
 * Find all files matching the policy's include patterns
 */
async function findMatchingFiles(rootDir: string, policy: Policy): Promise<string[]> {
  const allFiles: string[] = [];
  
  for (const pattern of policy.include) {
    const matches = await glob(pattern, {
      cwd: rootDir,
      dot: true,
      nodir: true,
      ignore: ['node_modules/**', '.git/**'],
    });
    allFiles.push(...matches);
  }
  
  // Dedupe and filter by policy
  const unique = [...new Set(allFiles)];
  return unique.filter(f => isProtected(f, policy));
}

/**
 * Get the snapshot content for a file
 */
export function getSnapshotContent(snapshot: Snapshot, filePath: string): Buffer | null {
  const entry = snapshot.files.get(normalizePath(filePath));
  if (!entry) return null;
  
  if (!existsSync(entry.snapshotPath)) return null;
  
  return readFileSync(entry.snapshotPath);
}

/**
 * Check if a file has been modified since snapshot
 */
export function hasChanged(snapshot: Snapshot, filePath: string, rootDir: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const entry = snapshot.files.get(normalizedPath);
  
  if (!entry) return false; // Not in snapshot, can't detect change
  
  const fullPath = join(rootDir, normalizedPath);
  
  if (!existsSync(fullPath)) return true; // Deleted
  
  const content = readFileSync(fullPath);
  const currentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  
  return currentHash !== entry.hash;
}

/**
 * Load an existing snapshot from disk
 */
export function loadSnapshot(sessionId: string): Snapshot | null {
  const sessionDir = join(SNAPSHOT_DIR, sessionId);
  const manifestPath = join(sessionDir, 'manifest.json');
  
  if (!existsSync(manifestPath)) return null;
  
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const snapshot: Snapshot = {
      sessionId: manifest.sessionId,
      rootDir: manifest.rootDir,
      files: new Map(),
      createdAt: new Date(manifest.createdAt),
    };
    
    for (const file of manifest.files) {
      snapshot.files.set(file.path, {
        path: file.path,
        hash: file.hash,
        size: file.size,
        snapshotPath: join(sessionDir, file.hash),
      });
    }
    
    return snapshot;
  } catch {
    return null;
  }
}

/**
 * Clean up a snapshot session
 */
export function cleanupSnapshot(sessionId: string): void {
  const sessionDir = join(SNAPSHOT_DIR, sessionId);
  
  if (!existsSync(sessionDir)) return;
  
  try {
    const files = readdirSync(sessionDir);
    for (const file of files) {
      unlinkSync(join(sessionDir, file));
    }
    // Remove directory
    require('fs').rmdirSync(sessionDir);
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
