/**
 * Simple glob utility for matching files.
 *
 * @module utils/glob
 */

import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Simple glob pattern matching.
 * Supports:
 * - ** for recursive directory matching
 * - * for wildcard matching in filenames
 *
 * @param pattern - Glob pattern (e.g., "data/**\/*.jsonl")
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Array of matching file paths
 */
export async function glob(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
  const absolutePattern = resolve(cwd, pattern);
  const parts = absolutePattern.split(/[\\/]/);
  
  // Find the first part with wildcards
  let baseIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('*')) {
      baseIndex = i;
      break;
    }
    baseIndex = i + 1;
  }

  const basePath = parts.slice(0, baseIndex).join('/') || '/';
  const patternParts = parts.slice(baseIndex);

  if (patternParts.length === 0) {
    // No wildcards, return the path if it exists
    try {
      statSync(absolutePattern);
      return [absolutePattern];
    } catch {
      return [];
    }
  }

  return matchPattern(basePath, patternParts);
}

/**
 * Recursively match pattern parts against directory structure.
 */
function matchPattern(currentPath: string, patternParts: string[]): string[] {
  if (patternParts.length === 0) {
    return [currentPath];
  }

  const [currentPattern, ...remainingParts] = patternParts;
  const results: string[] = [];

  try {
    const stat = statSync(currentPath);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const entries = readdirSync(currentPath);

  if (currentPattern === '**') {
    // Match current directory and all subdirectories
    // First, try matching remaining pattern in current directory
    results.push(...matchPattern(currentPath, remainingParts));

    // Then recurse into subdirectories
    for (const entry of entries) {
      const entryPath = join(currentPath, entry);
      try {
        const stat = statSync(entryPath);
        if (stat.isDirectory()) {
          // Continue with ** pattern in subdirectory
          results.push(...matchPattern(entryPath, patternParts));
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  } else {
    // Match current pattern
    const regex = patternToRegex(currentPattern);

    for (const entry of entries) {
      if (regex.test(entry)) {
        const entryPath = join(currentPath, entry);

        if (remainingParts.length === 0) {
          // This is the last pattern part
          results.push(entryPath);
        } else {
          // Continue matching remaining parts
          try {
            const stat = statSync(entryPath);
            if (stat.isDirectory()) {
              results.push(...matchPattern(entryPath, remainingParts));
            }
          } catch {
            // Skip inaccessible entries
          }
        }
      }
    }
  }

  return results;
}

/**
 * Convert glob pattern to regex.
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  return new RegExp(`^${escaped}$`);
}

/**
 * Synchronous version of glob.
 */
export function globSync(pattern: string, cwd: string = process.cwd()): string[] {
  // The async version is actually sync, just return directly
  const absolutePattern = resolve(cwd, pattern);
  const parts = absolutePattern.split(/[\\/]/);
  
  let baseIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('*')) {
      baseIndex = i;
      break;
    }
    baseIndex = i + 1;
  }

  const basePath = parts.slice(0, baseIndex).join('/') || '/';
  const patternParts = parts.slice(baseIndex);

  if (patternParts.length === 0) {
    try {
      statSync(absolutePattern);
      return [absolutePattern];
    } catch {
      return [];
    }
  }

  return matchPattern(basePath, patternParts);
}
