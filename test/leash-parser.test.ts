// test/leash-parser.test.ts

import { describe, it, expect } from 'vitest';
import {
  parseLeashFile,
  isSimpleLeashFormat,
  policiesToConfig,
} from '../src/config/leash-parser.js';

describe('parseLeashFile', () => {
  it('parses simple policies', () => {
    const content = `no lodash
no any types`;
    const policies = parseLeashFile(content);
    expect(policies).toHaveLength(2);
    expect(policies[0].restriction).toBe('no lodash');
    expect(policies[1].restriction).toBe('no any types');
  });

  it('ignores comments', () => {
    const content = `# This is a comment
no lodash
# Another comment
no any types`;
    const policies = parseLeashFile(content);
    expect(policies).toHaveLength(2);
    expect(policies[0].restriction).toBe('no lodash');
    expect(policies[1].restriction).toBe('no any types');
  });

  it('ignores blank lines', () => {
    const content = `no lodash

no any types

`;
    const policies = parseLeashFile(content);
    expect(policies).toHaveLength(2);
  });

  it('extracts reason after " - "', () => {
    const content = `no lodash - use native array methods`;
    const policies = parseLeashFile(content);
    expect(policies[0].restriction).toBe('no lodash');
    expect(policies[0].reason).toBe('use native array methods');
    expect(policies[0].raw).toBe('no lodash - use native array methods');
  });

  it('handles extend directive', () => {
    const content = `no lodash
extend @acme/typescript-strict
no any types`;
    const policies = parseLeashFile(content);
    expect(policies).toHaveLength(3);
    expect(policies[1].extend).toBe('@acme/typescript-strict');
    expect(policies[1].restriction).toBe('');
  });

  it('trims whitespace', () => {
    const content = `  no lodash  
    no any types    `;
    const policies = parseLeashFile(content);
    expect(policies[0].restriction).toBe('no lodash');
    expect(policies[1].restriction).toBe('no any types');
  });
});

describe('isSimpleLeashFormat', () => {
  it('detects simple format', () => {
    expect(isSimpleLeashFormat('no lodash')).toBe(true);
    expect(isSimpleLeashFormat('no lodash\nno any types')).toBe(true);
    expect(isSimpleLeashFormat('# comment\nno lodash')).toBe(true);
  });

  it('detects YAML format', () => {
    expect(isSimpleLeashFormat('version: 1\npolicies:\n  - "no lodash"')).toBe(false);
    expect(isSimpleLeashFormat('policies:\n  - "no lodash"')).toBe(false);
  });

  it('detects JSON format', () => {
    expect(isSimpleLeashFormat('{"version": 1}')).toBe(false);
  });

  it('handles empty content', () => {
    expect(isSimpleLeashFormat('')).toBe(true);
    expect(isSimpleLeashFormat('   ')).toBe(true);
    expect(isSimpleLeashFormat('# only comments')).toBe(true);
  });
});

describe('policiesToConfig', () => {
  it('converts policies to LeashConfig', () => {
    const policies = [
      { raw: 'no lodash', restriction: 'no lodash' },
      { raw: 'no any types', restriction: 'no any types' },
    ];
    const config = policiesToConfig(policies);
    expect(config.version).toBe(1);
    expect(config.policies).toEqual(['no lodash', 'no any types']);
  });

  it('filters out extend directives', () => {
    const policies = [
      { raw: 'no lodash', restriction: 'no lodash' },
      { raw: 'extend @acme/strict', restriction: '', extend: '@acme/strict' },
      { raw: 'no any types', restriction: 'no any types' },
    ];
    const config = policiesToConfig(policies);
    expect(config.policies).toEqual(['no lodash', 'no any types']);
  });
});
