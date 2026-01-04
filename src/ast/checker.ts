// src/ast/checker.ts
import type { ASTRule, ASTCheckResult, Policy } from '../types.js';
import { parseFile, detectLanguage, type LanguageType } from './parser.js';
import { checkASTRules, type ASTMatch } from './query.js';
import { getASTRules } from './builtins.js';

export interface ASTCheckOptions {
  /** Skip AST check and use regex fallback only */
  regexOnly?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Check content against a policy using AST when available.
 * Falls back to regex for non-supported languages or when AST rules aren't available.
 */
export async function checkContentAST(
  content: string,
  filePath: string,
  policy: Policy,
  options: ASTCheckOptions = {}
): Promise<ASTCheckResult> {
  const languageType = detectLanguage(filePath);

  // If not a supported language or regex-only mode, skip AST
  if (!languageType || options.regexOnly) {
    return { allowed: true, method: 'skipped' };
  }

  // Collect all AST rules from policy
  const astRules = collectASTRules(policy);

  if (astRules.length === 0) {
    return { allowed: true, method: 'skipped' };
  }

  // Check if any regex pre-filter matches
  const potentialRules = astRules.filter((rule) => {
    if (!rule.regexPreFilter) return true;
    return content.includes(rule.regexPreFilter);
  });

  if (potentialRules.length === 0) {
    // Fast exit - no regex pre-filters matched
    return { allowed: true, method: 'skipped' };
  }

  try {
    // Parse file (cached)
    const parseStart = performance.now();
    const { tree } = await parseFile(content, filePath, languageType);
    const parseMs = performance.now() - parseStart;

    // Run AST queries
    const queryStart = performance.now();
    const match = await checkASTRules(content, tree, languageType, potentialRules);
    const queryMs = performance.now() - queryStart;

    if (match) {
      // Find the rule that matched
      const matchedRule = potentialRules.find((r) => r.id === match.ruleId);

      return {
        allowed: false,
        match: {
          line: match.line,
          column: match.column,
          text: match.text,
          reason: matchedRule?.reason || 'AST rule violation',
          suggest: matchedRule?.suggest,
          ruleId: match.ruleId,
        },
        method: 'ast',
        timing: { parseMs, queryMs },
      };
    }

    return {
      allowed: true,
      method: 'ast',
      timing: { parseMs, queryMs },
    };
  } catch (error) {
    // If AST parsing fails, skip (don't block)
    if (options.debug) {
      console.warn('AST check failed:', error);
    }
    return { allowed: true, method: 'skipped' };
  }
}

/**
 * Collect AST rules from a policy.
 * Looks for explicit astRules first, then falls back to builtins based on description.
 */
function collectASTRules(policy: Policy): ASTRule[] {
  // If policy has explicit AST rules, use them
  if (policy.astRules && policy.astRules.length > 0) {
    return policy.astRules;
  }

  // Try to find builtin AST rules based on policy description
  const builtinRules = getASTRules(policy.description);
  if (builtinRules) {
    return builtinRules;
  }

  return [];
}

/**
 * Check content against multiple policies using AST
 */
export async function checkContentASTMultiple(
  content: string,
  filePath: string,
  policies: Policy[],
  options: ASTCheckOptions = {}
): Promise<ASTCheckResult> {
  for (const policy of policies) {
    const result = await checkContentAST(content, filePath, policy, options);
    if (!result.allowed) {
      return result;
    }
  }
  return { allowed: true, method: 'skipped' };
}
