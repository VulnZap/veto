// test/commands.test.ts

import { describe, it, expect } from 'vitest';
import {
  splitCommands,
  normalizeCommand,
  commandMatches,
  checkCommand,
  extractFileTargets,
} from '../src/compiler/commands.js';
import type { Policy } from '../src/types.js';

describe('splitCommands', () => {
  it('splits on &&', () => {
    expect(splitCommands('npm install && npm run build')).toEqual([
      'npm install',
      'npm run build',
    ]);
  });

  it('splits on ||', () => {
    expect(splitCommands('npm test || echo "failed"')).toEqual([
      'npm test',
      'echo "failed"',
    ]);
  });

  it('splits on ;', () => {
    expect(splitCommands('cd src; ls')).toEqual(['cd src', 'ls']);
  });

  it('splits on |', () => {
    expect(splitCommands('cat file.txt | grep error')).toEqual([
      'cat file.txt',
      'grep error',
    ]);
  });

  it('handles complex chains', () => {
    expect(splitCommands('npm install && npm test || npm run build')).toEqual([
      'npm install',
      'npm test',
      'npm run build',
    ]);
  });

  it('preserves quotes', () => {
    const result = splitCommands('echo "hello && world"');
    expect(result).toEqual(['echo "hello && world"']);
  });

  it('handles subshells', () => {
    const result = splitCommands('bash -c "npm install"');
    expect(result).toContain('bash -c "npm install"');
    expect(result).toContain('npm install');
  });

  it('handles single command', () => {
    expect(splitCommands('npm install lodash')).toEqual(['npm install lodash']);
  });
});

describe('normalizeCommand', () => {
  it('lowercases', () => {
    expect(normalizeCommand('NPM Install')).toBe('npm install');
  });

  it('collapses whitespace', () => {
    expect(normalizeCommand('npm   install   lodash')).toBe('npm install lodash');
  });

  it('trims', () => {
    expect(normalizeCommand('  npm install  ')).toBe('npm install');
  });
});

