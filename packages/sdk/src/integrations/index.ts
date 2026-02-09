export type {
  BrowserAgentAdapter,
} from './adapter.js';

export {
  BaseBrowserAdapter,
  BrowserActionDeniedError,
} from './adapter.js';

export type {
  BrowserAction,
  BrowserActionType,
  BrowserAdapterConfig,
  BrowserValidationResult,
  NavigationAction,
  ClickAction,
  InputAction,
  DownloadAction,
  ScrollAction,
  ExtractAction,
} from './types.js';

export {
  BrowserUseAdapter,
  wrapBrowserUse,
  type BrowserUseConfig,
} from './browser-use.js';

export {
  PlaywrightAdapter,
  wrapPlaywright,
  wrapPage as wrapPlaywrightPage,
  type PlaywrightPage,
} from './playwright.js';

export {
  PuppeteerAdapter,
  wrapPuppeteer,
  wrapPage as wrapPuppeteerPage,
  type PuppeteerPage,
} from './puppeteer.js';
