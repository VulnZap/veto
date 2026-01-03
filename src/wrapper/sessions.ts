// src/wrapper/sessions.ts

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Policy } from '../types.js';

export interface SessionRecord {
  pid: number;
  port: number;
  agent: string;
  mode: 'wrapper' | 'watchdog';
  restriction: string;
  cwd: string;
  startTime: string;
  policyAction: string;
  policyPatterns: string[];
}

interface SessionRegistry {
  sessions: SessionRecord[];
}

/**
 * Get the path to the session registry file.
 * Uses ~/.cache/veto-leash/sessions.json (XDG compliant)
 */
function getRegistryPath(): string {
  const cacheDir = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  const vetoDir = path.join(cacheDir, 'veto-leash');
  
  if (!fs.existsSync(vetoDir)) {
    fs.mkdirSync(vetoDir, { recursive: true });
  }
  
  return path.join(vetoDir, 'sessions.json');
}

/**
 * Load the session registry from disk.
 */
function loadRegistry(): SessionRegistry {
  const registryPath = getRegistryPath();
  
  try {
    if (fs.existsSync(registryPath)) {
      const data = fs.readFileSync(registryPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Corrupted file, return empty
  }
  
  return { sessions: [] };
}

/**
 * Save the session registry to disk.
 */
function saveRegistry(registry: SessionRegistry): void {
  const registryPath = getRegistryPath();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

/**
 * Check if a process is still running.
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Register a new session.
 */
export function registerSession(
  port: number,
  agent: string,
  mode: 'wrapper' | 'watchdog',
  restriction: string,
  policy: Policy
): void {
  const registry = loadRegistry();
  
  // Clean up dead sessions first
  registry.sessions = registry.sessions.filter((s) => isProcessRunning(s.pid));
  
  // Add new session
  registry.sessions.push({
    pid: process.pid,
    port,
    agent,
    mode,
    restriction,
    cwd: process.cwd(),
    startTime: new Date().toISOString(),
    policyAction: policy.action,
    policyPatterns: policy.include.slice(0, 5),
  });
  
  saveRegistry(registry);
}

/**
 * Unregister the current session.
 */
export function unregisterSession(): void {
  const registry = loadRegistry();
  
  registry.sessions = registry.sessions.filter((s) => s.pid !== process.pid);
  
  saveRegistry(registry);
}

/**
 * Get all active sessions (filters out dead processes).
 */
export function getActiveSessions(): SessionRecord[] {
  const registry = loadRegistry();
  
  // Filter to only running processes
  const activeSessions = registry.sessions.filter((s) => isProcessRunning(s.pid));
  
  // Clean up dead sessions if any were found
  if (activeSessions.length !== registry.sessions.length) {
    registry.sessions = activeSessions;
    saveRegistry(registry);
  }
  
  return activeSessions;
}

/**
 * Clear all sessions (useful for cleanup).
 */
export function clearAllSessions(): void {
  saveRegistry({ sessions: [] });
}
