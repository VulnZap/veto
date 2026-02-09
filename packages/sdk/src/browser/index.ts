/**
 * Browser content sanitization for prompt injection defense.
 *
 * @module browser
 */

export { BrowserSanitizer, createSanitizer } from './sanitizer.js';
export type {
  SanitizationMode,
  SanitizationResult,
  SanitizationReport,
  SanitizationEntry,
  SanitizerConfig,
  HiddenElementMatch,
  ZeroWidthMatch,
  HtmlCommentMatch,
  HidingMethod,
  DetectionCategory,
} from './types.js';
