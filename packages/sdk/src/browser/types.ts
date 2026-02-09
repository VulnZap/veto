/**
 * Type definitions for browser content sanitization.
 *
 * @module browser/types
 */

/**
 * Sanitization mode controls how aggressively content is sanitized.
 *
 * - `strict`: Strip all hidden content, all zero-width chars, all comments, flag suspicious patterns.
 * - `balanced`: Strip hidden content with suspicious patterns, strip zero-width chars, keep benign comments.
 * - `permissive`: Only strip content matching known injection patterns.
 */
export type SanitizationMode = 'strict' | 'balanced' | 'permissive';

/**
 * Category of detected content that may contain prompt injection.
 */
export type DetectionCategory =
  | 'hidden-element'
  | 'zero-width-char'
  | 'html-comment'
  | 'suspicious-pattern';

/**
 * Method used to hide an element from visual rendering.
 */
export type HidingMethod =
  | 'display-none'
  | 'visibility-hidden'
  | 'opacity-zero'
  | 'offscreen-position'
  | 'zero-size'
  | 'clip-hidden'
  | 'text-indent'
  | 'overflow-hidden-zero-size';

/**
 * A single audit entry recording a detection and the action taken.
 */
export interface SanitizationEntry {
  /** Category of the detection */
  category: DetectionCategory;
  /** What action was taken: stripped, flagged, or kept */
  action: 'stripped' | 'flagged' | 'kept';
  /** Description of what was detected */
  description: string;
  /** The content that was detected (truncated if very long) */
  content: string;
  /** Location in the original HTML (character offset) */
  offset: number;
  /** Length of the detected content in the original HTML */
  length: number;
  /** Whether this entry contains suspicious/injection-like content (structured flag for counting) */
  isSuspicious: boolean;
}

/**
 * A hidden element detection result.
 */
export interface HiddenElementMatch {
  /** The full outer HTML of the hidden element */
  outerHtml: string;
  /** The text content inside the hidden element */
  textContent: string;
  /** How the element is hidden */
  hidingMethod: HidingMethod;
  /** Character offset in the source HTML */
  offset: number;
  /** Whether the text content looks like a prompt injection */
  isSuspicious: boolean;
}

/**
 * A zero-width character detection result.
 */
export interface ZeroWidthMatch {
  /** The zero-width character codepoint (e.g. "U+200B") */
  codepoint: string;
  /** Character offset in the source HTML */
  offset: number;
}

/**
 * An HTML comment detection result.
 */
export interface HtmlCommentMatch {
  /** The full comment including delimiters */
  fullMatch: string;
  /** The comment body text */
  body: string;
  /** Character offset in the source HTML */
  offset: number;
  /** Whether the comment body looks like a prompt injection */
  isSuspicious: boolean;
}

/**
 * Full sanitization report with audit trail.
 */
export interface SanitizationReport {
  /** The sanitization mode that was used */
  mode: SanitizationMode;
  /** Timestamp when sanitization was performed */
  timestamp: Date;
  /** Duration of sanitization in milliseconds */
  durationMs: number;
  /** Number of hidden elements detected */
  hiddenElementCount: number;
  /** Number of zero-width characters detected */
  zeroWidthCharCount: number;
  /** Number of HTML comments detected */
  htmlCommentCount: number;
  /** Number of suspicious patterns detected (via structured isSuspicious flags) */
  suspiciousPatternCount: number;
  /** Total items stripped */
  strippedCount: number;
  /** Total items flagged but not stripped */
  flaggedCount: number;
  /** Individual audit entries for each detection */
  entries: SanitizationEntry[];
}

/**
 * Result of sanitizing HTML content.
 */
export interface SanitizationResult {
  /** The sanitized HTML content */
  sanitized: string;
  /** The original HTML content */
  original: string;
  /** Whether any content was modified */
  modified: boolean;
  /** Detailed report of all detections and actions */
  report: SanitizationReport;
}

/**
 * Configuration for the browser content sanitizer.
 */
export interface SanitizerConfig {
  /** Sanitization mode. Defaults to 'strict'. */
  mode?: SanitizationMode;
  /** Maximum content length to process (bytes). Defaults to 5MB. */
  maxContentLength?: number;
  /** Custom suspicious patterns to check in addition to built-in ones. */
  customPatterns?: RegExp[];
  /** Whether to truncate detected content in audit entries. Defaults to true. */
  truncateAuditContent?: boolean;
  /** Maximum length of content field in audit entries. Defaults to 200. */
  maxAuditContentLength?: number;
}
