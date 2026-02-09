import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { diff } from '../../../src/cli/commands/diff.js';

const TEST_DIR = '/tmp/veto-diff-test-' + Date.now();

describe('CLI diff', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    vi.restoreAllMocks();
  });

  it('should detect no differences between identical files', async () => {
    const content = `
version: "1.0"
name: same
rules:
  - id: r1
    name: Rule 1
    action: block
    severity: high
    enabled: true
`;
    writeFileSync(join(TEST_DIR, 'a.yaml'), content, 'utf-8');
    writeFileSync(join(TEST_DIR, 'b.yaml'), content, 'utf-8');

    const result = await diff({
      path1: join(TEST_DIR, 'a.yaml'),
      path2: join(TEST_DIR, 'b.yaml'),
    });
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it('should detect added rules', async () => {
    writeFileSync(join(TEST_DIR, 'old.yaml'), `
version: "1.0"
name: old
rules:
  - id: r1
    name: Rule 1
    action: block
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'new.yaml'), `
version: "1.0"
name: new
rules:
  - id: r1
    name: Rule 1
    action: block
  - id: r2
    name: Rule 2
    action: allow
`, 'utf-8');

    const result = await diff({
      path1: join(TEST_DIR, 'old.yaml'),
      path2: join(TEST_DIR, 'new.yaml'),
    });
    expect(result.added).toHaveLength(1);
    expect(result.added[0].ruleId).toBe('r2');
    expect(result.removed).toHaveLength(0);
  });

  it('should detect removed rules', async () => {
    writeFileSync(join(TEST_DIR, 'old.yaml'), `
version: "1.0"
name: old
rules:
  - id: r1
    name: Rule 1
    action: block
  - id: r2
    name: Rule 2
    action: allow
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'new.yaml'), `
version: "1.0"
name: new
rules:
  - id: r1
    name: Rule 1
    action: block
`, 'utf-8');

    const result = await diff({
      path1: join(TEST_DIR, 'old.yaml'),
      path2: join(TEST_DIR, 'new.yaml'),
    });
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].ruleId).toBe('r2');
    expect(result.added).toHaveLength(0);
  });

  it('should detect changed rules', async () => {
    writeFileSync(join(TEST_DIR, 'old.yaml'), `
version: "1.0"
name: old
rules:
  - id: r1
    name: Rule 1
    action: block
    severity: high
`, 'utf-8');

    writeFileSync(join(TEST_DIR, 'new.yaml'), `
version: "1.0"
name: new
rules:
  - id: r1
    name: Rule 1
    action: allow
    severity: low
`, 'utf-8');

    const result = await diff({
      path1: join(TEST_DIR, 'old.yaml'),
      path2: join(TEST_DIR, 'new.yaml'),
    });
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].ruleId).toBe('r1');
    expect(result.changed[0].fields!.some(f => f.field === 'action')).toBe(true);
    expect(result.changed[0].fields!.some(f => f.field === 'severity')).toBe(true);
  });

  it('should output JSON when --json flag is set', async () => {
    const content = `
version: "1.0"
name: test
rules:
  - id: r1
    name: Rule
    action: block
`;
    writeFileSync(join(TEST_DIR, 'a.yaml'), content, 'utf-8');
    writeFileSync(join(TEST_DIR, 'b.yaml'), content, 'utf-8');

    const logSpy = vi.spyOn(console, 'log');
    await diff({
      path1: join(TEST_DIR, 'a.yaml'),
      path2: join(TEST_DIR, 'b.yaml'),
      json: true,
    });
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.unchanged).toBe(1);
  });
});
