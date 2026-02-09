/**
 * Policy template library.
 *
 * @module templates
 */

export type {
  TemplateCategory,
  TemplateComplexity,
  TemplateParamSchema,
  TemplateMetadata,
  PolicyTemplate,
} from './types.js';

export {
  listTemplates,
  getTemplate,
  listByCategory,
  getTemplateIds,
} from './registry.js';

export {
  applyTemplate,
  validateParams,
  TemplateValidationError,
} from './engine.js';
