/**
 * Browser content sanitizer for prompt injection defense.
 *
 * Detects and removes hidden DOM content, zero-width characters,
 * HTML comments, and suspicious patterns that may contain prompt
 * injection payloads in browser-extracted content.
 *
 * @module browser/sanitizer
 */

import type {
  SanitizationMode,
  SanitizationResult,
  SanitizationReport,
  SanitizationEntry,
  SanitizerConfig,
  HiddenElementMatch,
  ZeroWidthMatch,
  HtmlCommentMatch,
  HidingMethod,
} from './types.js';

const DEFAULT_MAX_CONTENT_LENGTH = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_AUDIT_CONTENT_LENGTH = 200;

/**
 * Zero-width and invisible Unicode characters commonly used to hide content.
 */
const ZERO_WIDTH_CHARS: ReadonlyMap<number, string> = new Map([
  [0x200b, 'ZERO WIDTH SPACE'],
  [0x200c, 'ZERO WIDTH NON-JOINER'],
  [0x200d, 'ZERO WIDTH JOINER'],
  [0x200e, 'LEFT-TO-RIGHT MARK'],
  [0x200f, 'RIGHT-TO-LEFT MARK'],
  [0x2060, 'WORD JOINER'],
  [0x2061, 'FUNCTION APPLICATION'],
  [0x2062, 'INVISIBLE TIMES'],
  [0x2063, 'INVISIBLE SEPARATOR'],
  [0x2064, 'INVISIBLE PLUS'],
  [0xfeff, 'ZERO WIDTH NO-BREAK SPACE (BOM)'],
  [0x00ad, 'SOFT HYPHEN'],
  [0x034f, 'COMBINING GRAPHEME JOINER'],
  [0x061c, 'ARABIC LETTER MARK'],
  [0x180e, 'MONGOLIAN VOWEL SEPARATOR'],
]);

/**
 * Regex matching zero-width and invisible Unicode characters.
 * Built dynamically from the codepoint map to avoid lint warnings
 * about joined/combined character sequences in character classes.
 */
const ZERO_WIDTH_REGEX = new RegExp(
  '[' + [...ZERO_WIDTH_CHARS.keys()].map((cp) => `\\u{${cp.toString(16)}}`).join('') + ']',
  'gu',
);

/**
 * Regex matching HTML comments, including multi-line.
 */
const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;

/**
 * Patterns in inline styles that indicate a hidden element.
 * Each entry maps a HidingMethod to the regex that detects it.
 */
