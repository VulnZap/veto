// test/sessions.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  registerSession,
  unregisterSession,
  getActiveSessions,
  clearAllSessions,
} from '../src/wrapper/sessions.js';
import type { Policy } from '../src/types.js';

describe('sessions', () => {
  const testPolicy: Policy = {
    action: 'delete',
    include: ['*.test.ts'],
    exclude: [],
    description: 'Test files',
  };

  beforeEach(() => {
    clearAllSessions();
  });

  afterEach(() => {
    clearAllSessions();
  });

  describe('registerSession', () => {
    it('registers a session', () => {
      registerSession(3000, 'cc', 'wrapper', 'test restriction', testPolicy);
      const sessions = getActiveSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].port).toBe(3000);
      expect(sessions[0].agent).toBe('cc');
      expect(sessions[0].mode).toBe('wrapper');
      expect(sessions[0].restriction).toBe('test restriction');
    });

    it('records policy action and patterns', () => {
      registerSession(3001, 'windsurf', 'watchdog', 'protect env', testPolicy);
      const sessions = getActiveSessions();
      expect(sessions[0].policyAction).toBe('delete');
      expect(sessions[0].policyPatterns).toContain('*.test.ts');
    });
  });

  describe('unregisterSession', () => {
    it('removes the current process session', () => {
      registerSession(3000, 'cc', 'wrapper', 'test', testPolicy);
      expect(getActiveSessions().length).toBe(1);
      
      unregisterSession();
      expect(getActiveSessions().length).toBe(0);
    });
  });

  describe('getActiveSessions', () => {
    it('returns empty array when no sessions', () => {
      expect(getActiveSessions()).toEqual([]);
    });

    it('filters out dead processes', () => {
      // Register a session with a non-existent PID
      // This requires manipulating the registry file directly
      const cacheDir = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
      const registryPath = path.join(cacheDir, 'veto-leash', 'sessions.json');
      
      // Write a fake session with a dead PID
      const fakeSession = {
        sessions: [{
          pid: 999999, // Unlikely to exist
          port: 3000,
          agent: 'cc',
          mode: 'wrapper',
          restriction: 'test',
          cwd: '/tmp',
          startTime: new Date().toISOString(),
          policyAction: 'delete',
          policyPatterns: ['*.test.ts'],
        }],
      };
      
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(registryPath, JSON.stringify(fakeSession));
      
      // Should filter out the dead process
      const sessions = getActiveSessions();
      expect(sessions.length).toBe(0);
    });
  });

  describe('clearAllSessions', () => {
    it('removes all sessions', () => {
      registerSession(3000, 'cc', 'wrapper', 'test1', testPolicy);
      registerSession(3001, 'ws', 'watchdog', 'test2', testPolicy);
      
      // Note: These will have same PID, so only last one survives cleanup
      // But clearAllSessions should clear everything
      clearAllSessions();
      expect(getActiveSessions()).toEqual([]);
    });
  });

  describe('session record structure', () => {
    it('includes all required fields', () => {
      registerSession(3000, 'opencode', 'wrapper', 'protect tests', testPolicy);
      const sessions = getActiveSessions();
      const session = sessions[0];
      
      expect(session).toHaveProperty('pid');
      expect(session).toHaveProperty('port');
      expect(session).toHaveProperty('agent');
      expect(session).toHaveProperty('mode');
      expect(session).toHaveProperty('restriction');
      expect(session).toHaveProperty('cwd');
      expect(session).toHaveProperty('startTime');
      expect(session).toHaveProperty('policyAction');
      expect(session).toHaveProperty('policyPatterns');
    });

    it('records current working directory', () => {
      registerSession(3000, 'cc', 'wrapper', 'test', testPolicy);
      const sessions = getActiveSessions();
      expect(sessions[0].cwd).toBe(process.cwd());
    });

    it('records ISO timestamp', () => {
      registerSession(3000, 'cc', 'wrapper', 'test', testPolicy);
      const sessions = getActiveSessions();
      const startTime = new Date(sessions[0].startTime);
      expect(startTime).toBeInstanceOf(Date);
      expect(startTime.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
