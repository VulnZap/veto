import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deploy } from '../../../src/cli/commands/deploy.js';

const TEST_DIR = '/tmp/veto-deploy-test-' + Date.now();

describe('CLI deploy', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'veto', 'rules'), { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    vi.restoreAllMocks();
  });

  it('should require API key for non-dry-run', async () => {
    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'policy.yaml'), `
version: "1.0"
name: test
rules:
  - id: r1
    name: R1
    action: block
`, 'utf-8');

    const oldKey = process.env.VETO_API_KEY;
    delete process.env.VETO_API_KEY;

    const result = await deploy({ path: TEST_DIR });

    if (oldKey) process.env.VETO_API_KEY = oldKey;

    expect(result.success).toBe(false);
    expect(result.error).toContain('API key required');
  });

  it('should succeed with dry run', async () => {
    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'policy.yaml'), `
version: "1.0"
name: test-policy
rules:
  - id: r1
    name: Rule 1
    action: block
  - id: r2
    name: Rule 2
    action: allow
`, 'utf-8');

    const result = await deploy({ path: TEST_DIR, dryRun: true });
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.policies).toHaveLength(1);
    expect(result.policies[0].name).toBe('test-policy');
    expect(result.policies[0].ruleCount).toBe(2);
  });

  it('should fail when no policy files found', async () => {
    const emptyDir = join(TEST_DIR, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const result = await deploy({ path: emptyDir, dryRun: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No policy files found');
  });

  it('should output JSON when --json flag is set', async () => {
    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'p.yaml'), `
version: "1.0"
name: p
rules:
  - id: r1
    name: R
    action: block
`, 'utf-8');

    const logSpy = vi.spyOn(console, 'log');
    await deploy({ path: TEST_DIR, dryRun: true, json: true });
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
  });

  it('should use target option', async () => {
    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'p.yaml'), `
version: "1.0"
name: p
rules:
  - id: r1
    name: R
    action: block
`, 'utf-8');

    const result = await deploy({ path: TEST_DIR, dryRun: true, target: 'staging' });
    expect(result.target).toBe('staging');
  });

  it('should deploy a single file', async () => {
    const filePath = join(TEST_DIR, 'single.yaml');
    writeFileSync(filePath, `
version: "1.0"
name: single-policy
rules:
  - id: r1
    name: R1
    action: block
`, 'utf-8');

    const result = await deploy({ path: filePath, dryRun: true });
    expect(result.success).toBe(true);
    expect(result.policies).toHaveLength(1);
    expect(result.policies[0].name).toBe('single-policy');
  });
});
