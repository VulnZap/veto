// src/watchdog/watcher.ts
// Filesystem watcher using chokidar

import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { Policy } from '../types.js';
import type { Snapshot } from './snapshot.js';
import { isProtected, normalizePath } from '../matcher.js';
import { restoreFile } from './restore.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';
import { logRestored } from '../audit/index.js';

export interface WatcherStats {
  restored: number;
  blocked: number;
  events: Array<{ time: Date; event: string; path: string; action: 'restored' | 'blocked' }>;
}

export interface WatcherOptions {
  rootDir: string;
  policy: Policy;
  snapshot: Snapshot;
  onRestore?: (path: string) => void;
  onBlock?: (path: string, event: string) => void;
}

/**
 * Create a filesystem watcher that auto-restores protected files
 */
export function createWatcher(options: WatcherOptions): { watcher: FSWatcher; stats: WatcherStats } {
  const { rootDir, policy, snapshot, onRestore, onBlock } = options;
  
  const stats: WatcherStats = {
    restored: 0,
    blocked: 0,
    events: [],
  };

  // Build glob patterns for chokidar
  const watchPatterns = policy.include.map(p => {
    // Ensure patterns work with chokidar
    if (p.startsWith('**/')) return p;
    if (p.startsWith('/')) return p.slice(1);
    return p;
  });

  const watcher = chokidar.watch(watchPatterns, {
    cwd: rootDir,
    ignored: [
      'node_modules/**',
      '.git/**',
      ...policy.exclude,
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  // Handle file deletion - restore immediately
  watcher.on('unlink', (path) => {
    const normalizedPath = normalizePath(path);
    
    if (!isProtected(normalizedPath, policy)) return;
    
    const restored = restoreFile(snapshot, normalizedPath, rootDir);
    
    if (restored) {
      stats.restored++;
      stats.events.push({
        time: new Date(),
        event: 'unlink',
        path: normalizedPath,
        action: 'restored',
      });
      
      printRestored('delete', normalizedPath, policy.description);
      logRestored(normalizedPath, 'delete', policy.description);
      onRestore?.(normalizedPath);
    }
  });

  // Handle file modification - restore if content changed
  watcher.on('change', (path) => {
    const normalizedPath = normalizePath(path);
    
    // Only act on modify policies
    if (policy.action !== 'modify') return;
    if (!isProtected(normalizedPath, policy)) return;
    
    const restored = restoreFile(snapshot, normalizedPath, rootDir);
    
    if (restored) {
      stats.restored++;
      stats.events.push({
        time: new Date(),
        event: 'change',
        path: normalizedPath,
        action: 'restored',
      });
      
      printRestored('modify', normalizedPath, policy.description);
      logRestored(normalizedPath, 'modify', policy.description);
      onRestore?.(normalizedPath);
    }
  });

  // Handle directory deletion
  watcher.on('unlinkDir', (path) => {
    const normalizedPath = normalizePath(path);
    
    // Find all files in snapshot that were under this directory
    for (const [filePath] of snapshot.files) {
      if (filePath.startsWith(normalizedPath + '/')) {
        const restored = restoreFile(snapshot, filePath, rootDir);
        
        if (restored) {
          stats.restored++;
          stats.events.push({
            time: new Date(),
            event: 'unlinkDir',
            path: filePath,
            action: 'restored',
          });
          
          printRestored('delete', filePath, policy.description);
          logRestored(filePath, 'delete', policy.description);
          onRestore?.(filePath);
        }
      }
    }
  });

  watcher.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${COLORS.error}${SYMBOLS.error} Watcher error: ${message}${COLORS.reset}`);
  });

  return { watcher, stats };
}

function printRestored(action: string, path: string, policyDesc: string): void {
  console.log(`\n${COLORS.warning}${SYMBOLS.blocked} RESTORED${COLORS.reset}`);
  console.log(`   ${COLORS.dim}Action:${COLORS.reset} ${action}`);
  console.log(`   ${COLORS.dim}Target:${COLORS.reset} ${path}`);
  console.log(`   ${COLORS.dim}Policy:${COLORS.reset} ${policyDesc}`);
  console.log(`\n   File automatically restored from snapshot.\n`);
}