describe('commandMatches', () => {
  it('matches exact command', () => {
    expect(commandMatches('npm install', 'npm install')).toBe(true);
  });

  it('matches with wildcard suffix', () => {
    expect(commandMatches('npm install lodash', 'npm install*')).toBe(true);
  });

  it('matches wildcard for any subcommand', () => {
    expect(commandMatches('npm install', 'npm *')).toBe(true);
    expect(commandMatches('npm run build', 'npm *')).toBe(true);
    expect(commandMatches('npm test', 'npm *')).toBe(true);
  });

  it('matches prefix without wildcard', () => {
    expect(commandMatches('npm install lodash', 'npm install')).toBe(true);
  });

  it('does not match different commands', () => {
    expect(commandMatches('pnpm install', 'npm install')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(commandMatches('NPM INSTALL', 'npm install')).toBe(true);
  });

  it('handles contains pattern', () => {
    expect(commandMatches('npm install lodash', '*lodash*')).toBe(true);
  });
});

describe('checkCommand', () => {
  const pnpmPolicy: Policy = {
    action: 'execute',
    include: [],
    exclude: [],
    description: 'Use pnpm',
    commandRules: [
      {
        block: ['npm install*', 'npm i *', 'npm i', 'npm ci'],
        suggest: 'pnpm install',
        reason: 'Project uses pnpm',
      },
    ],
  };

  it('blocks npm install', () => {
    const result = checkCommand('npm install', pnpmPolicy);
    expect(result.blocked).toBe(true);
    expect(result.rule?.suggest).toBe('pnpm install');
  });

  it('blocks npm install with package', () => {
    const result = checkCommand('npm install lodash', pnpmPolicy);
    expect(result.blocked).toBe(true);
  });

  it('blocks npm i alias', () => {
    const result = checkCommand('npm i lodash', pnpmPolicy);
    expect(result.blocked).toBe(true);
  });

  it('allows pnpm install', () => {
    const result = checkCommand('pnpm install', pnpmPolicy);
    expect(result.blocked).toBe(false);
  });

  it('blocks in chained command', () => {
    const result = checkCommand('cd project && npm install', pnpmPolicy);
    expect(result.blocked).toBe(true);
  });

  const sudoPolicy: Policy = {
    action: 'execute',
    include: [],
    exclude: [],
    description: 'No sudo',
    commandRules: [
      {
        block: ['sudo *'],
        reason: 'sudo not allowed',
      },
    ],
  };

  it('blocks sudo commands', () => {
    expect(checkCommand('sudo rm -rf /', sudoPolicy).blocked).toBe(true);
    expect(checkCommand('sudo npm install', sudoPolicy).blocked).toBe(true);
  });

  it('allows non-sudo commands', () => {
    expect(checkCommand('npm install', sudoPolicy).blocked).toBe(false);
  });

  const noForcePushPolicy: Policy = {
    action: 'execute',
    include: [],
    exclude: [],
    description: 'No force push',
    commandRules: [
      {
        block: ['git push --force*', 'git push -f*'],
        reason: 'Force push not allowed',
      },
    ],
  };

  it('blocks git push --force', () => {
    expect(checkCommand('git push --force', noForcePushPolicy).blocked).toBe(true);
    expect(checkCommand('git push --force origin main', noForcePushPolicy).blocked).toBe(true);
  });

  it('blocks git push -f', () => {
    expect(checkCommand('git push -f', noForcePushPolicy).blocked).toBe(true);
  });

  it('allows regular git push', () => {
    expect(checkCommand('git push', noForcePushPolicy).blocked).toBe(false);
    expect(checkCommand('git push origin main', noForcePushPolicy).blocked).toBe(false);
  });

  it('returns empty for policy without command rules', () => {
    const filePolicy: Policy = {
      action: 'delete',
      include: ['*.test.ts'],
      exclude: [],
      description: 'Protect tests',
    };
    expect(checkCommand('npm install', filePolicy).blocked).toBe(false);
  });
});

describe('extractFileTargets', () => {
  describe('delete action', () => {
    it('extracts rm targets', () => {
      expect(extractFileTargets('rm file.txt', 'delete')).toEqual(['file.txt']);
    });

    it('extracts rm -rf targets', () => {
      expect(extractFileTargets('rm -rf node_modules', 'delete')).toEqual([
        'node_modules',
      ]);
    });

    it('extracts multiple targets', () => {
      expect(extractFileTargets('rm file1.txt file2.txt', 'delete')).toEqual([
        'file1.txt',
        'file2.txt',
      ]);
    });

    it('extracts git rm targets', () => {
      expect(extractFileTargets('git rm file.txt', 'delete')).toEqual([
        'file.txt',
      ]);
    });
  });

  describe('modify action', () => {
    it('extracts mv source', () => {
      expect(extractFileTargets('mv old.txt new.txt', 'modify')).toEqual([
        'old.txt',
      ]);
    });

    it('extracts cp source', () => {
      expect(extractFileTargets('cp src.txt dst.txt', 'modify')).toEqual([
        'src.txt',
      ]);
    });
  });

  describe('execute action', () => {
    it('extracts node script', () => {
      expect(extractFileTargets('node script.js', 'execute')).toEqual([
        'script.js',
      ]);
    });

    it('extracts python script', () => {
      expect(extractFileTargets('python3 script.py', 'execute')).toEqual([
        'script.py',
      ]);
    });
  });

  describe('read action', () => {
    it('extracts cat targets', () => {
      expect(extractFileTargets('cat file.txt', 'read')).toEqual(['file.txt']);
    });

    it('extracts head targets', () => {
      expect(extractFileTargets('head -n 10 file.txt', 'read')).toEqual([
        'file.txt',
      ]);
    });
  });
});

describe('real-world scenarios', () => {
  it('handles "prefer bun" policy', () => {
    const bunPolicy: Policy = {
      action: 'execute',
      include: [],
      exclude: [],
      description: 'Use bun',
      commandRules: [
        {
          block: ['npm install*', 'npm i *', 'npm i', 'npm run*'],
          suggest: 'bun',
          reason: 'Project uses bun',
        },
        {
          block: ['pnpm install*', 'pnpm add*', 'pnpm run*'],
          suggest: 'bun',
          reason: 'Project uses bun',
        },
        {
          block: ['yarn', 'yarn install', 'yarn add*', 'yarn run*'],
          suggest: 'bun',
          reason: 'Project uses bun',
        },
      ],
    };

    expect(checkCommand('npm install', bunPolicy).blocked).toBe(true);
    expect(checkCommand('pnpm add lodash', bunPolicy).blocked).toBe(true);
    expect(checkCommand('yarn add lodash', bunPolicy).blocked).toBe(true);
    expect(checkCommand('bun install', bunPolicy).blocked).toBe(false);
    expect(checkCommand('bun add lodash', bunPolicy).blocked).toBe(false);
  });

  it('handles "vitest not jest" policy', () => {
    const vitestPolicy: Policy = {
      action: 'execute',
      include: [],
      exclude: [],
      description: 'Use vitest',
      commandRules: [
        {
          block: ['jest*', 'npx jest*'],
          suggest: 'vitest',
          reason: 'Project uses vitest',
        },
      ],
    };

    expect(checkCommand('jest', vitestPolicy).blocked).toBe(true);
    expect(checkCommand('jest --watch', vitestPolicy).blocked).toBe(true);
    expect(checkCommand('npx jest', vitestPolicy).blocked).toBe(true);
    expect(checkCommand('vitest', vitestPolicy).blocked).toBe(false);
    expect(checkCommand('pnpm test', vitestPolicy).blocked).toBe(false);
  });
});
