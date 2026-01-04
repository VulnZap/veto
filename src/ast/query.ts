// src/ast/query.ts
import type { ASTRule } from '../types.js';
import { getLanguageObject, type LanguageType, type Tree, type Query } from './parser.js';

export interface ASTMatch {
  /** Named captures from the query */
  captures: Map<string, { text: string; line: number; column: number }>;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matched text (truncated for display) */
  text: string;
  /** The rule that matched */
  ruleId: string;
}

// Query cache - parsed queries are expensive, reuse them
const queryCache = new Map<string, Query>();

/**
 * Get cache key for a query + language combination
 */
function getQueryCacheKey(queryString: string, languageType: LanguageType): string {
  return `${languageType}:${queryString}`;
}

/**
 * Get or create a compiled query
 * Handles both old (new Query(lang, source)) and new (lang.query(source)) API
 */
export async function getQuery(queryString: string, languageType: LanguageType): Promise<Query> {
  const cacheKey = getQueryCacheKey(queryString, languageType);
  if (!queryCache.has(cacheKey)) {
    const language = await getLanguageObject(languageType);
    let query: Query;
    
    // Try new API first (language.query())
    if (typeof (language as any).query === 'function') {
      query = (language as any).query(queryString);
    } else {
      // Fall back to old API (new Query(language, source))
      // Need to dynamically import Query constructor
      const TreeSitter: any = await import('web-tree-sitter');
      const QueryClass = TreeSitter.Query || TreeSitter.default?.Query;
      if (QueryClass) {
        query = new QueryClass(language, queryString);
      } else {
        throw new Error('Cannot find Query constructor in web-tree-sitter');
      }
    }
    
    queryCache.set(cacheKey, query);
  }
  return queryCache.get(cacheKey)!;
}

/**
 * Run an AST query against a parse tree
 */
export async function runQuery(
  tree: Tree,
  queryString: string,
  languageType: LanguageType,
  ruleId: string
): Promise<ASTMatch[]> {
  const query = await getQuery(queryString, languageType);
  const matches: ASTMatch[] = [];

  for (const match of query.matches(tree.rootNode as any)) {
    const captures = new Map<string, { text: string; line: number; column: number }>();
    for (const capture of match.captures) {
      captures.set(capture.name, {
        text: capture.node.text,
        line: capture.node.startPosition.row + 1,
        column: capture.node.startPosition.column + 1,
      });
    }

    // Use first capture as primary match location
    const primaryCapture = match.captures[0];
    if (!primaryCapture) continue;

    const primaryNode = primaryCapture.node;

    matches.push({
      captures,
      line: primaryNode.startPosition.row + 1,
      column: primaryNode.startPosition.column + 1,
      text: primaryNode.text.slice(0, 100), // Truncate for display
      ruleId,
    });
  }

  return matches;
}

/**
 * Check content against an AST rule
 * Returns null if allowed, or match details if blocked
 */
export async function checkASTRule(
  content: string,
  tree: Tree,
  languageType: LanguageType,
  rule: ASTRule
): Promise<ASTMatch | null> {
  // Fast pre-filter: skip AST query if regex doesn't match
  if (rule.regexPreFilter) {
    if (!content.includes(rule.regexPreFilter)) {
      return null; // Fast exit - content doesn't contain the pattern
    }
  }

  // Check if rule applies to this language
  const normalizedLanguage = languageType === 'tsx' ? 'typescript' : languageType === 'jsx' ? 'javascript' : languageType;
  if (!rule.languages.includes(normalizedLanguage)) {
    return null; // Rule doesn't apply to this language
  }

  // Run AST query
  const matches = await runQuery(tree, rule.query, languageType, rule.id);

  if (matches.length === 0) {
    return null; // Allowed
  }

  return matches[0]; // Return first match
}

/**
 * Check content against multiple AST rules
 * Returns the first match found, or null if all pass
 */
export async function checkASTRules(
  content: string,
  tree: Tree,
  languageType: LanguageType,
  rules: ASTRule[]
): Promise<ASTMatch | null> {
  for (const rule of rules) {
    const match = await checkASTRule(content, tree, languageType, rule);
    if (match) {
      return match;
    }
  }
  return null;
}

/**
 * Clear the query cache
 */
export function clearQueryCache(): void {
  queryCache.clear();
}

/**
 * Get query cache statistics
 */
export function getQueryCacheStats(): { size: number } {
  return { size: queryCache.size };
}
