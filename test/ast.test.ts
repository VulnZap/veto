// test/ast.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  parseFile,
  detectLanguage,
  clearTreeCache,
  resetParserState,
  initParser,
  loadLanguage,
  runQuery,
  getASTRules,
  checkContentAST,
  listASTBuiltins,
  type LanguageType,
} from '../src/ast/index.js';
import type { Policy } from '../src/types.js';

// Initialize tree-sitter at module load time
let treeSitterAvailable = false;

try {
  // Reset state and reinitialize
  resetParserState();
  await initParser();
  await loadLanguage('typescript');
  await loadLanguage('javascript');
  treeSitterAvailable = true;
} catch (error) {
  console.warn('Tree-sitter not available, skipping AST tests:', error);
}

describe('AST Parser', () => {
  beforeEach(() => {
    clearTreeCache();
  });

  describe('detectLanguage', () => {
    it('detects TypeScript files', () => {
      expect(detectLanguage('file.ts')).toBe('typescript');
      expect(detectLanguage('/path/to/file.ts')).toBe('typescript');
    });

    it('detects TSX files', () => {
      expect(detectLanguage('file.tsx')).toBe('tsx');
    });

    it('detects JavaScript files', () => {
      expect(detectLanguage('file.js')).toBe('javascript');
      expect(detectLanguage('file.mjs')).toBe('javascript');
      expect(detectLanguage('file.cjs')).toBe('javascript');
    });

    it('detects JSX files', () => {
      expect(detectLanguage('file.jsx')).toBe('jsx');
    });

    it('returns null for unsupported files', () => {
      expect(detectLanguage('file.py')).toBeNull();
      expect(detectLanguage('file.go')).toBeNull();
      expect(detectLanguage('file.txt')).toBeNull();
    });
  });

  describe('parseFile', () => {
    it.skipIf(!treeSitterAvailable)('parses TypeScript file', async () => {
      const content = `const x: number = 42;`;
      const { tree, language, parseTimeMs } = await parseFile(content, 'test.ts', 'typescript');
      expect(tree.rootNode.type).toBe('program');
      expect(language).toBe('typescript');
      expect(parseTimeMs).toBeLessThan(1000);
    });

    it.skipIf(!treeSitterAvailable)('parses JavaScript file', async () => {
      const content = `const x = 42;`;
      const { tree, language } = await parseFile(content, 'test.js', 'javascript');
      expect(tree.rootNode.type).toBe('program');
      expect(language).toBe('javascript');
    });

    it.skipIf(!treeSitterAvailable)('caches parse trees', async () => {
      const content = `const x = 1;`;
      const result1 = await parseFile(content, 'cached.ts', 'typescript');
      const result2 = await parseFile(content, 'cached.ts', 'typescript');
      // Second parse should be faster due to caching
      expect(result2.parseTimeMs).toBeLessThanOrEqual(result1.parseTimeMs + 1);
    });

    it.skipIf(!treeSitterAvailable)('invalidates cache on content change', async () => {
      const result1 = await parseFile('const x = 1;', 'changing.ts', 'typescript');
      const result2 = await parseFile('const x = 2;', 'changing.ts', 'typescript');
      // Trees should be different (different root node text)
      expect(result1.tree.rootNode.text).not.toBe(result2.tree.rootNode.text);
    });
  });
});

