import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from '../../../src/cli/commands/validate.js';

const TEST_DIR = '/tmp/veto-validate-test-' + Date.now();

function writePolicy(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, 'utf-8');
}

describe('CLI validate', () => {
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

  it('should validate a correct policy file', async () => {
    writePolicy(join(TEST_DIR, 'veto', 'rules'), 'good.yaml', `
version: "1.0"
name: test-rules
rules:
  - id: block-rm
    name: Block rm
    enabled: true
    severity: critical
    action: block
    tools:
      - execute_command
    conditions:
      - field: arguments.command
        operator: contains
        value: "rm -rf"
`);
    const result = await validate({ path: TEST_DIR });
    expect(result.valid).toBe(true);
    expect(result.filesChecked).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect invalid YAML', async () => {
    writePolicy(join(TEST_DIR, 'veto', 'rules'), 'bad.yaml', `
version: "1.0"
rules:
  - [invalid yaml structure
`);
    const result = await validate({ path: TEST_DIR });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('YAML parse error');
  });

  it('should detect missing rules array', async () => {
    writePolicy(join(TEST_DIR, 'veto', 'rules'), 'norules.yaml', `
version: "1.0"
name: test
`);
    const result = await validate({ path: TEST_DIR });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Missing or invalid "rules" array'))).toBe(true);
  });

  it('should detect missing required fields on rules', async () => {
    writePolicy(join(TEST_DIR, 'veto', 'rules'), 'missing.yaml', `
version: "1.0"
name: test
rules:
  - action: block
`);
    const result = await validate({ path: TEST_DIR });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'id')).toBe(true);
    expect(result.errors.some(e => e.field === 'name')).toBe(true);
  });

  it('should detect invalid operator', async () => {
    writePolicy(join(TEST_DIR, 'veto', 'rules'), 'badop.yaml', `
version: "1.0"
name: test
rules:
  - id: test-rule
    name: Test
    action: block
    conditions:
      - field: arguments.path
        operator: invalid_op
        value: /etc
`);
    const result = await validate({ path: TEST_DIR });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field.includes('operator'))).toBe(true);
  });

  it('should detect duplicate rule IDs', async () => {
    writePolicy(join(TEST_DIR, 'veto', 'rules'), 'dupes.yaml', `
version: "1.0"
name: test
rules:
  - id: same-id
    name: Rule 1
    action: block
  - id: same-id
    name: Rule 2
    action: allow
`);
    const result = await validate({ path: TEST_DIR });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message === 'Duplicate rule ID')).toBe(true);
  });

  it('should warn on missing version and name', async () => {
    writePolicy(join(TEST_DIR, 'veto', 'rules'), 'nowarn.yaml', `
rules:
  - id: test
    name: Test
    action: block
`);
    const result = await validate({ path: TEST_DIR });
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.field === 'version')).toBe(true);
    expect(result.warnings.some(w => w.field === 'name')).toBe(true);
  });

  it('should validate a single file directly', async () => {
    const filePath = join(TEST_DIR, 'single.yaml');
    writePolicy(TEST_DIR, 'single.yaml', `
version: "1.0"
name: single
rules:
  - id: one
    name: One
    action: block
`);
    const result = await validate({ path: filePath });
    expect(result.valid).toBe(true);
    expect(result.filesChecked).toBe(1);
  });

  it('should output JSON when --json flag is set', async () => {
    writePolicy(join(TEST_DIR, 'veto', 'rules'), 'good.yaml', `
version: "1.0"
name: test
rules:
  - id: r1
    name: R1
    action: block
`);
    const logSpy = vi.spyOn(console, 'log');
    await validate({ path: TEST_DIR, json: true });
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.valid).toBe(true);
    expect(parsed.filesChecked).toBe(1);
  });

  it('should return valid with zero files when no YAML found', async () => {
    const emptyDir = join(TEST_DIR, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const result = await validate({ path: emptyDir });
    expect(result.valid).toBe(true);
    expect(result.filesChecked).toBe(0);
  });
});
