// src/compiler/builtins.ts

import type { Policy, CommandRule, ContentRule } from '../types.js';
import {
  LODASH_PATTERNS,
  ANY_TYPE_PATTERNS,
  CONSOLE_PATTERNS,
  CLASS_COMPONENT_PATTERNS,
  EVAL_PATTERNS,
  MOMENT_PATTERNS,
  COMMON_PATTERNS,
  EXCEPTION_PATTERNS,
} from './content.js';

type PartialPolicy = Omit<Policy, 'action'>;

export const BUILTINS: Record<string, PartialPolicy> = {
  'test files': {
    include: [
      '*.test.*',
      '*.spec.*',
      '**/*.test.*',
      '**/*.spec.*',
      '__tests__/**',
      'test/**/*.ts',
      'test/**/*.js',
      'test/**/*.tsx',
      'test/**/*.jsx',
    ],
    exclude: [
      'test-results.*',
      'test-output.*',
      '**/coverage/**',
      '*.log',
      '*.xml',
    ],
    description: 'Test source files (not artifacts)',
  },
  'test source files': {
    include: [
      '*.test.*',
      '*.spec.*',
      '**/*.test.*',
      '**/*.spec.*',
      '__tests__/**',
      'test/**/*.ts',
      'test/**/*.js',
    ],
    exclude: ['test-results.*', 'test-output.*', '**/coverage/**', '*.log'],
    description: 'Test source files (not artifacts)',
  },
  config: {
    include: [
      '*.config.*',
      '**/*.config.*',
      'tsconfig*',
      '.eslintrc*',
      '.prettierrc*',
      'vite.config.*',
      'webpack.config.*',
      'jest.config.*',
      'vitest.config.*',
      'next.config.*',
    ],
    exclude: [],
    description: 'Configuration files',
  },
  env: {
    include: ['.env', '.env.*', '**/.env', '**/.env.*'],
    exclude: ['.env.example', '.env.template', '.env.sample'],
    description: 'Environment files (secrets)',
  },
  '.env': {
    include: ['.env', '.env.*', '**/.env', '**/.env.*'],
    exclude: ['.env.example', '.env.template', '.env.sample'],
    description: 'Environment files (secrets)',
  },
  migrations: {
    include: [
      '**/migrations/**',
      '*migrate*',
      'prisma/migrations/**',
      'db/migrate/**',
      '**/db/**/*.sql',
      'drizzle/**',
    ],
    exclude: [],
    description: 'Database migrations',
  },
  'database migrations': {
    include: [
      '**/migrations/**',
      '*migrate*',
      'prisma/migrations/**',
      'db/migrate/**',
      'drizzle/**',
    ],
    exclude: [],
    description: 'Database migrations',
  },
  'lock files': {
    include: [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'Gemfile.lock',
      'Cargo.lock',
      'poetry.lock',
      '*.lock',
    ],
    exclude: [],
    description: 'Dependency lock files',
  },
  node_modules: {
    include: ['node_modules/**', '**/node_modules/**'],
    exclude: [],
    description: 'Node modules directory',
  },
  '.md files': {
    include: ['*.md', '**/*.md'],
    exclude: [],
    description: 'Markdown files',
  },
  'src/core': {
    include: ['src/core/**'],
    exclude: ['src/core/**/*.log', 'src/core/**/*.tmp'],
    description: 'Core source directory',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND-AWARE BUILTINS (Phase 1)
  // These enforce preferences at the command level, not just file level
  // ═══════════════════════════════════════════════════════════════════════════

  // Package manager preferences
  'prefer pnpm': {
    include: [],
    exclude: [],
    description: 'Use pnpm instead of npm/yarn',
    commandRules: [
      {
        block: ['npm install*', 'npm i *', 'npm i', 'npm ci', 'npm add*'],
        suggest: 'pnpm install',
        reason: 'Project uses pnpm',
      },
      {
        block: ['yarn', 'yarn install', 'yarn add*'],
        suggest: 'pnpm add',
        reason: 'Project uses pnpm',
      },
    ],
  },
  'use pnpm': {
    include: [],
    exclude: [],
    description: 'Use pnpm instead of npm/yarn',
    commandRules: [
      {
        block: ['npm install*', 'npm i *', 'npm i', 'npm ci', 'npm add*'],
        suggest: 'pnpm install',
        reason: 'Project uses pnpm',
      },
      {
        block: ['yarn', 'yarn install', 'yarn add*'],
        suggest: 'pnpm add',
        reason: 'Project uses pnpm',
      },
    ],
  },
  'pnpm not npm': {
    include: [],
    exclude: [],
    description: 'Use pnpm instead of npm',
    commandRules: [
      {
        block: ['npm install*', 'npm i *', 'npm i', 'npm ci', 'npm add*', 'npm run*'],
        suggest: 'pnpm',
        reason: 'Project uses pnpm',
      },
    ],
  },

  'prefer bun': {
    include: [],
    exclude: [],
    description: 'Use bun instead of npm/pnpm/yarn',
    commandRules: [
      {
        block: ['npm install*', 'npm i *', 'npm i', 'npm ci', 'npm add*', 'npm run*'],
        suggest: 'bun',
        reason: 'Project uses bun',
      },
      {
        block: ['pnpm install*', 'pnpm i *', 'pnpm add*', 'pnpm run*'],
        suggest: 'bun',
        reason: 'Project uses bun',
      },
      {
        block: ['yarn', 'yarn install', 'yarn add*', 'yarn run*'],
        suggest: 'bun',
        reason: 'Project uses bun',
      },
    ],
  },
  'use bun': {
    include: [],
    exclude: [],
    description: 'Use bun instead of npm/pnpm/yarn',
    commandRules: [
      {
        block: ['npm install*', 'npm i *', 'npm i', 'npm ci', 'npm add*', 'npm run*'],
        suggest: 'bun',
        reason: 'Project uses bun',
      },
      {
        block: ['pnpm install*', 'pnpm i *', 'pnpm add*', 'pnpm run*'],
        suggest: 'bun',
        reason: 'Project uses bun',
      },
      {
        block: ['yarn', 'yarn install', 'yarn add*', 'yarn run*'],
        suggest: 'bun',
        reason: 'Project uses bun',
      },
    ],
  },
  'bun not npm': {
    include: [],
    exclude: [],
    description: 'Use bun instead of npm',
    commandRules: [
      {
        block: ['npm install*', 'npm i *', 'npm i', 'npm ci', 'npm add*', 'npm run*'],
        suggest: 'bun',
        reason: 'Project uses bun',
      },
    ],
  },

  'prefer yarn': {
    include: [],
    exclude: [],
    description: 'Use yarn instead of npm',
    commandRules: [
      {
        block: ['npm install*', 'npm i *', 'npm i', 'npm ci', 'npm add*'],
        suggest: 'yarn add',
        reason: 'Project uses yarn',
      },
    ],
  },

  // Dangerous command prevention
  'no sudo': {
    include: [],
    exclude: [],
    description: 'Prevent sudo commands',
    commandRules: [
      {
        block: ['sudo *'],
        reason: 'sudo not allowed in this project',
      },
    ],
  },

  'no force push': {
    include: [],
    exclude: [],
    description: 'Prevent git force push',
    commandRules: [
      {
        block: ['git push --force*', 'git push -f*', 'git push * --force*', 'git push * -f*'],
        reason: 'Force push not allowed - could overwrite team changes',
      },
    ],
  },

  'no hard reset': {
    include: [],
    exclude: [],
    description: 'Prevent git hard reset',
    commandRules: [
      {
        block: ['git reset --hard*'],
        suggest: 'git reset --soft or git stash',
        reason: 'Hard reset can lose uncommitted work',
      },
    ],
  },

  // Testing framework preferences
  'use vitest': {
    include: [],
    exclude: [],
    description: 'Use vitest instead of jest',
    commandRules: [
      {
        block: ['jest*', 'npx jest*', 'npm run jest*', 'pnpm jest*'],
        suggest: 'vitest',
        reason: 'Project uses vitest',
      },
    ],
  },
  'vitest not jest': {
    include: [],
    exclude: [],
    description: 'Use vitest instead of jest',
    commandRules: [
      {
        block: ['jest*', 'npx jest*', 'npm run jest*', 'pnpm jest*'],
        suggest: 'vitest or pnpm test',
        reason: 'Project uses vitest',
      },
    ],
  },

  'use pytest': {
    include: [],
    exclude: [],
    description: 'Use pytest instead of unittest',
    commandRules: [
      {
        block: ['python -m unittest*', 'python3 -m unittest*'],
        suggest: 'pytest',
        reason: 'Project uses pytest',
      },
    ],
  },

  // External network restrictions
  'no curl external': {
    include: [],
    exclude: [],
    description: 'Prevent curl to external URLs',
    commandRules: [
      {
        block: ['curl http://*', 'curl https://*', 'wget http://*', 'wget https://*'],
        reason: 'External network requests not allowed',
      },
    ],
  },

  'no curl pipe bash': {
    include: [],
    exclude: [],
    description: 'Prevent piping curl output to bash',
    commandRules: [
      {
        block: ['curl * | bash*', 'curl * | sh*', 'wget * | bash*', 'wget * | sh*'],
        reason: 'Piping remote scripts to shell is dangerous',
      },
    ],
  },

  // Production safety
  'no production db': {
    include: [],
    exclude: [],
    description: 'Prevent commands targeting production database',
    commandRules: [
      {
        block: ['*--production*migrate*', '*prod*migrate*', '*DATABASE_URL=*prod*'],
        reason: 'Production database commands blocked',
      },
    ],
  },

  // Docker preferences
  'use docker compose': {
    include: [],
    exclude: [],
    description: 'Use docker compose (v2) instead of docker-compose',
    commandRules: [
      {
        block: ['docker-compose *'],
        suggest: 'docker compose',
        reason: 'Use docker compose v2 syntax',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT-AWARE BUILTINS (Phase 2)
  // These check file contents for banned patterns/imports
  //
  // DESIGN: Each builtin uses COMPREHENSIVE pattern sets with:
  // - 'strict' mode: strips comments/strings before matching (fewer false positives)
  // - exceptions: patterns that indicate false positives
  // - multiple patterns: catches all variants (ES imports, CommonJS, dynamic, etc.)
  // ═══════════════════════════════════════════════════════════════════════════

  // Import restrictions
  'no lodash': {
    include: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.mts', '**/*.mjs'],
    exclude: [],
    description: 'Prefer native methods over lodash',
    commandRules: [
      {
        block: [
          'npm install lodash*', 'npm i lodash*',
          'pnpm add lodash*', 'pnpm i lodash*',
          'bun add lodash*', 'bun i lodash*',
          'yarn add lodash*',
        ],
        reason: 'Use native array/object methods instead of lodash',
      },
    ],
    contentRules: [
      // ES6 imports (default, named, namespace)
      {
        pattern: LODASH_PATTERNS.any,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx', '*.mts', '*.mjs'],
        reason: 'Use native array/object methods instead of lodash',
        suggest: 'Use Array.map(), Array.filter(), Object.keys(), etc.',
        mode: 'strict',
        exceptions: [EXCEPTION_PATTERNS.lodashMigration],
      },
    ],
  },
  'dont use lodash': {
    include: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    exclude: [],
    description: 'Prefer native methods over lodash',
    commandRules: [
      {
        block: ['npm install lodash*', 'pnpm add lodash*', 'bun add lodash*'],
        reason: 'Use native methods instead of lodash',
      },
    ],
    contentRules: [
      {
        pattern: LODASH_PATTERNS.any,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'Use native methods instead of lodash',
        suggest: 'Use native Array/Object methods',
        mode: 'strict',
      },
    ],
  },

  'no moment': {
    include: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    exclude: [],
    description: 'Use date-fns or native Date instead of moment.js',
    commandRules: [
      {
        block: [
          'npm install moment*', 'npm i moment',
          'pnpm add moment*',
          'bun add moment*',
          'yarn add moment*',
        ],
        suggest: 'date-fns or native Date',
        reason: 'moment.js is deprecated and heavy',
      },
    ],
    contentRules: [
      {
        pattern: MOMENT_PATTERNS.any,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'moment.js is deprecated; use date-fns or native Date',
        suggest: 'import { format } from "date-fns"',
        mode: 'strict',
      },
    ],
  },

  'no jquery': {
    include: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    exclude: [],
    description: 'Use modern DOM APIs instead of jQuery',
    commandRules: [
      {
        block: ['npm install jquery*', 'pnpm add jquery*', 'bun add jquery*', 'yarn add jquery*'],
        reason: 'Use native DOM APIs instead of jQuery',
      },
    ],
    contentRules: [
      {
        pattern: COMMON_PATTERNS.jqueryImport,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'Use native DOM APIs instead of jQuery',
        suggest: 'document.querySelector(), fetch(), etc.',
        mode: 'strict',
      },
    ],
  },

  // Console/Debug restrictions
  'no console.log': {
    include: ['src/**/*.ts', 'src/**/*.js', 'src/**/*.tsx', 'src/**/*.jsx'],
    exclude: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**', '**/__tests__/**'],
    description: 'No console.log in production code',
    contentRules: [
      {
        pattern: CONSOLE_PATTERNS.log,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'Use proper logging instead of console.log',
        suggest: 'Use a logging library like pino or winston',
        mode: 'strict',
        exceptions: [EXCEPTION_PATTERNS.consoleInTest],
      },
      // Also catch destructured and aliased console
      {
        pattern: CONSOLE_PATTERNS.destructure,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'Destructured console.log detected',
        mode: 'strict',
      },
    ],
  },
  'no console': {
    include: ['src/**/*.ts', 'src/**/*.js', 'src/**/*.tsx', 'src/**/*.jsx'],
    exclude: ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**'],
    description: 'No console statements in production code',
    contentRules: [
      {
        pattern: CONSOLE_PATTERNS.anyMethod,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'Use proper logging instead of console statements',
        suggest: 'Use a logging library',
        mode: 'strict',
        exceptions: [EXCEPTION_PATTERNS.consoleInTest],
      },
      {
        pattern: CONSOLE_PATTERNS.bracket,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'Console accessed via bracket notation',
        mode: 'strict',
      },
      {
        pattern: CONSOLE_PATTERNS.destructure,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'Destructured console methods detected',
        mode: 'strict',
      },
    ],
  },

  'no debugger': {
    include: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    exclude: [],
    description: 'No debugger statements',
    contentRules: [
      {
        pattern: COMMON_PATTERNS.debugger,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'Remove debugger statements before committing',
        mode: 'strict', // Won't match 'debugger' in strings/comments
      },
    ],
  },

  // React patterns
  'no class components': {
    include: ['**/*.tsx', '**/*.jsx'],
    exclude: [],
    description: 'Use functional React components with hooks',
    contentRules: [
      {
        pattern: CLASS_COMPONENT_PATTERNS.any,
        fileTypes: ['*.tsx', '*.jsx'],
        reason: 'Use functional components with hooks instead of class components',
        suggest: 'Convert to: const Component = () => { ... }',
        mode: 'strict',
      },
    ],
  },
  'functional components only': {
    include: ['**/*.tsx', '**/*.jsx'],
    exclude: [],
    description: 'Use functional React components',
    contentRules: [
      {
        pattern: CLASS_COMPONENT_PATTERNS.any,
        fileTypes: ['*.tsx', '*.jsx'],
        reason: 'Use functional components with hooks',
        suggest: 'const Component: FC = () => { ... }',
        mode: 'strict',
      },
    ],
  },

  // TypeScript strictness - COMPREHENSIVE any detection
  'no any': {
    include: ['**/*.ts', '**/*.tsx'],
    exclude: ['**/*.d.ts', '**/types/**', '**/@types/**'],
    description: 'Avoid any type in TypeScript',
    contentRules: [
      // Type annotations: : any
      {
        pattern: ANY_TYPE_PATTERNS.annotation,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Use proper TypeScript types instead of any',
        suggest: 'Use unknown, specific types, or generics',
        mode: 'strict',
        exceptions: [EXCEPTION_PATTERNS.anyInVariableName],
      },
      // Generic parameters: <any>
      {
        pattern: ANY_TYPE_PATTERNS.genericParam,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Avoid any in generic parameters',
        suggest: 'Use specific type or unknown',
        mode: 'strict',
      },
      // Common generics with any
      {
        pattern: ANY_TYPE_PATTERNS.genericInArray,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Avoid Array<any>',
        suggest: 'Use Array<unknown> or specific type[]',
        mode: 'strict',
      },
      // Type assertions: as any
      {
        pattern: ANY_TYPE_PATTERNS.asAny,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Avoid casting to any',
        suggest: 'Use proper type narrowing or as unknown',
        mode: 'strict',
      },
    ],
  },
  'no any types': {
    include: ['**/*.ts', '**/*.tsx'],
    exclude: ['**/*.d.ts'],
    description: 'Comprehensive any type detection',
    contentRules: [
      // Use the combined common pattern for basic cases
      {
        pattern: ANY_TYPE_PATTERNS.common,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Use proper TypeScript types instead of any',
        suggest: 'Use unknown or specific types',
        mode: 'strict',
        exceptions: [EXCEPTION_PATTERNS.anyInVariableName],
      },
      // Type aliases
      {
        pattern: ANY_TYPE_PATTERNS.typeAlias,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Avoid type aliases to any',
        mode: 'strict',
      },
      // Generic defaults
      {
        pattern: ANY_TYPE_PATTERNS.genericDefault,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Avoid any as generic default',
        suggest: 'Use unknown as default',
        mode: 'strict',
      },
      // Record<string, any>
      {
        pattern: ANY_TYPE_PATTERNS.genericInRecord,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Avoid Record<string, any>',
        suggest: 'Use Record<string, unknown>',
        mode: 'strict',
      },
    ],
  },
  'strict types': {
    include: ['**/*.ts', '**/*.tsx'],
    exclude: ['**/*.d.ts'],
    description: 'Enforce strict TypeScript typing - catches ALL any variants',
    contentRules: [
      // Basic any
      {
        pattern: ANY_TYPE_PATTERNS.common,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Strict typing: avoid any',
        mode: 'strict',
        exceptions: [EXCEPTION_PATTERNS.anyInVariableName],
      },
      // Union/intersection with any
      {
        pattern: ANY_TYPE_PATTERNS.unionAny,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Strict typing: avoid | any unions',
        mode: 'strict',
      },
      {
        pattern: ANY_TYPE_PATTERNS.intersectionAny,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Strict typing: avoid & any intersections',
        mode: 'strict',
      },
      // Double assertion
      {
        pattern: ANY_TYPE_PATTERNS.asUnknownAsAny,
        fileTypes: ['*.ts', '*.tsx'],
        reason: 'Strict typing: avoid as unknown as any',
        mode: 'strict',
      },
    ],
  },

  // Security patterns
  'no eval': {
    include: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    exclude: [],
    description: 'Prevent use of eval() and similar unsafe constructs',
    contentRules: [
      {
        pattern: EVAL_PATTERNS.direct,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'eval() is a security risk',
        suggest: 'Use JSON.parse() or safer alternatives',
        mode: 'strict',
      },
      {
        pattern: EVAL_PATTERNS.functionConstructor,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'new Function() is equivalent to eval()',
        suggest: 'Use a safer approach',
        mode: 'strict',
      },
      {
        pattern: EVAL_PATTERNS.setTimeoutString,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'setTimeout with string is eval-like',
        suggest: 'Pass a function instead of string',
        mode: 'strict',
      },
    ],
  },

  'no innerHTML': {
    include: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    exclude: [],
    description: 'Prevent direct innerHTML assignment (XSS risk)',
    contentRules: [
      {
        pattern: COMMON_PATTERNS.innerHtml,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'innerHTML is an XSS risk',
        suggest: 'Use textContent or DOM methods',
        mode: 'strict',
      },
      {
        pattern: COMMON_PATTERNS.dangerouslySetInnerHTML,
        fileTypes: ['*.tsx', '*.jsx'],
        reason: 'dangerouslySetInnerHTML should be avoided',
        suggest: 'Use proper React rendering',
        mode: 'strict',
      },
    ],
  },

  // Code quality
  'no todos': {
    include: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    exclude: [],
    description: 'No TODO comments in committed code',
    contentRules: [
      {
        pattern: COMMON_PATTERNS.todoComment,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'Resolve TODO comments before committing',
        // Note: mode 'fast' intentionally - we WANT to catch comments
      },
      {
        pattern: COMMON_PATTERNS.fixmeComment,
        fileTypes: ['*.ts', '*.js', '*.tsx', '*.jsx'],
        reason: 'Resolve FIXME comments before committing',
      },
    ],
  },
};

/**
 * Phrase variations that map to builtins
 */
const PHRASE_ALIASES: Record<string, string> = {
  // Package managers
  'pnpm over npm': 'prefer pnpm',
  'pnpm instead of npm': 'prefer pnpm',
  'use pnpm not npm': 'pnpm not npm',
  'bun over npm': 'prefer bun',
  'bun instead of npm': 'prefer bun',
  'use bun not npm': 'bun not npm',
  'bun over pnpm': 'prefer bun',
  'yarn over npm': 'prefer yarn',
  // Testing
  'vitest over jest': 'vitest not jest',
  'vitest instead of jest': 'vitest not jest',
  'pytest over unittest': 'use pytest',
  // Git safety
  'no force pushing': 'no force push',
  'prevent force push': 'no force push',
  'block force push': 'no force push',
  'no git force push': 'no force push',
  // Docker
  'docker compose v2': 'use docker compose',
  // Content rules - lodash
  'avoid lodash': 'no lodash',
  'ban lodash': 'no lodash',
  'native methods': 'no lodash',
  'no underscore': 'no lodash',
  // Content rules - moment
  'avoid moment': 'no moment',
  'ban moment': 'no moment',
  'no moment.js': 'no moment',
  // Content rules - jQuery
  'avoid jquery': 'no jquery',
  'ban jquery': 'no jquery',
  'no jquery please': 'no jquery',
  // Content rules - console
  'no console statements': 'no console',
  'no logging': 'no console',
  'remove console.log': 'no console.log',
  'clean console': 'no console.log',
  // Content rules - React
  'use functional components': 'no class components',
  'hooks only': 'no class components',
  'no react classes': 'no class components',
  'modern react': 'no class components',
  // Content rules - TypeScript
  'avoid any': 'no any',
  'ban any type': 'no any',
  'strict typescript': 'strict types',
  'no any keyword': 'no any',
  // Content rules - security
  'no eval usage': 'no eval',
  'ban eval': 'no eval',
  'no xss': 'no innerHTML',
  'safe dom': 'no innerHTML',
  // Content rules - code quality
  'no todo comments': 'no todos',
  'clean todos': 'no todos',
  'resolve todos': 'no todos',
  'no fixme': 'no todos',
};

export function findBuiltin(phrase: string): PartialPolicy | null {
  const normalized = phrase.toLowerCase().trim()
    // Normalize common patterns
    .replace(/don'?t\s+(use\s+)?/g, 'no ')
    .replace(/^prefer\s+to\s+use\s+/g, 'prefer ')
    .replace(/\s+over\s+/g, ' not ')
    .replace(/\s+instead\s+of\s+/g, ' not ')
    .trim();

  // Check phrase aliases first
  if (PHRASE_ALIASES[normalized]) {
    return BUILTINS[PHRASE_ALIASES[normalized]];
  }

  // Direct match
  if (BUILTINS[normalized]) {
    return BUILTINS[normalized];
  }

  // Check with common prefix/suffix variations
  const variations = [
    normalized,
    normalized.replace(/^use\s+/, ''),
    normalized.replace(/^prefer\s+/, ''),
    normalized.replace(/^no\s+/, ''),
    `use ${normalized}`,
    `prefer ${normalized}`,
    `no ${normalized}`,
  ];

  for (const variation of variations) {
    if (BUILTINS[variation]) {
      return BUILTINS[variation];
    }
  }

  // Partial match - be more careful to avoid false positives
  for (const [key, value] of Object.entries(BUILTINS)) {
    // Skip command-only builtins for partial file matching
    if (value.include.length === 0 && value.commandRules) {
      // For command builtins, require closer match
      if (normalized.includes(key) || key.includes(normalized)) {
        return value;
      }
    } else {
      // For file builtins, allow partial match
      if (normalized.includes(key) || key.includes(normalized)) {
        return value;
      }
    }
  }

  return null;
}
