import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '../../../src/cli/commands/test.js';

const TEST_DIR = '/tmp/veto-test-cmd-' + Date.now();

describe('CLI test', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'veto', 'rules'), { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    vi.restoreAllMocks();
  });

  it('should pass when expected decisions match', async () => {
    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'policy.yaml'), `
version: "1.0"
name: test-policy
rules:
  - id: block-etc
    name: Block etc access
    enabled: true
    severity: critical
    action: block
    tools:
      - read_file
    conditions:
      - field: arguments.path
        operator: starts_with
        value: /etc
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'policy.test.yaml'), `
policy: ./policy.yaml
tests:
  - name: should block /etc/passwd read
    tool: read_file
    arguments:
      path: /etc/passwd
    expect: block
  - name: should allow home dir read
    tool: read_file
    arguments:
      path: /home/user/file.txt
    expect: allow
`, 'utf-8');

    const result = await test({ path: TEST_DIR });
    expect(result.success).toBe(true);
    expect(result.totalTests).toBe(2);
    expect(result.totalPassed).toBe(2);
    expect(result.totalFailed).toBe(0);
  });

  it('should fail when expected decisions do not match', async () => {
    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'policy.yaml'), `
version: "1.0"
name: test-policy
rules:
  - id: block-etc
    name: Block etc
    enabled: true
    severity: critical
    action: block
    tools:
      - read_file
    conditions:
      - field: arguments.path
        operator: starts_with
        value: /etc
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'wrong.test.yaml'), `
policy: ./policy.yaml
tests:
  - name: expected allow but will block
    tool: read_file
    arguments:
      path: /etc/shadow
    expect: allow
`, 'utf-8');

    const result = await test({ path: TEST_DIR });
    expect(result.success).toBe(false);
    expect(result.totalFailed).toBe(1);
  });

  it('should handle no test files found', async () => {
    const result = await test({ path: TEST_DIR });
    expect(result.success).toBe(true);
    expect(result.totalTests).toBe(0);
  });

  it('should output JSON when --json flag is set', async () => {
    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'p.yaml'), `
version: "1.0"
name: p
rules:
  - id: r1
    name: R1
    enabled: true
    action: block
    tools: [bash]
    conditions:
      - field: arguments.cmd
        operator: contains
        value: sudo
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'p.test.yaml'), `
policy: ./p.yaml
tests:
  - name: blocks sudo
    tool: bash
    arguments:
      cmd: sudo rm -rf /
    expect: block
`, 'utf-8');

    const logSpy = vi.spyOn(console, 'log');
    await test({ path: TEST_DIR, json: true });
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.totalPassed).toBe(1);
  });

  it('should evaluate rules with no conditions as matching all', async () => {
    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'blanket.yaml'), `
version: "1.0"
name: blanket
rules:
  - id: block-all
    name: Block all
    enabled: true
    severity: high
    action: block
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'blanket.test.yaml'), `
policy: ./blanket.yaml
tests:
  - name: any tool is blocked
    tool: anything
    arguments: {}
    expect: block
`, 'utf-8');

    const result = await test({ path: TEST_DIR });
    expect(result.success).toBe(true);
    expect(result.totalPassed).toBe(1);
  });

  it('should not match disabled rules', async () => {
    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'disabled.yaml'), `
version: "1.0"
name: disabled
rules:
  - id: disabled-rule
    name: Disabled
    enabled: false
    severity: high
    action: block
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'veto', 'rules', 'disabled.test.yaml'), `
policy: ./disabled.yaml
tests:
  - name: disabled rule does not block
    tool: anything
    arguments: {}
    expect: allow
`, 'utf-8');

    const result = await test({ path: TEST_DIR });
    expect(result.success).toBe(true);
    expect(result.totalPassed).toBe(1);
  });
});
