import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { simulate } from '../../../src/cli/commands/simulate.js';

const TEST_DIR = '/tmp/veto-simulate-test-' + Date.now();

describe('CLI simulate', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    vi.restoreAllMocks();
  });

  it('should block when a rule matches', async () => {
    writeFileSync(join(TEST_DIR, 'policy.yaml'), `
version: "1.0"
name: test
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

    writeFileSync(join(TEST_DIR, 'input.yaml'), `
tool: read_file
arguments:
  path: /etc/passwd
`, 'utf-8');

    const result = await simulate({
      policy: join(TEST_DIR, 'policy.yaml'),
      input: join(TEST_DIR, 'input.yaml'),
    });
    expect(result.decision).toBe('block');
    expect(result.matchedRules).toHaveLength(1);
    expect(result.matchedRules[0].ruleId).toBe('block-etc');
  });

  it('should allow when no rules match', async () => {
    writeFileSync(join(TEST_DIR, 'policy.yaml'), `
version: "1.0"
name: test
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

    writeFileSync(join(TEST_DIR, 'input.yaml'), `
tool: read_file
arguments:
  path: /home/user/safe.txt
`, 'utf-8');

    const result = await simulate({
      policy: join(TEST_DIR, 'policy.yaml'),
      input: join(TEST_DIR, 'input.yaml'),
    });
    expect(result.decision).toBe('allow');
    expect(result.matchedRules).toHaveLength(0);
  });

  it('should allow when tool does not match rule tools', async () => {
    writeFileSync(join(TEST_DIR, 'policy.yaml'), `
version: "1.0"
name: test
rules:
  - id: block-write
    name: Block write
    enabled: true
    severity: high
    action: block
    tools:
      - write_file
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'input.yaml'), `
tool: read_file
arguments:
  path: /etc/passwd
`, 'utf-8');

    const result = await simulate({
      policy: join(TEST_DIR, 'policy.yaml'),
      input: join(TEST_DIR, 'input.yaml'),
    });
    expect(result.decision).toBe('allow');
  });

  it('should output JSON when --json flag is set', async () => {
    writeFileSync(join(TEST_DIR, 'policy.yaml'), `
version: "1.0"
name: test
rules:
  - id: r1
    name: R1
    enabled: true
    action: block
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'input.yaml'), `
tool: anything
arguments: {}
`, 'utf-8');

    const logSpy = vi.spyOn(console, 'log');
    await simulate({
      policy: join(TEST_DIR, 'policy.yaml'),
      input: join(TEST_DIR, 'input.yaml'),
      json: true,
    });
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.decision).toBe('block');
    expect(parsed.tool).toBe('anything');
  });

  it('should report matched conditions in verbose mode', async () => {
    writeFileSync(join(TEST_DIR, 'policy.yaml'), `
version: "1.0"
name: test
rules:
  - id: block-cmd
    name: Block dangerous commands
    enabled: true
    severity: critical
    action: block
    tools:
      - execute_command
    conditions:
      - field: arguments.command
        operator: contains
        value: "rm -rf"
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'input.yaml'), `
tool: execute_command
arguments:
  command: "sudo rm -rf /"
`, 'utf-8');

    const result = await simulate({
      policy: join(TEST_DIR, 'policy.yaml'),
      input: join(TEST_DIR, 'input.yaml'),
      verbose: true,
    });
    expect(result.decision).toBe('block');
    expect(result.matchedRules[0].conditionsMatched.length).toBeGreaterThan(0);
  });
});
