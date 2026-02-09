/**
 * Policy template registry.
 *
 * Central registry of all built-in policy templates with lookup
 * and discovery methods.
 *
 * @module templates/registry
 */

import type { PolicyTemplate, TemplateCategory, TemplateMetadata } from './types.js';
import emailSafety from './definitions/email-safety.js';
import fileAccess from './definitions/file-access.js';
import apiRateLimit from './definitions/api-rate-limit.js';
import dataClassification from './definitions/data-classification.js';
import browserNavigation from './definitions/browser-navigation.js';
import codeExecution from './definitions/code-execution.js';

const ALL_TEMPLATES: PolicyTemplate[] = [
  emailSafety,
  fileAccess,
  apiRateLimit,
  dataClassification,
  browserNavigation,
  codeExecution,
];

const BY_ID = new Map<string, PolicyTemplate>(
  ALL_TEMPLATES.map((t) => [t.metadata.id, t])
);

export function listTemplates(): TemplateMetadata[] {
  return ALL_TEMPLATES.map((t) => t.metadata);
}

export function getTemplate(id: string): PolicyTemplate | undefined {
  return BY_ID.get(id);
}

export function listByCategory(category: TemplateCategory): TemplateMetadata[] {
  return ALL_TEMPLATES
    .filter((t) => t.metadata.category === category)
    .map((t) => t.metadata);
}

export function getTemplateIds(): string[] {
  return ALL_TEMPLATES.map((t) => t.metadata.id);
}