const HIDDEN_STYLE_PATTERNS: ReadonlyArray<{ method: HidingMethod; pattern: RegExp }> = [
  { method: 'display-none', pattern: /display\s*:\s*none/i },
  { method: 'visibility-hidden', pattern: /visibility\s*:\s*hidden/i },
  { method: 'opacity-zero', pattern: /opacity\s*:\s*0(?:[;\s"']|$)/i },
  { method: 'offscreen-position', pattern: /position\s*:\s*(?:absolute|fixed)[^"]*(?:left|top|right|bottom)\s*:\s*-\d{4,}/i },
  { method: 'zero-size', pattern: /(?:width|height)\s*:\s*0(?:px)?\s*[;\s"']/i },
  { method: 'clip-hidden', pattern: /clip\s*:\s*rect\s*\(\s*0/i },
  { method: 'text-indent', pattern: /text-indent\s*:\s*-\d{4,}/i },
];

/**
 * Patterns that indicate text is likely a prompt injection attempt.
 * These look for instruction-like language commonly used in injections.
 */
const SUSPICIOUS_TEXT_PATTERNS: readonly RegExp[] = [
  /(?:you\s+(?:are|must|should|will|shall)\s+(?:now|always|never|ignore|forget|disregard))/i,
  /(?:ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?|context))/i,
  /(?:forget\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?|context))/i,
  /(?:disregard\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?|context))/i,
  /(?:new\s+(?:instructions?|rules?|prompt)\s*:)/i,
  /(?:system\s*(?:prompt|message|instruction)\s*:)/i,
  /(?:you\s+are\s+(?:a|an)\s+(?:new|different)\s+(?:ai|assistant|model|agent))/i,
  /(?:act\s+as\s+(?:if|though)\s+you)/i,
  /(?:pretend\s+(?:you\s+are|to\s+be|that))/i,
  /(?:override\s+(?:your|all|the)\s+(?:rules?|instructions?|constraints?|policies?))/i,
  /(?:do\s+not\s+(?:follow|obey|listen|adhere))/i,
  /(?:jailbreak|prompt\s*inject|bypass\s+(?:safety|security|filter))/i,
  /(?:\[SYSTEM\]|\[INST\]|\[\/INST\]|<\|(?:system|user|assistant)\|>)/i,
  /(?:BEGIN\s+(?:HIDDEN|SECRET|SYSTEM)\s+(?:INSTRUCTIONS?|PROMPT|MESSAGE))/i,
];

/**
 * Regex matching HTML elements with inline style attributes.
 * Captures the full tag, style attribute value, inner content, and tag name.
 */
const STYLED_ELEMENT_REGEX = /<(\w+)\s[^>]*?style\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/\1>/gi;

/**
 * Regex matching elements with aria-hidden="true".
 */
const ARIA_HIDDEN_REGEX = /<(\w+)\s[^>]*?aria-hidden\s*=\s*"true"[^>]*>([\s\S]*?)<\/\1>/gi;

/**
 * Regex matching elements with the hidden attribute.
 */
const HIDDEN_ATTR_REGEX = /<(\w+)\s[^>]*?\bhidden\b[^>]*>([\s\S]*?)<\/\1>/gi;

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function codepoint(char: string): string {
  const cp = char.codePointAt(0);
  if (cp === undefined) return 'U+????';
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Browser content sanitizer.
 *
 * Detects hidden elements, zero-width characters, HTML comments,
 * and suspicious patterns in HTML content extracted from browsers.
 * Produces an auditable report of all detections and actions taken.
 */
export class BrowserSanitizer {
  private readonly mode: SanitizationMode;
  private readonly maxContentLength: number;
  private readonly customPatterns: RegExp[];
  private readonly truncateAudit: boolean;
  private readonly maxAuditLen: number;

  constructor(config: SanitizerConfig = {}) {
    this.mode = config.mode ?? 'strict';
    this.maxContentLength = config.maxContentLength ?? DEFAULT_MAX_CONTENT_LENGTH;
    this.customPatterns = config.customPatterns ?? [];
    this.truncateAudit = config.truncateAuditContent ?? true;
    this.maxAuditLen = config.maxAuditContentLength ?? DEFAULT_MAX_AUDIT_CONTENT_LENGTH;
  }

  /**
   * Sanitize HTML content, removing or flagging hidden and suspicious content.
   */
  sanitize(html: string): SanitizationResult {
    const start = performance.now();

    if (html.length > this.maxContentLength) {
      html = html.slice(0, this.maxContentLength);
    }

    const entries: SanitizationEntry[] = [];
    let output = html;

    // Phase 1: Detect and handle hidden elements
    const hiddenMatches = this.detectHiddenElements(html);
    for (const match of hiddenMatches) {
      const action = this.resolveHiddenAction(match);
      entries.push({
        category: 'hidden-element',
        action,
        description: `Hidden element (${match.hidingMethod})${match.isSuspicious ? ' with suspicious content' : ''}`,
        content: this.auditContent(match.textContent),
        offset: match.offset,
        length: match.outerHtml.length,
      });
      if (action === 'stripped') {
        output = output.replace(match.outerHtml, '');
      }
    }

    // Phase 2: Detect and handle HTML comments
    const commentMatches = this.detectHtmlComments(html);
    for (const match of commentMatches) {
      const action = this.resolveCommentAction(match);
      entries.push({
        category: 'html-comment',
        action,
        description: `HTML comment${match.isSuspicious ? ' with suspicious content' : ''}`,
        content: this.auditContent(match.body),
        offset: match.offset,
        length: match.fullMatch.length,
      });
      if (action === 'stripped') {
        output = output.replace(match.fullMatch, '');
      }
    }

    // Phase 3: Detect and handle zero-width characters
    const zwMatches = this.detectZeroWidthChars(html);
    for (const match of zwMatches) {
      const action = this.resolveZeroWidthAction();
      const name = ZERO_WIDTH_CHARS.get(match.codepoint.codePointAt(0) ?? 0) ?? match.codepoint;
      entries.push({
        category: 'zero-width-char',
        action,
        description: `Zero-width character ${codepoint(match.codepoint)} (${name})`,
        content: codepoint(match.codepoint),
        offset: match.offset,
        length: 1,
      });
    }
    if (zwMatches.length > 0 && this.resolveZeroWidthAction() === 'stripped') {
      output = output.replace(ZERO_WIDTH_REGEX, '');
    }

    // Phase 4: Detect suspicious patterns in visible text
    const suspiciousInVisible = this.detectSuspiciousPatterns(output);
    for (const sp of suspiciousInVisible) {
      entries.push({
        category: 'suspicious-pattern',
        action: 'flagged',
        description: `Suspicious instruction-like text in visible content`,
        content: this.auditContent(sp.match),
        offset: sp.offset,
        length: sp.match.length,
      });
    }

    const durationMs = performance.now() - start;

    const report: SanitizationReport = {
      mode: this.mode,
      timestamp: new Date(),
      durationMs: Math.round(durationMs * 100) / 100,
      hiddenElementCount: hiddenMatches.length,
      zeroWidthCharCount: zwMatches.length,
      htmlCommentCount: commentMatches.length,
      suspiciousPatternCount: suspiciousInVisible.length + entries.filter(
        (e) => e.category === 'hidden-element' && e.description.includes('suspicious')
      ).length,
      strippedCount: entries.filter((e) => e.action === 'stripped').length,
      flaggedCount: entries.filter((e) => e.action === 'flagged').length,
      entries,
    };

    return {
      sanitized: output,
      original: html,
      modified: output !== html,
      report,
    };
  }

  /**
   * Detect HTML elements that are visually hidden via inline styles or attributes.
   */
  detectHiddenElements(html: string): HiddenElementMatch[] {
    const matches: HiddenElementMatch[] = [];
    const seen = new Set<string>();

    // Check inline style-based hiding
    let m: RegExpExecArray | null;
    const styledRe = new RegExp(STYLED_ELEMENT_REGEX.source, STYLED_ELEMENT_REGEX.flags);
    while ((m = styledRe.exec(html)) !== null) {
      const [outerHtml, , styleValue, innerHTML] = m;
      for (const { method, pattern } of HIDDEN_STYLE_PATTERNS) {
        if (pattern.test(styleValue)) {
          const key = `${m.index}:${outerHtml.length}`;
          if (!seen.has(key)) {
            seen.add(key);
            const textContent = stripHtmlTags(innerHTML);
            matches.push({
              outerHtml,
              textContent,
              hidingMethod: method,
              offset: m.index,
              isSuspicious: this.textIsSuspicious(textContent),
            });
          }
          break;
        }
      }
    }

    // Check aria-hidden="true"
    const ariaRe = new RegExp(ARIA_HIDDEN_REGEX.source, ARIA_HIDDEN_REGEX.flags);
    while ((m = ariaRe.exec(html)) !== null) {
      const [outerHtml, , innerHTML] = m;
      const key = `${m.index}:${outerHtml.length}`;
      if (!seen.has(key)) {
        seen.add(key);
        const textContent = stripHtmlTags(innerHTML);
        matches.push({
          outerHtml,
          textContent,
          hidingMethod: 'display-none',
          offset: m.index,
          isSuspicious: this.textIsSuspicious(textContent),
        });
      }
    }

    // Check hidden attribute
    const hiddenRe = new RegExp(HIDDEN_ATTR_REGEX.source, HIDDEN_ATTR_REGEX.flags);
    while ((m = hiddenRe.exec(html)) !== null) {
      const [outerHtml, , innerHTML] = m;
      const key = `${m.index}:${outerHtml.length}`;
      if (!seen.has(key)) {
        seen.add(key);
        const textContent = stripHtmlTags(innerHTML);
        matches.push({
          outerHtml,
          textContent,
          hidingMethod: 'display-none',
          offset: m.index,
          isSuspicious: this.textIsSuspicious(textContent),
        });
      }
    }

    return matches;
  }

  /**
   * Detect zero-width and invisible Unicode characters.
   */
  detectZeroWidthChars(html: string): ZeroWidthMatch[] {
    const matches: ZeroWidthMatch[] = [];
    const re = new RegExp(ZERO_WIDTH_REGEX.source, ZERO_WIDTH_REGEX.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      matches.push({
        codepoint: m[0],
        offset: m.index,
      });
    }
    return matches;
  }

  /**
   * Detect HTML comments.
   */
  detectHtmlComments(html: string): HtmlCommentMatch[] {
    const matches: HtmlCommentMatch[] = [];
    const re = new RegExp(HTML_COMMENT_REGEX.source, HTML_COMMENT_REGEX.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const body = m[0].slice(4, -3).trim();
      matches.push({
        fullMatch: m[0],
        body,
        offset: m.index,
        isSuspicious: this.textIsSuspicious(body),
      });
    }
    return matches;
  }

  /**
   * Detect suspicious instruction-like patterns in text.
   */
  detectSuspiciousPatterns(text: string): Array<{ match: string; offset: number; pattern: RegExp }> {
    const results: Array<{ match: string; offset: number; pattern: RegExp }> = [];
    const allPatterns = [...SUSPICIOUS_TEXT_PATTERNS, ...this.customPatterns];
    for (const pattern of allPatterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        results.push({
          match: m[0],
          offset: m.index,
          pattern,
        });
      }
    }
    return results;
  }

  private textIsSuspicious(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    const allPatterns = [...SUSPICIOUS_TEXT_PATTERNS, ...this.customPatterns];
    return allPatterns.some((p) => p.test(text));
  }

  private resolveHiddenAction(match: HiddenElementMatch): 'stripped' | 'flagged' | 'kept' {
    switch (this.mode) {
      case 'strict':
        return 'stripped';
      case 'balanced':
        return match.isSuspicious ? 'stripped' : 'flagged';
      case 'permissive':
        return match.isSuspicious ? 'stripped' : 'kept';
    }
  }

  private resolveCommentAction(match: HtmlCommentMatch): 'stripped' | 'flagged' | 'kept' {
    switch (this.mode) {
      case 'strict':
        return 'stripped';
      case 'balanced':
        return match.isSuspicious ? 'stripped' : 'kept';
      case 'permissive':
        return match.isSuspicious ? 'stripped' : 'kept';
    }
  }

  private resolveZeroWidthAction(): 'stripped' | 'flagged' | 'kept' {
    switch (this.mode) {
      case 'strict':
        return 'stripped';
      case 'balanced':
        return 'stripped';
      case 'permissive':
        return 'flagged';
    }
  }

  private auditContent(content: string): string {
    if (!this.truncateAudit) return content;
    return truncate(content, this.maxAuditLen);
  }
}

/**
 * Create a sanitizer with the given mode and default settings.
 */
export function createSanitizer(mode: SanitizationMode = 'strict'): BrowserSanitizer {
  return new BrowserSanitizer({ mode });
}
