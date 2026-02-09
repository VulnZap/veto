import type { ValidationResult } from '../types/config.js';

export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'type'
  | 'select'
  | 'scroll'
  | 'screenshot'
  | 'download'
  | 'upload'
  | 'extract'
  | 'search'
  | 'input'
  | 'done'
  | 'wait'
  | 'evaluate';

export interface BrowserAction {
  type: BrowserActionType;
  params: Record<string, unknown>;
}

export interface NavigationAction extends BrowserAction {
  type: 'navigate';
  params: {
    url: string;
    waitUntil?: string;
  };
}

export interface ClickAction extends BrowserAction {
  type: 'click';
  params: {
    selector: string;
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
  };
}

export interface InputAction extends BrowserAction {
  type: 'fill' | 'type';
  params: {
    selector: string;
    value: string;
  };
}

export interface DownloadAction extends BrowserAction {
  type: 'download';
  params: {
    url: string;
    path?: string;
  };
}

export interface ScrollAction extends BrowserAction {
  type: 'scroll';
  params: {
    direction?: 'up' | 'down' | 'left' | 'right';
    amount?: number;
    selector?: string;
  };
}

export interface ExtractAction extends BrowserAction {
  type: 'extract';
  params: {
    selector?: string;
    attribute?: string;
  };
}

export interface BrowserAdapterConfig {
  mode?: 'strict' | 'log';
  onAllow?: (action: BrowserAction) => void | Promise<void>;
  onDeny?: (action: BrowserAction, reason: string) => void | Promise<void>;
}

export interface BrowserValidationResult {
  allowed: boolean;
  action: BrowserAction;
  validationResult: ValidationResult;
}
