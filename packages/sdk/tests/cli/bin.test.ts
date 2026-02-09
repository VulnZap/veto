import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const CLI_PATH = join(__dirname, '../../src/cli/bin.ts');

/**
 * Helper to run the CLI with arguments and capture output.
 */
function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsx', CLI_PATH, ...args], {
      cwd: join(__dirname, '../..'),
      env: { ...process.env, NODE_ENV: 'test' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

describe('CLI bin', () => {
  describe('--verbosity validation', () => {
    it('should accept "none" as valid verbosity', async () => {
      const { code, stderr } = await runCli([
        'explain',
        'test_tool',
        '{"key":"value"}',
        '--verbosity',
        'none',
        '--quiet',
      ]);
      // The command may fail because there are no rules, but not due to verbosity validation
      expect(stderr).not.toContain('Invalid verbosity value');
    });

    it('should accept "simple" as valid verbosity', async () => {
      const { code, stderr } = await runCli([
        'explain',
        'test_tool',
        '{"key":"value"}',
        '--verbosity',
        'simple',
        '--quiet',
      ]);
      expect(stderr).not.toContain('Invalid verbosity value');
    });

    it('should accept "verbose" as valid verbosity', async () => {
      const { code, stderr } = await runCli([
        'explain',
        'test_tool',
        '{"key":"value"}',
        '--verbosity',
        'verbose',
        '--quiet',
      ]);
      expect(stderr).not.toContain('Invalid verbosity value');
    });

    it('should reject invalid verbosity value with clear error', async () => {
      const { code, stderr } = await runCli([
        'explain',
        'test_tool',
        '{"key":"value"}',
        '--verbosity',
        'invalid',
      ]);
      expect(code).toBe(1);
      expect(stderr).toContain('Invalid verbosity value: "invalid"');
      expect(stderr).toContain('Allowed values: none, simple, verbose');
    });

    it('should reject typo verbosity value "verbos"', async () => {
      const { code, stderr } = await runCli([
        'explain',
        'test_tool',
        '{"key":"value"}',
        '--verbosity',
        'verbos',
      ]);
      expect(code).toBe(1);
      expect(stderr).toContain('Invalid verbosity value: "verbos"');
    });

    it('should reject empty verbosity value', async () => {
      const { code, stderr } = await runCli([
        'explain',
        'test_tool',
        '{"key":"value"}',
        '--verbosity',
        '',
      ]);
      expect(code).toBe(1);
      expect(stderr).toContain('Invalid verbosity value');
    });

    it('should default to verbose when verbosity not specified', async () => {
      // This test verifies the command runs without verbosity validation error
      // when no --verbosity flag is provided
      const { stderr } = await runCli([
        'explain',
        'test_tool',
        '{"key":"value"}',
        '--quiet',
      ]);
      expect(stderr).not.toContain('Invalid verbosity value');
    });
  });

  describe('help and version', () => {
    it('should show help with --help flag', async () => {
      const { code, stdout } = await runCli(['--help']);
      expect(code).toBe(0);
      expect(stdout).toContain('Veto - AI Agent Tool Call Guardrail');
      expect(stdout).toContain('--verbosity <level>');
    });

    it('should show version with version command', async () => {
      const { code, stdout } = await runCli(['version']);
      expect(code).toBe(0);
      expect(stdout).toContain('veto v');
    });
  });
});