describe('AST Queries', () => {
  describe('import queries', () => {
    it.skipIf(!treeSitterAvailable)('matches ES import statement', async () => {
      const content = `import _ from 'lodash';`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no lodash');
      expect(rules).not.toBeNull();

      const matches = await runQuery(tree, rules![0].query, 'typescript', rules![0].id);
      expect(matches.length).toBe(1);
      expect(matches[0].line).toBe(1);
    });

    it.skipIf(!treeSitterAvailable)('matches named import', async () => {
      const content = `import { map, filter } from 'lodash';`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no lodash');

      const matches = await runQuery(tree, rules![0].query, 'typescript', rules![0].id);
      expect(matches.length).toBe(1);
    });

    it.skipIf(!treeSitterAvailable)('matches submodule import', async () => {
      const content = `import map from 'lodash/map';`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no lodash');

      const matches = await runQuery(tree, rules![0].query, 'typescript', rules![0].id);
      expect(matches.length).toBe(1);
    });
  });

  describe('any type queries', () => {
    it.skipIf(!treeSitterAvailable)('catches type annotation with any', async () => {
      const content = `function foo(x: any): void {}`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no any');

      const matches = await runQuery(tree, rules![0].query, 'typescript', rules![0].id);
      expect(matches.length).toBe(1);
    });

    it.skipIf(!treeSitterAvailable)('catches any in generics', async () => {
      const content = `const arr: Array<any> = [];`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no any');

      // The second rule is for type arguments
      const matches = await runQuery(tree, rules![1].query, 'typescript', rules![1].id);
      expect(matches.length).toBe(1);
    });

    it.skipIf(!treeSitterAvailable)('catches as any assertion', async () => {
      const content = `const x = value as any;`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no any');

      // The third rule is for as expressions
      const matches = await runQuery(tree, rules![2].query, 'typescript', rules![2].id);
      expect(matches.length).toBe(1);
    });
  });

  describe('console queries', () => {
    it.skipIf(!treeSitterAvailable)('catches console.log call', async () => {
      const content = `console.log('test');`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no console.log');

      const matches = await runQuery(tree, rules![0].query, 'typescript', rules![0].id);
      expect(matches.length).toBe(1);
    });

    it.skipIf(!treeSitterAvailable)('catches console.error when using no console', async () => {
      const content = `console.error('error');`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no console');

      const matches = await runQuery(tree, rules![0].query, 'typescript', rules![0].id);
      expect(matches.length).toBe(1);
    });
  });
});

describe('AST False Positive Prevention', () => {
  describe('comments are ignored', () => {
    it.skipIf(!treeSitterAvailable)('ignores lodash in comments', async () => {
      const content = `// import lodash for comparison\nconst x = 1;`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no lodash');

      const matches = await runQuery(tree, rules![0].query, 'typescript', rules![0].id);
      // AST should NOT match - it's a comment!
      expect(matches.length).toBe(0);
    });

    it.skipIf(!treeSitterAvailable)('ignores any in comments', async () => {
      const content = `// Use any type here for flexibility\nconst x: string = 'test';`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no any');

      let totalMatches = 0;
      for (const rule of rules!) {
        const matches = await runQuery(tree, rule.query, 'typescript', rule.id);
        totalMatches += matches.length;
      }
      expect(totalMatches).toBe(0);
    });

    it.skipIf(!treeSitterAvailable)('ignores console.log in block comments', async () => {
      const content = `/* console.log('debug'); */\nconst x = 1;`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no console.log');

      const matches = await runQuery(tree, rules![0].query, 'typescript', rules![0].id);
      expect(matches.length).toBe(0);
    });
  });

  describe('strings are ignored', () => {
    it.skipIf(!treeSitterAvailable)('ignores lodash in string literals', async () => {
      const content = `const msg = "use lodash for this";`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no lodash');

      const matches = await runQuery(tree, rules![0].query, 'typescript', rules![0].id);
      expect(matches.length).toBe(0);
    });

    it.skipIf(!treeSitterAvailable)('ignores any in string literals', async () => {
      const content = `const msg = "use any type you want";`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no any');

      let totalMatches = 0;
      for (const rule of rules!) {
        const matches = await runQuery(tree, rule.query, 'typescript', rule.id);
        totalMatches += matches.length;
      }
      expect(totalMatches).toBe(0);
    });
  });

  describe('variable names are ignored', () => {
    it.skipIf(!treeSitterAvailable)('ignores anyValue variable name', async () => {
      const content = `const anyValue = 5;\nconst anyType = 'test';`;
      const { tree } = await parseFile(content, 'test.ts', 'typescript');
      const rules = getASTRules('no any');

      let totalMatches = 0;
      for (const rule of rules!) {
        const matches = await runQuery(tree, rule.query, 'typescript', rule.id);
        totalMatches += matches.length;
      }
      expect(totalMatches).toBe(0);
    });
  });
});

