// src/audit/index.ts
// Audit logging for veto-leash actions

import { existsSync, appendFileSync, readFileSync, mkdirSync, createReadStream } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { COLORS, SYMBOLS } from '../ui/colors.js';

const AUDIT_DIR = join(homedir(), '.config', 'veto-leash');
const AUDIT_FILE = join(AUDIT_DIR, 'audit.jsonl');

export interface AuditEntry {
  timestamp: string;
  action: 'blocked' | 'allowed' | 'restored';
  event: string;
  target: string;
  policy?: string;
  agent?: string;
  session_id?: string;
}

/**
 * Log an audit entry
 */
export function logAudit(entry: Omit<AuditEntry, 'timestamp'>): void {
  const fullEntry: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    appendFileSync(AUDIT_FILE, JSON.stringify(fullEntry) + '\n');
  } catch {
    // Silently fail - audit logging should never block operations
  }
}

/**
 * Log a blocked action
 */
export function logBlocked(
  target: string,
  action: string,
  policy: string,
  agent?: string
): void {
  logAudit({
    action: 'blocked',
    event: action,
    target,
    policy,
    agent,
  });
}

/**
 * Log an allowed action
 */
export function logAllowed(
  target: string,
  action: string,
  reason?: string
): void {
  logAudit({
    action: 'allowed',
    event: action,
    target,
    policy: reason,
  });
}

/**
 * Log a restored file (watchdog mode)
 */
export function logRestored(
  target: string,
  event: string,
  policy: string
): void {
  logAudit({
    action: 'restored',
    event,
    target,
    policy,
  });
}

/**
 * Read recent audit entries
 */
export async function readAuditLog(limit: number = 50): Promise<AuditEntry[]> {
  if (!existsSync(AUDIT_FILE)) {
    return [];
  }

  const entries: AuditEntry[] = [];

  return new Promise((resolve) => {
    const rl = createInterface({
      input: createReadStream(AUDIT_FILE),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      try {
        const entry = JSON.parse(line) as AuditEntry;
        entries.push(entry);
        // Keep only the last N entries
        if (entries.length > limit) {
          entries.shift();
        }
      } catch {
        // Skip malformed lines
      }
    });

    rl.on('close', () => {
      resolve(entries);
    });

    rl.on('error', () => {
      resolve([]);
    });
  });
}

/**
 * Print audit log to console
 */
export async function printAuditLog(limit: number = 50, tail: boolean = false): Promise<void> {
  const entries = await readAuditLog(limit);

  if (entries.length === 0) {
    console.log(`\n${COLORS.dim}No audit entries found.${COLORS.reset}\n`);
    return;
  }

  console.log(`\n${COLORS.bold}Audit Log${COLORS.reset} (${entries.length} entries)`);
  console.log('\u2550'.repeat(60) + '\n');

  const displayEntries = tail ? entries.slice(-limit) : entries;

  for (const entry of displayEntries) {
    const time = new Date(entry.timestamp).toLocaleString();
    const actionColor = entry.action === 'blocked' ? COLORS.error : 
                        entry.action === 'restored' ? COLORS.warning : 
                        COLORS.success;
    const actionSymbol = entry.action === 'blocked' ? SYMBOLS.blocked :
                         entry.action === 'restored' ? SYMBOLS.warning :
                         SYMBOLS.success;

    console.log(`${COLORS.dim}${time}${COLORS.reset}`);
    console.log(`  ${actionColor}${actionSymbol} ${entry.action.toUpperCase()}${COLORS.reset} ${entry.event}`);
    console.log(`  ${COLORS.dim}Target:${COLORS.reset} ${entry.target}`);
    if (entry.policy) {
      console.log(`  ${COLORS.dim}Policy:${COLORS.reset} ${entry.policy}`);
    }
    console.log('');
  }
}

/**
 * Clear the audit log
 */
export function clearAuditLog(): void {
  if (existsSync(AUDIT_FILE)) {
    require('fs').writeFileSync(AUDIT_FILE, '');
    console.log(`${COLORS.success}${SYMBOLS.success} Audit log cleared${COLORS.reset}`);
  }
}
