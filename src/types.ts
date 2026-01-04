// src/types.ts

/**
 * Command rule for intercepting specific shell commands.
 * Patterns use glob-style matching:
 * - "npm install" matches exact command
 * - "npm *" matches any npm subcommand
 * - "npm install *" matches npm install with any args
 */
export interface CommandRule {
  /** Glob patterns for commands to block */
  block: string[];
  /** Optional suggestion to show user (e.g., "Use: pnpm install") */
  suggest?: string;
  /** Human-readable reason for the block */
  reason: string;
}

/**
 * AST-based rule for precise code pattern matching.
 * Uses tree-sitter S-expression queries for zero false positives.
 */
export interface ASTRule {
  /** Unique identifier for this rule */
  id: string;
  /** Tree-sitter S-expression query */
  query: string;
  /** Languages this rule applies to */
  languages: ('typescript' | 'javascript')[];
  /** Human-readable reason for blocking */
  reason: string;
  /** Optional suggestion for alternative */
  suggest?: string;
  /** Optional regex for fast pre-filtering (skip AST if no match) */
  regexPreFilter?: string;
}

/**
 * Result of checking content against AST rules
 */
export interface ASTCheckResult {
  allowed: boolean;
  match?: {
    line: number;
    column: number;
    text: string;
    reason: string;
    suggest?: string;
    ruleId: string;
  };
  /** Which method was used for checking */
  method: 'ast' | 'regex' | 'skipped';
  /** Performance timing in milliseconds */
  timing?: {
    parseMs: number;
    queryMs: number;
  };
}

/**
 * Content rule for matching patterns within file contents.
 * Used to prevent banned imports, patterns, or coding styles.
 * NOTE: Legacy regex-based rules - prefer ASTRule for accuracy.
 */
export interface ContentRule {
  /** Regex pattern to match in file content */
  pattern: string;
  /** File patterns where this rule applies (e.g., ["*.ts", "*.js"]) */
  fileTypes: string[];
  /** Human-readable reason for blocking */
  reason: string;
  /** Optional suggestion for alternative */
  suggest?: string;
  /**
   * Validation mode:
   * - 'fast': Direct regex match (default, may have false positives in comments/strings)
   * - 'strict': Strip comments/strings before matching (fewer false positives)
   * - 'semantic': LLM validates match context (slowest, most accurate)
   */
  mode?: 'fast' | 'strict' | 'semantic';
  /**
   * Negative patterns - if ANY of these match, the rule is NOT violated.
   * Used to prevent false positives (e.g., don't flag 'any' in variable names)
   */
  exceptions?: string[];
}

/**
 * Result of checking content against content rules
 */
export interface ContentCheckResult {
  blocked: boolean;
  rule?: ContentRule;
  /** Line number where match was found (1-indexed) */
  line?: number;
  /** The matched text */
  match?: string;
}

export interface Policy {
  action: 'delete' | 'modify' | 'execute' | 'read';
  /** File patterns to protect (glob) */
  include: string[];
  /** File patterns to allow (exceptions) */
  exclude: string[];
  description: string;
  /** Optional command-level rules (Phase 1) */
  commandRules?: CommandRule[];
  /** Optional content-level rules (Phase 2 - regex-based, legacy) */
  contentRules?: ContentRule[];
  /** Optional AST-based rules (Phase 2.1 - preferred, zero false positives) */
  astRules?: ASTRule[];
}

export interface CheckRequest {
  action: string;
  target: string;
  /** Full command string for command-level checking */
  command?: string;
  /** File content for content-level checking */
  content?: string;
}

export interface CheckResponse {
  allowed: boolean;
  reason?: string;
  /** Suggestion if command was blocked */
  suggest?: string;
}

/**
 * Result of checking a command against command rules
 */
export interface CommandCheckResult {
  blocked: boolean;
  rule?: CommandRule;
  matchedPattern?: string;
}

export interface SessionState {
  pid: number;
  agent: string;
  policy: Policy;
  startTime: Date;
  blockedCount: number;
  allowedCount: number;
  blockedActions: Array<{ time: Date; action: string; target: string }>;
}

export interface Config {
  failClosed: boolean;
  fallbackToBuiltins: boolean;
  warnBroadPatterns: boolean;
  maxSnapshotFiles: number;
  maxMemoryCacheSize: number;
  auditLog: boolean;
  verbose: boolean;
}

export const DEFAULT_CONFIG: Config = {
  failClosed: true,
  fallbackToBuiltins: true,
  warnBroadPatterns: true,
  maxSnapshotFiles: 10000,
  maxMemoryCacheSize: 100 * 1024,
  auditLog: false,
  verbose: false,
};
