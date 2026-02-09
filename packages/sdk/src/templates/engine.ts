/**
 * Template application engine.
 *
 * Validates parameters against schema and performs structured
 * substitution into template strings. No eval or unsafe interpolation.
 *
 * @module templates/engine
 */

import type { PolicyTemplate, TemplateParamSchema } from './types.js';

export class TemplateValidationError extends Error {
  constructor(
    public readonly param: string,
    message: string
  ) {
    super(`Parameter "${param}": ${message}`);
    this.name = 'TemplateValidationError';
  }
}

function validateParamValue(
  name: string,
  schema: TemplateParamSchema,
  value: unknown
): void {
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') {
        throw new TemplateValidationError(name, `expected string, got ${typeof value}`);
      }
      break;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new TemplateValidationError(name, `expected number, got ${typeof value}`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new TemplateValidationError(name, `expected boolean, got ${typeof value}`);
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        throw new TemplateValidationError(name, `expected array, got ${typeof value}`);
      }
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item !== schema.items) {
            throw new TemplateValidationError(
              name,
              `item [${i}] expected ${schema.items}, got ${typeof item}`
            );
          }
        }
      }
      break;
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const items = value.map((v) =>
      typeof v === 'string' ? `"${v}"` : String(v)
    );
    return `[${items.join(', ')}]`;
  }
  return String(value);
}

export function validateParams(
  template: PolicyTemplate,
  params: Record<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const schema = template.metadata.params;

  for (const [name, paramSchema] of Object.entries(schema)) {
    const value = params[name] ?? paramSchema.default;

    if (value === undefined) {
      if (paramSchema.required) {
        throw new TemplateValidationError(name, 'required but not provided');
      }
      continue;
    }

    validateParamValue(name, paramSchema, value);
    resolved[name] = value;
  }

  const knownParams = new Set(Object.keys(schema));
  for (const name of Object.keys(params)) {
    if (!knownParams.has(name)) {
      throw new TemplateValidationError(name, 'unknown parameter');
    }
  }

  return resolved;
}

export function applyTemplate(
  template: PolicyTemplate,
  params: Record<string, unknown>
): string {
  const resolved = validateParams(template, params);

  let output = template.template;
  for (const [name, value] of Object.entries(resolved)) {
    const placeholder = `{{${name}}}`;
    output = output.split(placeholder).join(formatValue(value));
  }

  return output;
}
