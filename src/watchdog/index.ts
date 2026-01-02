// src/watchdog/index.ts
// Watchdog mode orchestrator

import type { FSWatcher } from 'chokidar';
import type { Policy } from '../types.js';
import { createSnapshot, cleanupSnapshot, generateSessionId, type Snapshot } from './snapshot.js';
import { createWatcher, type WatcherStats } from './watcher.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';

export interface WatchdogSession {
  sessionId: string;
  rootDir: string;
  policy: Policy;
  snapshot: Snapshot;
  watcher: FSWatcher;
  stats: WatcherStats;
  startTime: Date;
}

/**
 * Start watchdog mode - monitors and auto-restores protected files
 */
export async function startWatchdog(
  rootDir: string,
  policy: Policy
): Promise<WatchdogSession> {
  const sessionId = generateSessionId();
  const startTime = new Date();

  // Create snapshot of protected files
  const snapshot = await createSnapshot(rootDir, policy, sessionId);

  // Start filesystem watcher
  const { watcher, stats } = createWatcher({
    rootDir,
    policy,
    snapshot,
  });

  return {
    sessionId,
    rootDir,
    policy,
    snapshot,
    watcher,
    stats,
    startTime,
  };
}

/**
 * Stop watchdog mode and print summary
 */
export async function stopWatchdog(session: WatchdogSession): Promise<void> {
  const duration = Date.now() - session.startTime.getTime();
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);

  // Close watcher
  await session.watcher.close();

  // Print summary
  console.log(`\n${COLORS.success}${SYMBOLS.success} veto-leash watchdog ended${COLORS.reset}\n`);
  console.log(`   Duration: ${minutes}m ${seconds}s`);
  console.log(`   Files protected: ${session.snapshot.files.size}`);
  console.log(`   Auto-restored: ${session.stats.restored}`);

  if (session.stats.events.length > 0) {
    console.log(`\n   Recent events:`);
    for (const event of session.stats.events.slice(-5)) {
      console.log(`     ${SYMBOLS.bullet} ${event.action} ${event.path}`);
    }
  }
  console.log('');

  // Cleanup snapshot (optional - keep for debugging)
  // cleanupSnapshot(session.sessionId);
}

export { createSnapshot, cleanupSnapshot, generateSessionId } from './snapshot.js';
export { restoreFile, restoreAll } from './restore.js';
export { createWatcher } from './watcher.js';
