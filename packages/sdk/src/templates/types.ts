/**
 * Type definitions for the policy template library.
 *
 * @module templates/types
 */

export type TemplateCategory =
  | 'communication'
  | 'filesystem'
  | 'network'
  | 'data-protection'
  | 'execution';

export type TemplateComplexity = 'basic' | 'intermediate' | 'advanced';

export interface TemplateParamSchema {
  type: 'string' | 'number' | 'boolean' | 'array';
  items?: 'string' | 'number';
  description: string;
  default?: unknown;
  required?: boolean;
}

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  complexity: TemplateComplexity;
  params: Record<string, TemplateParamSchema>;
  tags: string[];
}

export interface PolicyTemplate {
  metadata: TemplateMetadata;
  template: string;
}
