// test/matcher.test.ts

import { describe, it, expect } from 'vitest';
import { normalizePath, isProtected, getProtectedFiles, getExcludedFiles } from '../src/matcher.js';
import type { Policy } from '../src/types.js';

describe('normalizePath', () => {
  it('converts Windows backslashes to forward slashes', () => {
    expect(normalizePath('src\\test\\file.ts')).toBe('src/test/file.ts');
    expect(normalizePath('C:\\Users\\test')).toBe('C:/Users/test');
  });

  it('removes trailing slashes', () => {
    expect(normalizePath('src/test/')).toBe('src/test');
    expect(normalizePath('/home/user/')).toBe('/home/user');
  });

  it('preserves root slash', () => {
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/home')).toBe('/home');
  });

  it('normalizes . and .. segments', () => {
    expect(normalizePath('./src/test')).toBe('src/test');
    expect(normalizePath('src/../lib')).toBe('lib');
    expect(normalizePath('src/./test')).toBe('src/test');
    expect(normalizePath('src/foo/../bar')).toBe('src/bar');
  });

  it('handles empty and dot paths', () => {
    expect(normalizePath('')).toBe('.');
    expect(normalizePath('.')).toBe('.');
    expect(normalizePath('./')).toBe('.');
  });

  it('preserves absolute paths', () => {
    expect(normalizePath('/usr/local/bin')).toBe('/usr/local/bin');
    expect(normalizePath('/home/./user/../test')).toBe('/home/test');
  });
});

describe('isProtected', () => {
  // Note: matcher uses basename:true, so patterns like `*.test.ts` match any file
  // ending in .test.ts regardless of path. Directory patterns with ** don't work
  // as expected with basename:true.
  const testPolicy: Policy = {
    action: 'delete',
    include: ['*.test.ts', '*.spec.ts'],
    exclude: ['*.fixture.ts'],
    description: 'Test files',
  };

  it('returns true for files matching include patterns', () => {
    expect(isProtected('foo.test.ts', testPolicy)).toBe(true);
    expect(isProtected('src/bar.spec.ts', testPolicy)).toBe(true);
    expect(isProtected('deep/nested/unit.test.ts', testPolicy)).toBe(true);
  });

  it('returns false for files not matching include patterns', () => {
    expect(isProtected('foo.ts', testPolicy)).toBe(false);
    expect(isProtected('src/bar.ts', testPolicy)).toBe(false);
    expect(isProtected('lib/helper.js', testPolicy)).toBe(false);
  });

  it('returns false for files matching exclude patterns', () => {
    expect(isProtected('data.fixture.ts', testPolicy)).toBe(false);
    expect(isProtected('mock.fixture.ts', testPolicy)).toBe(false);
  });

  it('handles Windows paths', () => {
    expect(isProtected('src\\bar.spec.ts', testPolicy)).toBe(true);
    expect(isProtected('test\\data.fixture.ts', testPolicy)).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isProtected('FOO.TEST.TS', testPolicy)).toBe(true);
    expect(isProtected('SRC/BAR.SPEC.TS', testPolicy)).toBe(true);
  });
});

describe('isProtected with env policy', () => {
  const envPolicy: Policy = {
    action: 'modify',
    include: ['.env', '.env.*', '**/.env', '**/.env.*'],
    exclude: ['.env.example', '.env.template', '.env.sample'],
    description: 'Environment files',
  };

  it('protects .env files', () => {
    expect(isProtected('.env', envPolicy)).toBe(true);
    expect(isProtected('.env.local', envPolicy)).toBe(true);
    expect(isProtected('.env.production', envPolicy)).toBe(true);
    expect(isProtected('config/.env', envPolicy)).toBe(true);
  });

  it('excludes example files', () => {
    expect(isProtected('.env.example', envPolicy)).toBe(false);
    expect(isProtected('.env.template', envPolicy)).toBe(false);
    expect(isProtected('.env.sample', envPolicy)).toBe(false);
  });

  it('does not protect unrelated files', () => {
    expect(isProtected('config.js', envPolicy)).toBe(false);
    expect(isProtected('environment.ts', envPolicy)).toBe(false);
  });
});

describe('getProtectedFiles', () => {
  const policy: Policy = {
    action: 'delete',
    include: ['*.test.ts'],
    exclude: [],
    description: 'Test files',
  };

  it('filters to only protected files', () => {
    const files = ['foo.test.ts', 'bar.ts', 'baz.test.ts', 'qux.js'];
    expect(getProtectedFiles(files, policy)).toEqual(['foo.test.ts', 'baz.test.ts']);
  });

  it('returns empty array when no files match', () => {
    const files = ['foo.ts', 'bar.js'];
    expect(getProtectedFiles(files, policy)).toEqual([]);
  });
});

describe('getExcludedFiles', () => {
  // Test with basename-compatible patterns
  const policy: Policy = {
    action: 'delete',
    include: ['*.test.ts', '*.spec.ts'],
    exclude: ['*.skip.test.ts'],
    description: 'Test files',
  };

  it('returns files that match both include and exclude', () => {
    const files = [
      'unit.test.ts',
      'integration.skip.test.ts',
      'e2e.skip.test.ts',
      'src/index.ts',
    ];
    expect(getExcludedFiles(files, policy)).toEqual([
      'integration.skip.test.ts',
      'e2e.skip.test.ts',
    ]);
  });
});