describe('Hybrid Checker', () => {
  const makePolicy = (description: string): Policy => ({
    action: 'modify',
    include: ['**/*.ts'],
    exclude: [],
    description,
  });

  it.skipIf(!treeSitterAvailable)('blocks lodash import', async () => {
    const content = `import _ from 'lodash';`;
    const result = await checkContentAST(content, 'test.ts', makePolicy('no lodash'));

    expect(result.allowed).toBe(false);
    expect(result.method).toBe('ast');
    expect(result.match?.line).toBe(1);
    expect(result.match?.reason).toContain('lodash');
  });

  it.skipIf(!treeSitterAvailable)('allows code without lodash', async () => {
    const content = `import React from 'react';`;
    const result = await checkContentAST(content, 'test.ts', makePolicy('no lodash'));

    // Should skip since regex pre-filter doesn't match
    expect(result.allowed).toBe(true);
    expect(result.method).toBe('skipped');
  });

  it.skipIf(!treeSitterAvailable)('blocks any type annotation', async () => {
    const content = `const x: any = 'test';`;
    const result = await checkContentAST(content, 'test.ts', makePolicy('no any'));

    expect(result.allowed).toBe(false);
    expect(result.method).toBe('ast');
  });

  it.skipIf(!treeSitterAvailable)('allows proper TypeScript types', async () => {
    const content = `const x: string = 'test';`;
    const result = await checkContentAST(content, 'test.ts', makePolicy('no any'));

    expect(result.allowed).toBe(true);
  });

  it('skips non-TypeScript files', async () => {
    const content = `import _ from 'lodash';`;
    const result = await checkContentAST(content, 'test.py', makePolicy('no lodash'));

    expect(result.allowed).toBe(true);
    expect(result.method).toBe('skipped');
  });

  it('uses regex-only mode when requested', async () => {
    const content = `import _ from 'lodash';`;
    const result = await checkContentAST(content, 'test.ts', makePolicy('no lodash'), {
      regexOnly: true,
    });

    expect(result.allowed).toBe(true);
    expect(result.method).toBe('skipped');
  });

  it.skipIf(!treeSitterAvailable)('returns timing information', async () => {
    const content = `import _ from 'lodash';`;
    const result = await checkContentAST(content, 'test.ts', makePolicy('no lodash'));

    expect(result.timing).toBeDefined();
    expect(result.timing!.parseMs).toBeGreaterThanOrEqual(0);
    expect(result.timing!.queryMs).toBeGreaterThanOrEqual(0);
  });
});

describe('AST Builtins', () => {
  it('has all expected builtins', () => {
    const builtins = listASTBuiltins();
    expect(builtins).toContain('no lodash');
    expect(builtins).toContain('no moment');
    expect(builtins).toContain('no any');
    expect(builtins).toContain('no any types');
    expect(builtins).toContain('no console.log');
    expect(builtins).toContain('no console');
    expect(builtins).toContain('no eval');
    expect(builtins).toContain('no debugger');
    expect(builtins).toContain('no var');
    expect(builtins).toContain('no innerhtml'); // lowercase key
  });

  it('normalizes restriction variations', () => {
    expect(getASTRules('no lodash')).not.toBeNull();
    expect(getASTRules('NO LODASH')).not.toBeNull(); // Case-insensitive
    expect(getASTRules('  no lodash  ')).not.toBeNull();
    expect(getASTRules('nonexistent rule')).toBeNull();
  });
});

