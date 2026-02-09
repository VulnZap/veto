import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { templateList, templateShow, templateApply } from '../../src/cli/template-commands.js';

const TEST_DIR = '/tmp/veto-template-test-' + Date.now();

describe('CLI template commands', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('templateList', () => {
    it('should print all templates', () => {
      templateList();
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('email-safety');
      expect(output).toContain('file-access');
      expect(output).toContain('api-rate-limit');
      expect(output).toContain('data-classification');
      expect(output).toContain('browser-navigation');
      expect(output).toContain('code-execution');
    });
  });

  describe('templateShow', () => {
    it('should print template details', () => {
      templateShow('email-safety');
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Email Safety');
      expect(output).toContain('allowedDomains');
      expect(output).toContain('maxRecipients');
      expect(output).toContain('(required)');
    });

    it('should exit 1 for unknown template', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });
      expect(() => templateShow('nonexistent')).toThrow('process.exit');
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });
  });

  describe('templateApply', () => {
    it('should output policy YAML to stdout', () => {
      templateApply('email-safety', {
        allowedDomains: '[company.com,partner.com]',
        maxRecipients: '5',
      });
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('version: "1.0"');
      expect(output).toContain('email-safety');
      expect(output).toContain('"company.com"');
    });

    it('should write policy to file when output path given', () => {
      const outPath = join(TEST_DIR, 'rules', 'email.yaml');
      templateApply(
        'email-safety',
        { allowedDomains: '[company.com]' },
        outPath
      );
      expect(existsSync(outPath)).toBe(true);
      const content = readFileSync(outPath, 'utf-8');
      expect(content).toContain('email-safety');
    });

    it('should exit 1 for unknown template', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });
      expect(() => templateApply('nonexistent', {})).toThrow('process.exit');
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('should exit 1 for missing required params', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });
      expect(() => templateApply('email-safety', {})).toThrow('process.exit');
      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorOutput = errorSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(errorOutput).toContain('Validation error');
      exitSpy.mockRestore();
    });

    it('should parse numeric params correctly', () => {
      templateApply('email-safety', {
        allowedDomains: '[test.com]',
        maxRecipients: '3',
      });
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('value: 3');
    });

    it('should parse boolean params correctly', () => {
      templateApply('browser-navigation', {
        allowedDomains: '[example.com]',
        blockDataUrls: 'false',
      });
      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('enabled: false');
    });
  });
});
