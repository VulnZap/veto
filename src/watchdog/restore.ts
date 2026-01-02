// src/watchdog/restore.ts
// File restoration from snapshots

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { Snapshot } from './snapshot.js';
import { getSnapshotContent } from './snapshot.js';
import { normalizePath } from '../matcher.js';

/**
 * Restore a file from snapshot
 * Returns true if restored, false if no snapshot exists
 */
export function restoreFile(
  snapshot: Snapshot,
  filePath: string,
  rootDir: string
): boolean {
  const normalizedPath = normalizePath(filePath);
  const content = getSnapshotContent(snapshot, normalizedPath);
  
  if (!content) return false;
  
  const fullPath = join(rootDir, normalizedPath);
  const dir = dirname(fullPath);
  
  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  // Write restored content
  writeFileSync(fullPath, content);
  
  return true;
}

/**
 * Restore all files from snapshot
 * Returns count of restored files
 */
export function restoreAll(snapshot: Snapshot, rootDir: string): number {
  let restored = 0;
  
  for (const [filePath] of snapshot.files) {
    const fullPath = join(rootDir, filePath);
    
    // Only restore if file is missing or different
    if (!existsSync(fullPath)) {
      if (restoreFile(snapshot, filePath, rootDir)) {
        restored++;
      }
    }
  }
  
  return restored;
}

/**
 * Check what files would be restored
 */
export function previewRestore(snapshot: Snapshot, rootDir: string): string[] {
  const toRestore: string[] = [];
  
  for (const [filePath] of snapshot.files) {
    const fullPath = join(rootDir, filePath);
    
    if (!existsSync(fullPath)) {
      toRestore.push(filePath);
    }
  }
  
  return toRestore;
}
