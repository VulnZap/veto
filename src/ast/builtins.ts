// src/ast/builtins.ts
import type { ASTRule } from '../types.js';

/**
 * Pre-compiled AST queries for common restrictions.
 * These replace regex-based content rules with precise structural queries.
 *
 * Key advantages over regex:
 * - Zero false positives (AST ignores comments and strings)
 * - Catches all variants (destructuring, bracket notation, dynamic imports)
 * - Can express structural constraints regex cannot
 *
 * Query syntax: tree-sitter S-expressions
 * - (node_type) matches any node of that type
 * - (node_type field: (child)) matches with specific field
 * - @name captures the node
 * - (#eq? @name "value") exact string match on node text
 * - (#match? @name "regex") regex match on node text
 */
export const AST_BUILTINS: Record<string, ASTRule[]> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORT RESTRICTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  'no lodash': [
    {
      id: 'no-lodash-import',
      // Matches: import _ from 'lodash', import { map } from 'lodash', import 'lodash/map'
      query: `(import_statement source: (string) @source (#match? @source "lodash"))`,
      languages: ['typescript', 'javascript'],
      reason: 'Use native Array/Object methods instead of lodash',
      suggest: 'Use Array.map(), filter(), reduce(), Object.keys(), etc.',
      regexPreFilter: 'lodash',
    },
    {
      id: 'no-lodash-require',
      // Matches: require('lodash'), require('lodash/map')
      query: `
        (call_expression
          function: (identifier) @fn (#eq? @fn "require")
          arguments: (arguments (string) @source (#match? @source "lodash")))
      `,
      languages: ['typescript', 'javascript'],
      reason: 'Use native Array/Object methods instead of lodash',
      regexPreFilter: 'lodash',
    },
    {
      id: 'no-lodash-dynamic-import',
      // Matches: import('lodash'), import('lodash/map')
      query: `
        (call_expression
          function: (import)
          arguments: (arguments (string) @source (#match? @source "lodash")))
      `,
      languages: ['typescript', 'javascript'],
      reason: 'Dynamic import of lodash detected',
      regexPreFilter: 'lodash',
    },
  ],

  'no moment': [
    {
      id: 'no-moment-import',
      query: `(import_statement source: (string) @source (#match? @source "^['\"]moment['\"]$"))`,
      languages: ['typescript', 'javascript'],
      reason: 'moment.js is deprecated and heavy (330KB+)',
      suggest: 'Use date-fns, dayjs, or native Date/Intl APIs',
      regexPreFilter: 'moment',
    },
    {
      id: 'no-moment-require',
      query: `
        (call_expression
          function: (identifier) @fn (#eq? @fn "require")
          arguments: (arguments (string) @source (#match? @source "^['\"]moment['\"]$")))
      `,
      languages: ['typescript', 'javascript'],
      reason: 'moment.js is deprecated and heavy',
      regexPreFilter: 'moment',
    },
  ],

  'no jquery': [
    {
      id: 'no-jquery-import',
      query: `(import_statement source: (string) @source (#match? @source "jquery"))`,
      languages: ['typescript', 'javascript'],
      reason: 'jQuery is unnecessary in modern browsers',
      suggest: 'Use native DOM APIs: querySelector, fetch, classList',
      regexPreFilter: 'jquery',
    },
  ],

  'no axios': [
    {
      id: 'no-axios-import',
      query: `(import_statement source: (string) @source (#match? @source "^['\"]axios"))`,
      languages: ['typescript', 'javascript'],
      reason: 'Use native fetch API instead of axios',
      suggest: 'Use fetch() with optional wrapper for convenience',
      regexPreFilter: 'axios',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPESCRIPT STRICTNESS
  // ═══════════════════════════════════════════════════════════════════════════

  'no any': [
    {
      id: 'no-any-type-annotation',
      // Matches: x: any, (): any, function(): any
      query: `(type_annotation (predefined_type) @type (#eq? @type "any"))`,
      languages: ['typescript'],
      reason: 'Use proper TypeScript types instead of any',
      suggest: 'Use unknown, specific types, or generics',
      regexPreFilter: 'any',
    },
    {
      id: 'no-any-type-argument',
      // Matches: Array<any>, Map<string, any>, Promise<any>
      query: `(type_arguments (predefined_type) @type (#eq? @type "any"))`,
      languages: ['typescript'],
      reason: 'Avoid any in generic type arguments',
      suggest: 'Use specific types: Array<string>, Map<string, User>',
      regexPreFilter: 'any',
    },
    {
      id: 'no-as-any',
      // Matches: value as any, (x as any)
      query: `(as_expression (predefined_type) @type (#eq? @type "any"))`,
      languages: ['typescript'],
      reason: 'Avoid type assertions to any',
      suggest: 'Use proper type narrowing or as unknown',
      regexPreFilter: 'as any',
    },
  ],

  'no any types': [
    // All 'no any' rules plus type alias
    {
      id: 'no-any-type-annotation',
      query: `(type_annotation (predefined_type) @type (#eq? @type "any"))`,
      languages: ['typescript'],
      reason: 'Use proper TypeScript types instead of any',
      suggest: 'Use unknown, specific types, or generics',
      regexPreFilter: 'any',
    },
    {
      id: 'no-any-type-argument',
      query: `(type_arguments (predefined_type) @type (#eq? @type "any"))`,
      languages: ['typescript'],
      reason: 'Avoid any in generic type arguments',
      suggest: 'Use specific types: Array<string>, Map<string, User>',
      regexPreFilter: 'any',
    },
    {
      id: 'no-as-any',
      query: `(as_expression (predefined_type) @type (#eq? @type "any"))`,
      languages: ['typescript'],
      reason: 'Avoid type assertions to any',
      suggest: 'Use proper type narrowing or as unknown',
      regexPreFilter: 'as any',
    },
    {
      id: 'no-any-type-alias',
      // Matches: type Foo = any
      query: `(type_alias_declaration value: (predefined_type) @type (#eq? @type "any"))`,
      languages: ['typescript'],
      reason: 'Avoid type aliases to any',
      regexPreFilter: 'any',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSOLE RESTRICTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  'no console.log': [
    {
      id: 'no-console-log-call',
      // Matches: console.log(...)
      query: `
        (call_expression
          function: (member_expression
            object: (identifier) @obj (#eq? @obj "console")
            property: (property_identifier) @prop (#eq? @prop "log")))
      `,
      languages: ['typescript', 'javascript'],
      reason: 'Use proper logging instead of console.log',
      suggest: 'Use a logging library like pino or winston',
      regexPreFilter: 'console',
    },
    {
      id: 'no-console-log-bracket',
      // Matches: console["log"](...)
      query: `
        (call_expression
          function: (subscript_expression
            object: (identifier) @obj (#eq? @obj "console")
            index: (string) @idx (#match? @idx "log")))
      `,
      languages: ['typescript', 'javascript'],
      reason: 'Console accessed via bracket notation',
      regexPreFilter: 'console',
    },
  ],

  'no console': [
    {
      id: 'no-console-any-method',
      // Matches: console.log(...), console.error(...), console.warn(...), etc.
      query: `
        (call_expression
          function: (member_expression
            object: (identifier) @obj (#eq? @obj "console")))
      `,
      languages: ['typescript', 'javascript'],
      reason: 'Use proper logging instead of console methods',
      suggest: 'Use a logging library like pino or winston',
      regexPreFilter: 'console',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // REACT PATTERNS
  // ═══════════════════════════════════════════════════════════════════════════

  'no react': [
    {
      id: 'no-react-import',
      // Matches: import React from 'react', import { useState } from 'react'
      query: `(import_statement source: (string) @source (#match? @source "^['\"]react['\"]$"))`,
      languages: ['typescript', 'javascript'],
      reason: 'React is not allowed in this project',
      suggest: 'Use vanilla JS, Vue, Svelte, or another framework',
      regexPreFilter: 'react',
    },
    {
      id: 'no-react-dom-import',
      // Matches: import ReactDOM from 'react-dom'
      query: `(import_statement source: (string) @source (#match? @source "react-dom"))`,
      languages: ['typescript', 'javascript'],
      reason: 'React DOM is not allowed',
      regexPreFilter: 'react-dom',
    },
    {
      id: 'no-react-require',
      // Matches: require('react')
      query: `
        (call_expression
          function: (identifier) @fn (#eq? @fn "require")
          arguments: (arguments (string) @source (#match? @source "^['\"]react")))
      `,
      languages: ['typescript', 'javascript'],
      reason: 'React require() is not allowed',
      regexPreFilter: 'require',
    },
    {
      id: 'no-jsx-element',
      // Matches: <Component>, <div>, etc. (opening tags)
      query: `(jsx_element) @jsx`,
      languages: ['typescript', 'javascript'],
      reason: 'JSX syntax is not allowed (React is banned)',
      suggest: 'Use vanilla DOM APIs or another framework',
      regexPreFilter: '<',
    },
    {
      id: 'no-jsx-self-closing',
      // Matches: <Component />, <input />, etc.
      query: `(jsx_self_closing_element) @jsx`,
      languages: ['typescript', 'javascript'],
      reason: 'JSX syntax is not allowed (React is banned)',
      regexPreFilter: '/>',
    },
    {
      id: 'no-jsx-fragment',
      // Matches: <>, </>
      query: `(jsx_fragment) @jsx`,
      languages: ['typescript', 'javascript'],
      reason: 'JSX fragments are not allowed (React is banned)',
      regexPreFilter: '<>',
    },
  ],

  // Aliases for 'no react'
  'react is not allowed': [
    {
      id: 'no-react-import',
      query: `(import_statement source: (string) @source (#match? @source "^['\"]react['\"]$"))`,
      languages: ['typescript', 'javascript'],
      reason: 'React is not allowed in this project',
      suggest: 'Use vanilla JS, Vue, Svelte, or another framework',
      regexPreFilter: 'react',
    },
    {
      id: 'no-jsx-element',
      query: `(jsx_element) @jsx`,
      languages: ['typescript', 'javascript'],
      reason: 'JSX syntax is not allowed (React is banned)',
      regexPreFilter: '<',
    },
    {
      id: 'no-jsx-self-closing',
      query: `(jsx_self_closing_element) @jsx`,
      languages: ['typescript', 'javascript'],
      reason: 'JSX syntax is not allowed (React is banned)',
      regexPreFilter: '/>',
    },
  ],

  'no class components': [
    {
      id: 'no-react-class-extends',
      // Matches: class Foo extends React.Component
      query: `
        (class_declaration
          (class_heritage
            (extends_clause
              value: (member_expression
                object: (identifier) @react (#eq? @react "React")
                property: (property_identifier) @comp (#match? @comp "^(Pure)?Component$")))))
      `,
      languages: ['typescript', 'javascript'],
      reason: 'Use functional components with hooks instead of class components',
      suggest: 'Convert to: const Component = () => { ... }',
      regexPreFilter: 'extends',
    },
    {
      id: 'no-class-extends-component',
      // Matches: class Foo extends Component (imported)
      query: `
        (class_declaration
          (class_heritage
            (extends_clause
              value: (identifier) @comp (#match? @comp "^(Pure)?Component$"))))
      `,
      languages: ['typescript', 'javascript'],
      reason: 'Use functional components with hooks',
      regexPreFilter: 'extends',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY PATTERNS
  // ═══════════════════════════════════════════════════════════════════════════

  'no eval': [
    {
      id: 'no-eval-call',
      // Matches: eval(...)
      query: `(call_expression function: (identifier) @fn (#eq? @fn "eval"))`,
      languages: ['typescript', 'javascript'],
      reason: 'eval() is a security risk and performance problem',
      suggest: 'Use JSON.parse() for data, or refactor to avoid dynamic code',
      regexPreFilter: 'eval',
    },
    {
      id: 'no-function-constructor',
      // Matches: new Function(...)
      query: `(new_expression constructor: (identifier) @fn (#eq? @fn "Function"))`,
      languages: ['typescript', 'javascript'],
      reason: 'new Function() is equivalent to eval()',
      suggest: 'Use regular functions or arrow functions',
      regexPreFilter: 'Function',
    },
  ],

  'no innerhtml': [
    {
      id: 'no-innerhtml-assignment',
      // Matches: el.innerHTML = ...
      query: `
        (assignment_expression
          left: (member_expression
            property: (property_identifier) @prop (#eq? @prop "innerHTML")))
      `,
      languages: ['typescript', 'javascript'],
      reason: 'innerHTML is an XSS risk',
      suggest: 'Use textContent, or sanitize with DOMPurify',
      regexPreFilter: 'innerHTML',
    },
    {
      id: 'no-dangerously-set-innerHTML',
      // Matches: dangerouslySetInnerHTML={...}
      query: `(jsx_attribute (property_identifier) @prop (#eq? @prop "dangerouslySetInnerHTML"))`,
      languages: ['typescript', 'javascript'],
      reason: 'dangerouslySetInnerHTML is an XSS risk',
      suggest: 'Use proper React rendering or sanitize content',
      regexPreFilter: 'dangerouslySetInnerHTML',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // CODE QUALITY
  // ═══════════════════════════════════════════════════════════════════════════

  'no debugger': [
    {
      id: 'no-debugger-statement',
      query: `(debugger_statement) @stmt`,
      languages: ['typescript', 'javascript'],
      reason: 'Remove debugger statements before committing',
      regexPreFilter: 'debugger',
    },
  ],

  'no var': [
    {
      id: 'no-var-declaration',
      // Matches: var x = ...
      // Note: tree-sitter uses 'variable_declaration' exclusively for var,
      // while let/const use 'lexical_declaration'. No predicate needed.
      query: `(variable_declaration) @decl`,
      languages: ['typescript', 'javascript'],
      reason: 'Use let or const instead of var',
      suggest: 'Replace var with let (mutable) or const (immutable)',
      regexPreFilter: 'var',
    },
  ],

  'no alert': [
    {
      id: 'no-alert-call',
      query: `(call_expression function: (identifier) @fn (#eq? @fn "alert"))`,
      languages: ['typescript', 'javascript'],
      reason: 'alert() blocks the UI thread',
      suggest: 'Use a proper notification system or modal',
      regexPreFilter: 'alert',
    },
  ],
};

/**
 * Get all AST rules for a restriction
 * Normalizes common variations (e.g., "no any" vs "no any types")
 */
export function getASTRules(restriction: string): ASTRule[] | null {
  const normalized = restriction.toLowerCase().trim();

  // Direct match
  if (AST_BUILTINS[normalized]) {
    return AST_BUILTINS[normalized];
  }

  // Try variations
  const variations = [
    normalized,
    normalized.replace(/^don't /, 'no '),
    normalized.replace(/^do not /, 'no '),
    normalized.replace(/^avoid /, 'no '),
    normalized.replace(/^ban /, 'no '),
    normalized.replace(/^block /, 'no '),
    normalized.replace(/^disallow /, 'no '),
    normalized.replace(/^never use /, 'no '),
  ];

  for (const variant of variations) {
    if (AST_BUILTINS[variant]) {
      return AST_BUILTINS[variant];
    }
  }

  // Special handling for library restrictions
  // "React is not allowed", "react is banned", "don't use react", etc. → 'no react'
  const libraryPatterns = [
    { match: /\breact\b/i, key: 'no react' },
    { match: /\blodash\b/i, key: 'no lodash' },
    { match: /\bmoment\b/i, key: 'no moment' },
    { match: /\bjquery\b/i, key: 'no jquery' },
    { match: /\baxios\b/i, key: 'no axios' },
    { match: /\bconsole\.log\b/i, key: 'no console.log' },
    { match: /\bany\s*type/i, key: 'no any types' },
  ];

  // Check if this looks like a restriction (contains negative keywords)
  const isRestriction = /\b(no|don't|do not|avoid|ban|block|disallow|never|not allowed|banned|forbidden|prohibited)\b/i.test(normalized);

  if (isRestriction) {
    for (const { match, key } of libraryPatterns) {
      if (match.test(normalized) && AST_BUILTINS[key]) {
        return AST_BUILTINS[key];
      }
    }
  }

  return null;
}

/**
 * List all available AST builtin keys
 */
export function listASTBuiltins(): string[] {
  return Object.keys(AST_BUILTINS);
}
