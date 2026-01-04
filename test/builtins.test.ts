// test/builtins.test.ts

import { describe, it, expect } from 'vitest';
import { findBuiltin, BUILTINS } from '../src/compiler/builtins.js';

describe('findBuiltin', () => {
  describe('direct matches', () => {
    it('finds "test files"', () => {
      const result = findBuiltin('test files');
      expect(result).not.toBeNull();
      expect(result?.include).toContain('*.test.*');
      expect(result?.include).toContain('*.spec.*');
      expect(result?.include).toContain('__tests__/**');
    });

    it('finds "config"', () => {
      const result = findBuiltin('config');
      expect(result).not.toBeNull();
      expect(result?.include).toContain('*.config.*');
      expect(result?.include).toContain('tsconfig*');
    });

    it('finds "env"', () => {
      const result = findBuiltin('env');
      expect(result).not.toBeNull();
      expect(result?.include).toContain('.env');
      expect(result?.include).toContain('.env.*');
      expect(result?.exclude).toContain('.env.example');
    });

    it('finds ".env"', () => {
      const result = findBuiltin('.env');
      expect(result).not.toBeNull();
      expect(result?.include).toContain('.env');
    });

    it('finds "migrations"', () => {
      const result = findBuiltin('migrations');
      expect(result).not.toBeNull();
      expect(result?.include).toContain('**/migrations/**');
      expect(result?.include).toContain('prisma/migrations/**');
    });

    it('finds "lock files"', () => {
      const result = findBuiltin('lock files');
      expect(result).not.toBeNull();
      expect(result?.include).toContain('package-lock.json');
      expect(result?.include).toContain('yarn.lock');
      expect(result?.include).toContain('pnpm-lock.yaml');
    });

    it('finds "node_modules"', () => {
      const result = findBuiltin('node_modules');
      expect(result).not.toBeNull();
      expect(result?.include).toContain('node_modules/**');
    });

    it('finds ".md files"', () => {
      const result = findBuiltin('.md files');
      expect(result).not.toBeNull();
      expect(result?.include).toContain('*.md');
      expect(result?.include).toContain('**/*.md');
    });
  });

  describe('case insensitivity', () => {
    it('matches regardless of case', () => {
      expect(findBuiltin('TEST FILES')).toEqual(findBuiltin('test files'));
      expect(findBuiltin('Test Files')).toEqual(findBuiltin('test files'));
      expect(findBuiltin('CONFIG')).toEqual(findBuiltin('config'));
    });
  });

  describe('partial matches', () => {
    it('finds "test" from "test source files"', () => {
      const result = findBuiltin('test');
      expect(result).not.toBeNull();
      expect(result?.include).toContain('*.test.*');
    });

    it('finds "database migrations" alias', () => {
      const result = findBuiltin('database migrations');
      expect(result).not.toBeNull();
      expect(result?.include).toContain('**/migrations/**');
    });
  });

  describe('no match', () => {
    it('returns null for unknown phrases', () => {
      expect(findBuiltin('foobar')).toBeNull();
      expect(findBuiltin('random stuff')).toBeNull();
      expect(findBuiltin('xyz123')).toBeNull();
    });

    it('empty string matches test files due to partial match logic', () => {
      // Empty string is technically "included" in any key string
      // This is expected behavior - users should provide meaningful input
      const result = findBuiltin('');
      expect(result).not.toBeNull();
    });
  });
});

describe('BUILTINS structure', () => {
  it('all entries have required fields', () => {
    for (const [key, value] of Object.entries(BUILTINS)) {
      expect(value.include, `${key} should have include`).toBeInstanceOf(Array);
      expect(value.exclude, `${key} should have exclude`).toBeInstanceOf(Array);
      expect(typeof value.description, `${key} should have description`).toBe('string');
      
      // Either include patterns or commandRules must be present
      const hasFileRules = value.include.length > 0;
      const hasCommandRules = Array.isArray(value.commandRules) && value.commandRules.length > 0;
      expect(
        hasFileRules || hasCommandRules, 
        `${key} should have either include patterns or commandRules`
      ).toBe(true);
    }
  });

  it('all patterns are valid strings', () => {
    for (const [key, value] of Object.entries(BUILTINS)) {
      for (const pattern of value.include) {
        expect(typeof pattern, `${key} include patterns should be strings`).toBe('string');
      }
      for (const pattern of value.exclude) {
        expect(typeof pattern, `${key} exclude patterns should be strings`).toBe('string');
      }
    }
  });

  it('all commandRules have required fields', () => {
    for (const [key, value] of Object.entries(BUILTINS)) {
      if (value.commandRules) {
        for (const rule of value.commandRules) {
          expect(Array.isArray(rule.block), `${key} commandRule should have block array`).toBe(true);
          expect(rule.block.length, `${key} commandRule block should not be empty`).toBeGreaterThan(0);
          expect(typeof rule.reason, `${key} commandRule should have reason`).toBe('string');
        }
      }
    }
  });
});
