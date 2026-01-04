// src/compiler/content.ts
// Content pattern matching for Phase 2 content-aware enforcement
//
// DESIGN PRINCIPLES:
// 1. Builtins are comprehensive pattern SETS, not single regex
// 2. Each pattern has exceptions to prevent false positives
// 3. 'strict' mode strips comments/strings before matching
// 4. LLM generates per-user rules for custom restrictions

import micromatch from 'micromatch';
import type { ContentRule, ContentCheckResult, Policy } from '../types.js';

const { isMatch } = micromatch;

/**
 * Result of checking content with detailed match info
 */
export interface ContentMatch {
  file: string;
  line: number;
  column: number;
  match: string;
  rule: ContentRule;
}

/**
 * Strip single-line and multi-line comments from code.
 * Preserves line numbers by replacing with spaces.
 */
export function stripComments(content: string): string {
  // State machine to handle strings and comments
  let result = '';
  let i = 0;
  let inString: string | null = null;
  let inTemplate = false;
  let templateDepth = 0;

  while (i < content.length) {
    const char = content[i];
    const next = content[i + 1];
    const prev = i > 0 ? content[i - 1] : '';

    // Handle escape sequences in strings
    if (inString && char === '\\') {
      result += char + (next || '');
      i += 2;
      continue;
    }

    // Handle string boundaries
    if (!inString && !inTemplate && (char === '"' || char === "'" || char === '`')) {
      if (char === '`') {
        inTemplate = true;
        templateDepth = 1;
      } else {
        inString = char;
      }
      result += char;
      i++;
      continue;
    }

    if (inString && char === inString) {
      inString = null;
      result += char;
      i++;
      continue;
    }

    // Handle template literal nesting
    if (inTemplate) {
      if (char === '`' && prev !== '\\') {
        templateDepth--;
        if (templateDepth === 0) {
          inTemplate = false;
        }
      } else if (char === '$' && next === '{') {
        // Entering expression, but still in template
      }
      result += char;
      i++;
      continue;
    }

    // Skip if inside a string
    if (inString) {
      result += char;
      i++;
      continue;
    }

    // Handle single-line comments
    if (char === '/' && next === '/') {
      // Replace comment with spaces until newline
      while (i < content.length && content[i] !== '\n') {
        result += ' ';
        i++;
      }
      continue;
    }

    // Handle multi-line comments
    if (char === '/' && next === '*') {
      result += '  '; // Replace /*
      i += 2;
      while (i < content.length) {
        if (content[i] === '*' && content[i + 1] === '/') {
          result += '  '; // Replace */
          i += 2;
          break;
        }
        // Preserve newlines for line number accuracy
        result += content[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Strip string literals from code, replacing with placeholder.
 * Preserves line numbers.
 */
export function stripStrings(content: string): string {
  let result = '';
  let i = 0;
  let inString: string | null = null;

  while (i < content.length) {
    const char = content[i];
    const next = content[i + 1];

    // Handle escape sequences
    if (inString && char === '\\') {
      result += '  '; // Replace escaped char
      i += 2;
      continue;
    }

    // String boundaries
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = char;
      result += char;
      i++;
      continue;
    }

    if (inString && char === inString) {
      inString = null;
      result += char;
      i++;
      continue;
    }

    // Inside string - replace with space but preserve newlines
    if (inString) {
      result += char === '\n' ? '\n' : ' ';
      i++;
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Check if a file path matches any of the file type patterns.
 */
export function fileMatchesPatterns(
  filePath: string,
  patterns: string[]
): boolean {
  if (!patterns || patterns.length === 0) {
    return true;
  }

  const normalized = filePath.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() || normalized;

  for (const pattern of patterns) {
    if (pattern.startsWith('*.') && !pattern.includes('/')) {
      if (basename.endsWith(pattern.slice(1))) {
        return true;
      }
      continue;
    }

    if (isMatch(normalized, pattern, { nocase: true }) ||
        isMatch(basename, pattern, { nocase: true })) {
      return true;
    }
  }

  return false;
}

/**
 * Check if match is an exception (false positive).
 */
function isException(
  content: string,
  matchIndex: number,
  matchText: string,
  exceptions: string[]
): boolean {
  if (!exceptions || exceptions.length === 0) {
    return false;
  }

  // Get context around match (100 chars before and after)
  const start = Math.max(0, matchIndex - 100);
  const end = Math.min(content.length, matchIndex + matchText.length + 100);
  const context = content.slice(start, end);

  for (const exception of exceptions) {
    try {
      const exceptionRegex = new RegExp(exception);
      if (exceptionRegex.test(context)) {
        return true;
      }
    } catch {
      // Invalid regex, skip
    }
  }

  return false;
}

/**
 * Check content against a single content rule.
 */
export function checkContentRule(
  content: string,
  filePath: string,
  rule: ContentRule
): ContentMatch | null {
  if (!fileMatchesPatterns(filePath, rule.fileTypes)) {
    return null;
  }

  // Apply mode-specific preprocessing
  let processedContent = content;
  const mode = rule.mode || 'fast';

  if (mode === 'strict') {
    processedContent = stripComments(content);
    processedContent = stripStrings(processedContent);
  }

  let regex: RegExp;
  try {
    regex = new RegExp(rule.pattern, 'gm');
  } catch {
    return null;
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(processedContent)) !== null) {
    // Check exceptions
    if (isException(content, match.index, match[0], rule.exceptions || [])) {
      continue;
    }

    // Find line and column using original content positions
    const beforeMatch = content.slice(0, match.index);
    const lines = beforeMatch.split('\n');
    const line = lines.length;
    const column = (lines[lines.length - 1]?.length ?? 0) + 1;

    return {
      file: filePath,
      line,
      column,
      match: match[0],
      rule,
    };
  }

  return null;
}

/**
 * Check content against all content rules in a policy.
 */
export function checkContent(
  content: string,
  filePath: string,
  policy: Policy
): ContentCheckResult {
  if (!policy.contentRules || policy.contentRules.length === 0) {
    return { blocked: false };
  }

  for (const rule of policy.contentRules) {
    const match = checkContentRule(content, filePath, rule);
    if (match) {
      return {
        blocked: true,
        rule,
        line: match.line,
        match: match.match,
      };
    }
  }

  return { blocked: false };
}

/**
 * Check content against multiple policies.
 */
export function checkContentAgainstPolicies(
  content: string,
  filePath: string,
  policies: Policy[]
): ContentCheckResult & { policy?: Policy } {
  for (const policy of policies) {
    const result = checkContent(content, filePath, policy);
    if (result.blocked) {
      return { ...result, policy };
    }
  }
  return { blocked: false };
}

/**
 * Get all matches for a rule in content.
 */
export function findAllMatches(
  content: string,
  filePath: string,
  rule: ContentRule
): ContentMatch[] {
  if (!fileMatchesPatterns(filePath, rule.fileTypes)) {
    return [];
  }

  let processedContent = content;
  if (rule.mode === 'strict') {
    processedContent = stripComments(content);
    processedContent = stripStrings(processedContent);
  }

  let regex: RegExp;
  try {
    regex = new RegExp(rule.pattern, 'gm');
  } catch {
    return [];
  }

  const matches: ContentMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(processedContent)) !== null) {
    if (isException(content, match.index, match[0], rule.exceptions || [])) {
      continue;
    }

    const beforeMatch = content.slice(0, match.index);
    const lines = beforeMatch.split('\n');
    const line = lines.length;
    const column = (lines[lines.length - 1]?.length ?? 0) + 1;

    matches.push({
      file: filePath,
      line,
      column,
      match: match[0],
      rule,
    });
  }

  return matches;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE PATTERN SETS
// Each restriction type has MULTIPLE patterns to catch all variants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pattern set for detecting lodash usage.
 * Covers: ES imports, CommonJS, dynamic imports, submodules, individual packages
 */
export const LODASH_PATTERNS = {
  // ES6 imports
  esDefault: String.raw`import\s+\w+\s+from\s+['"]lodash['"]`,
  esNamed: String.raw`import\s+\{[^}]+\}\s+from\s+['"]lodash['"]`,
  esNamespace: String.raw`import\s+\*\s+as\s+\w+\s+from\s+['"]lodash['"]`,
  esSubmodule: String.raw`import\s+\w+\s+from\s+['"]lodash\/[^'"]+['"]`,
  // Individual lodash packages (lodash.map, lodash.filter, etc.)
  esIndividual: String.raw`import\s+\w+\s+from\s+['"]lodash\.[a-z]+['"]`,
  // lodash-es variant
  esLodashEs: String.raw`import\s+.*\s+from\s+['"]lodash-es['"]`,
  // CommonJS
  cjsRequire: String.raw`require\s*\(\s*['"]lodash['"]\s*\)`,
  cjsSubmodule: String.raw`require\s*\(\s*['"]lodash\/[^'"]+['"]\s*\)`,
  cjsIndividual: String.raw`require\s*\(\s*['"]lodash\.[a-z]+['"]\s*\)`,
  // Dynamic import
  dynamicImport: String.raw`import\s*\(\s*['"]lodash`,
  // Combined pattern (use this for simple matching)
  any: String.raw`(?:import|require)\s*(?:\(|\s).*['"]lodash(?:[-./][^'"]*)?['"]`,
};

/**
 * Pattern set for detecting TypeScript 'any' type usage.
 * Covers: annotations, generics, assertions, type aliases, defaults
 */
export const ANY_TYPE_PATTERNS = {
  // Type annotations
  annotation: String.raw`:\s*any\s*(?:[,;)\]=]|$)`,
  annotationArray: String.raw`:\s*any\s*\[\s*\]`,
  // Generic parameters
  genericParam: String.raw`<\s*any\s*>`,
  genericInArray: String.raw`Array\s*<\s*any\s*>`,
  genericInRecord: String.raw`Record\s*<[^>]*,\s*any\s*>`,
  genericInPromise: String.raw`Promise\s*<\s*any\s*>`,
  genericInMap: String.raw`Map\s*<[^>]*,?\s*any\s*>`,
  genericInSet: String.raw`Set\s*<\s*any\s*>`,
  // Type assertions
  asAny: String.raw`as\s+any\s*(?:[,;)\]]|$)`,
  asUnknownAsAny: String.raw`as\s+unknown\s+as\s+any`,
  // Type definitions
  typeAlias: String.raw`type\s+\w+\s*=\s*any\s*;`,
  typeAliasPartial: String.raw`type\s+\w+\s*=\s*[^;]*\|\s*any`,
  // Generic defaults
  genericDefault: String.raw`<[^>]*=\s*any\s*>`,
  // Function return types
  returnAny: String.raw`\)\s*:\s*any\s*(?:\{|=>)`,
  // Extends/implements
  extendsAny: String.raw`extends\s+any\b`,
  // Intersection/union
  intersectionAny: String.raw`&\s*any\b`,
  unionAny: String.raw`\|\s*any\b`,
  // Combined (most common cases)
  common: String.raw`(?::\s*any\s*(?:[,;)\]=]|$)|<\s*any\s*>|as\s+any\b)`,
};

/**
 * Pattern set for detecting console usage.
 * Covers: direct calls, destructuring, aliasing, bracket notation
 */
export const CONSOLE_PATTERNS = {
  // Direct method calls
  log: String.raw`\bconsole\s*\.\s*log\s*\(`,
  warn: String.raw`\bconsole\s*\.\s*warn\s*\(`,
  error: String.raw`\bconsole\s*\.\s*error\s*\(`,
  info: String.raw`\bconsole\s*\.\s*info\s*\(`,
  debug: String.raw`\bconsole\s*\.\s*debug\s*\(`,
  trace: String.raw`\bconsole\s*\.\s*trace\s*\(`,
  table: String.raw`\bconsole\s*\.\s*table\s*\(`,
  dir: String.raw`\bconsole\s*\.\s*dir\s*\(`,
  // Bracket notation
  bracket: String.raw`\bconsole\s*\[\s*['"](?:log|warn|error|info|debug)['"]\s*\]`,
  // Destructuring (const { log } = console)
  destructure: String.raw`\{\s*(?:log|warn|error|info|debug)(?:\s*:\s*\w+)?\s*\}\s*=\s*console`,
  // Aliasing (const l = console.log)
  alias: String.raw`=\s*console\s*\.\s*(?:log|warn|error|info|debug)\s*[,;]`,
  // Combined common patterns
  anyMethod: String.raw`\bconsole\s*[.\[]\s*['"]?(?:log|warn|error|info|debug|trace|table|dir)`,
};

/**
 * Pattern set for detecting React class components.
 * Covers: Component, PureComponent, with/without React prefix
 */
export const CLASS_COMPONENT_PATTERNS = {
  component: String.raw`class\s+\w+\s+extends\s+(?:React\s*\.\s*)?Component\s*(?:<|{)`,
  pureComponent: String.raw`class\s+\w+\s+extends\s+(?:React\s*\.\s*)?PureComponent\s*(?:<|{)`,
  // Combined
  any: String.raw`class\s+\w+\s+extends\s+(?:React\s*\.\s*)?(?:Pure)?Component\s*(?:<|{)`,
};

/**
 * Pattern set for detecting eval usage.
 * Covers: direct eval, Function constructor, setTimeout/setInterval with strings
 */
export const EVAL_PATTERNS = {
  direct: String.raw`\beval\s*\(`,
  functionConstructor: String.raw`new\s+Function\s*\(`,
  setTimeoutString: String.raw`setTimeout\s*\(\s*['"]`,
  setIntervalString: String.raw`setInterval\s*\(\s*['"]`,
  // Combined
  any: String.raw`(?:\beval\s*\(|new\s+Function\s*\()`,
};

/**
 * Pattern set for moment.js detection.
 */
export const MOMENT_PATTERNS = {
  esImport: String.raw`import\s+.*\s+from\s+['"]moment['"]`,
  cjsRequire: String.raw`require\s*\(\s*['"]moment['"]\s*\)`,
  dynamicImport: String.raw`import\s*\(\s*['"]moment['"]`,
  any: String.raw`(?:import|require)\s*(?:\(|\s).*['"]moment['"]`,
};

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY EXPORTS (for backwards compatibility)
// ═══════════════════════════════════════════════════════════════════════════

export const COMMON_PATTERNS = {
  // Import patterns - USE LODASH_PATTERNS.any for comprehensive matching
  lodashImport: LODASH_PATTERNS.esDefault,
  lodashRequire: LODASH_PATTERNS.cjsRequire,
  anyLodash: LODASH_PATTERNS.any,

  // Console patterns - USE CONSOLE_PATTERNS.anyMethod for comprehensive matching
  consoleLog: CONSOLE_PATTERNS.log,
  consoleWarn: CONSOLE_PATTERNS.warn,
  consoleError: CONSOLE_PATTERNS.error,
  anyConsole: CONSOLE_PATTERNS.anyMethod,

  // React patterns
  classComponent: CLASS_COMPONENT_PATTERNS.any,
  reactClass: CLASS_COMPONENT_PATTERNS.any,

  // TypeScript patterns - USE ANY_TYPE_PATTERNS.common for comprehensive matching
  anyType: ANY_TYPE_PATTERNS.annotation,
  anyTypeGeneric: ANY_TYPE_PATTERNS.genericParam,
  asAny: ANY_TYPE_PATTERNS.asAny,

  // Deprecated patterns
  momentImport: MOMENT_PATTERNS.any,
  jqueryImport: String.raw`(?:import|require)\s*(?:\(|\s).*['"]jquery['"]`,
  underscoreImport: String.raw`(?:import|require)\s*(?:\(|\s).*['"]underscore['"]`,

  // Security patterns
  eval: EVAL_PATTERNS.any,
  innerHtml: String.raw`\.innerHTML\s*=`,
  dangerouslySetInnerHTML: String.raw`dangerouslySetInnerHTML`,

  // Code quality
  todoComment: String.raw`//\s*TODO:?`,
  fixmeComment: String.raw`//\s*FIXME:?`,
  debugger: String.raw`\bdebugger\b`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// EXCEPTION PATTERNS (to prevent false positives)
// ═══════════════════════════════════════════════════════════════════════════

export const EXCEPTION_PATTERNS = {
  // Don't flag 'any' in variable names like 'anyValue', 'company', 'many'
  anyInVariableName: String.raw`(?:const|let|var|function)\s+\w*any\w*`,
  // Don't flag console in test files (handled by fileTypes, but backup)
  consoleInTest: String.raw`(?:describe|it|test|expect)\s*\(`,
  // Don't flag lodash in comments about migration
  lodashMigration: String.raw`(?:migrat|replac|remov|deprecat).*lodash`,
};
