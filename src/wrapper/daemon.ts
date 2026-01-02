// src/wrapper/daemon.ts

import * as net from 'net';
import type {
  Policy,
  CheckRequest,
  CheckResponse,
  SessionState,
} from '../types.js';
import { isProtected } from '../matcher.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';
import { logBlocked } from '../audit/index.js';

export class VetoDaemon {
  private server: net.Server | null = null;
  private policy: Policy;
  private state: SessionState;

  constructor(policy: Policy, agent: string) {
    this.policy = policy;
    this.state = {
      pid: process.pid,
      agent,
      policy,
      startTime: new Date(),
      blockedCount: 0,
      allowedCount: 0,
      blockedActions: [],
    };
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = '';

        socket.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const req: CheckRequest = JSON.parse(line);
              const res = this.check(req);
              socket.write(JSON.stringify(res) + '\n');
            } catch {
              socket.write('{"allowed":true}\n');
            }
          }
        });

        socket.on('error', () => {
          // Ignore socket errors
        });
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as net.AddressInfo;
        resolve(addr.port);
      });

      this.server.on('error', reject);
    });
  }

  check(req: CheckRequest): CheckResponse {
    // Action must match policy
    if (req.action !== this.policy.action) {
      this.state.allowedCount++;
      return { allowed: true };
    }

    // Check if target is protected
    if (isProtected(req.target, this.policy)) {
      this.state.blockedCount++;
      this.state.blockedActions.push({
        time: new Date(),
        action: req.action,
        target: req.target,
      });

      // Log to audit
      logBlocked(req.target, req.action, this.policy.description, this.state.agent);

      // Print block notification
      console.log(
        `\n${COLORS.error}${SYMBOLS.blocked} BLOCKED${COLORS.reset}`
      );
      console.log(`   ${COLORS.dim}Action:${COLORS.reset} ${req.action}`);
      console.log(`   ${COLORS.dim}Target:${COLORS.reset} ${req.target}`);
      console.log(
        `   ${COLORS.dim}Policy:${COLORS.reset} ${this.policy.description}`
      );
      console.log(`\n   ${COLORS.success}Filesystem unchanged.${COLORS.reset}\n`);

      return { allowed: false, reason: this.policy.description };
    }

    this.state.allowedCount++;
    return { allowed: true };
  }

  getState(): SessionState {
    return this.state;
  }

  stop(): void {
    // Print session summary
    const duration = Date.now() - this.state.startTime.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    console.log(
      `\n${COLORS.success}${SYMBOLS.success} veto-leash session ended${COLORS.reset}\n`
    );
    console.log(`   Duration: ${minutes}m ${seconds}s`);
    console.log(`   Blocked: ${this.state.blockedCount} actions`);
    console.log(`   Allowed: ${this.state.allowedCount} actions`);

    if (this.state.blockedActions.length > 0) {
      console.log(`\n   Blocked actions:`);
      for (const action of this.state.blockedActions.slice(-5)) {
        console.log(`     ${SYMBOLS.bullet} ${action.action} ${action.target}`);
      }
    }
    console.log('');

    this.server?.close();
  }
}