describe('Additional AST Rules', () => {
  const makePolicy = (description: string): Policy => ({
    action: 'modify',
    include: ['**/*.ts', '**/*.tsx'],
    exclude: [],
    description,
  });

  describe('no var', () => {
    it.skipIf(!treeSitterAvailable)('blocks var declarations', async () => {
      const content = `var x = 1;`;
      const result = await checkContentAST(content, 'test.ts', makePolicy('no var'));

      expect(result.allowed).toBe(false);
      expect(result.method).toBe('ast');
      expect(result.match?.reason).toContain('let or const');
    });

    it.skipIf(!treeSitterAvailable)('allows let declarations', async () => {
      const content = `let x = 1;`;
      const result = await checkContentAST(content, 'test.ts', makePolicy('no var'));

      expect(result.allowed).toBe(true);
    });

    it.skipIf(!treeSitterAvailable)('allows const declarations', async () => {
      const content = `const x = 1;`;
      const result = await checkContentAST(content, 'test.ts', makePolicy('no var'));

      expect(result.allowed).toBe(true);
    });

    it.skipIf(!treeSitterAvailable)('ignores var in comments', async () => {
      const content = `// use var for legacy code\nconst x = 1;`;
      const result = await checkContentAST(content, 'test.ts', makePolicy('no var'));

      expect(result.allowed).toBe(true);
    });
  });

  describe('no innerhtml', () => {
    it.skipIf(!treeSitterAvailable)('blocks dangerouslySetInnerHTML in JSX', async () => {
      const content = `<div dangerouslySetInnerHTML={{__html: x}} />`;
      const result = await checkContentAST(content, 'test.tsx', makePolicy('no innerhtml'));

      expect(result.allowed).toBe(false);
      expect(result.method).toBe('ast');
      expect(result.match?.reason).toContain('XSS');
    });

    it.skipIf(!treeSitterAvailable)('blocks innerHTML assignment', async () => {
      const content = `element.innerHTML = '<b>unsafe</b>';`;
      const result = await checkContentAST(content, 'test.ts', makePolicy('no innerhtml'));

      expect(result.allowed).toBe(false);
      expect(result.method).toBe('ast');
    });

    it.skipIf(!treeSitterAvailable)('allows safe JSX', async () => {
      const content = `<div className="safe">{content}</div>`;
      const result = await checkContentAST(content, 'test.tsx', makePolicy('no innerhtml'));

      expect(result.allowed).toBe(true);
    });
  });
});

describe('Performance', () => {
  it('regex pre-filter skips AST for non-matches', async () => {
    const content = `
      import React from 'react';
      import { useState } from 'react';
      
      const Component = () => {
        const [count, setCount] = useState(0);
        return <div>{count}</div>;
      };
    `;
    const policy: Policy = {
      action: 'modify',
      include: ['**/*.tsx'],
      exclude: [],
      description: 'no lodash',
    };

    const result = await checkContentAST(content, 'test.tsx', policy);

    expect(result.allowed).toBe(true);
    expect(result.method).toBe('skipped'); // Skipped because regex didn't match
    expect(result.timing).toBeUndefined(); // No timing because no AST work done
  });

  it.skipIf(!treeSitterAvailable)('parses and queries in reasonable time', async () => {
    // Create a moderately sized file
    const content = `
      import _ from 'lodash';
      ${Array(100).fill("const x = { a: 1, b: 2, c: 3 };").join('\n')}
    `;
    const policy: Policy = {
      action: 'modify',
      include: ['**/*.ts'],
      exclude: [],
      description: 'no lodash',
    };

    const start = performance.now();
    const result = await checkContentAST(content, 'large.ts', policy);
    const elapsed = performance.now() - start;

    expect(result.allowed).toBe(false);
    expect(elapsed).toBeLessThan(500); // Should complete in under 500ms (generous for WASM init)
  });
});
