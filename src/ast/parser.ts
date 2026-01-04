// src/ast/parser.ts
import { Parser, Language, Tree, Query } from 'web-tree-sitter';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export type LanguageType = 'typescript' | 'javascript' | 'tsx' | 'jsx';

export interface ParseResult {
  tree: Tree;
  language: LanguageType;
  parseTimeMs: number;
}

// Re-export types from web-tree-sitter
export type { Language, Tree, Query };

// Module state
let initialized = false;
let initPromise: Promise<void> | null = null;
const languages = new Map<LanguageType, Language>();
const parsers = new Map<LanguageType, Parser>();
const treeCache = new Map<string, { tree: Tree; hash: string }>();

// Language WASM file URLs - these need to be downloaded/bundled
const LANGUAGE_WASM_URLS: Record<LanguageType, string> = {
  typescript: 'https://github.com/AdeAttwood/tree-sitter-typescript-wasm/releases/download/0.23.0/tree-sitter-typescript.wasm',
  tsx: 'https://github.com/AdeAttwood/tree-sitter-typescript-wasm/releases/download/0.23.0/tree-sitter-tsx.wasm',
  javascript: 'https://github.com/AdeAttwood/tree-sitter-javascript-wasm/releases/download/0.21.0/tree-sitter-javascript.wasm',
  jsx: 'https://github.com/AdeAttwood/tree-sitter-javascript-wasm/releases/download/0.21.0/tree-sitter-javascript.wasm',
};

/**
 * Initialize the tree-sitter WASM runtime.
 * Must be called before any parsing operations.
 */
export async function initParser(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await Parser.init();
      initialized = true;
    } catch (error) {
      console.warn('Failed to initialize tree-sitter:', error);
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Check if the parser is initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Load a language from a WASM file
 */
export async function loadLanguage(languageType: LanguageType): Promise<Language> {
  if (languages.has(languageType)) {
    return languages.get(languageType)!;
  }

  await initParser();

  // Check for local WASM file first
  const localWasmPath = getLocalWasmPath(languageType);
  let language: Language;

  if (localWasmPath && fs.existsSync(localWasmPath)) {
    language = await Language.load(localWasmPath);
  } else {
    // Try to fetch from URL (requires network access)
    const url = LANGUAGE_WASM_URLS[languageType];
    try {
      language = await Language.load(url);
    } catch (error) {
      throw new Error(
        `Failed to load language ${languageType}. ` +
        `Please download the WASM file from ${url} to ${localWasmPath || 'the languages directory'}`
      );
    }
  }

  languages.set(languageType, language);
  return language;
}

/**
 * Get local WASM file path if it exists
 */
function getLocalWasmPath(languageType: LanguageType): string | null {
  const wasmFile = `tree-sitter-${languageType === 'jsx' ? 'javascript' : languageType}.wasm`;
  
  // Try multiple locations
  const candidates = [
    // From process.cwd() (most reliable)
    path.resolve(process.cwd(), 'languages', wasmFile),
    // From import.meta.url
    (() => {
      try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        return path.resolve(__dirname, '..', '..', 'languages', wasmFile);
      } catch {
        return null;
      }
    })(),
  ].filter((p): p is string => p !== null);
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  
  return null;
}

/**
 * Get or create a parser for the given language
 */
export async function getParser(languageType: LanguageType): Promise<Parser> {
  if (parsers.has(languageType)) {
    return parsers.get(languageType)!;
  }

  const language = await loadLanguage(languageType);
  const parser = new Parser();
  parser.setLanguage(language);
  parsers.set(languageType, parser);
  return parser;
}

/**
 * Get the language object for query creation
 */
export async function getLanguageObject(languageType: LanguageType): Promise<Language> {
  return loadLanguage(languageType);
}

/**
 * Parse file content into AST
 * Uses caching for performance
 */
export async function parseFile(
  content: string,
  filePath: string,
  languageType: LanguageType
): Promise<ParseResult> {
  const start = performance.now();
  const parser = await getParser(languageType);

  // Check cache
  const hash = hashContent(content);
  const cached = treeCache.get(filePath);

  let tree: Tree;
  if (cached && cached.hash === hash) {
    tree = cached.tree;
  } else {
    // Don't use incremental parsing when content changed - web-tree-sitter
    // has issues with incremental updates from different source text
    const result = parser.parse(content);
    if (!result) {
      throw new Error(`Failed to parse ${filePath}`);
    }
    tree = result;
    treeCache.set(filePath, { tree, hash });
  }

  return {
    tree,
    language: languageType,
    parseTimeMs: performance.now() - start,
  };
}

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): LanguageType | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    default:
      return null;
  }
}

/**
 * Clear the tree cache for a specific file or all files
 */
export function clearTreeCache(filePath?: string): void {
  if (filePath) {
    treeCache.delete(filePath);
  } else {
    treeCache.clear();
  }
}

/**
 * Reset all parser state (for testing)
 */
export function resetParserState(): void {
  treeCache.clear();
  languages.clear();
  parsers.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { parserCount: number; treeCacheSize: number; languageCount: number } {
  return {
    parserCount: parsers.size,
    treeCacheSize: treeCache.size,
    languageCount: languages.size,
  };
}

/**
 * Fast hash function for cache invalidation
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}
