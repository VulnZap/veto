// src/ast/index.ts
// Re-export all AST module functionality

export {
  parseFile,
  detectLanguage,
  getParser,
  getLanguageObject,
  clearTreeCache,
  resetParserState,
  getCacheStats,
  initParser,
  isInitialized,
  loadLanguage,
  type LanguageType,
  type ParseResult,
  type Language,
  type Tree,
  type Query,
} from './parser.js';

export {
  runQuery,
  checkASTRule,
  checkASTRules,
  getQuery,
  clearQueryCache,
  getQueryCacheStats,
  type ASTMatch,
} from './query.js';

export {
  AST_BUILTINS,
  getASTRules,
  listASTBuiltins,
} from './builtins.js';

export {
  checkContentAST,
  checkContentASTMultiple,
  type ASTCheckOptions,
} from './checker.js';
