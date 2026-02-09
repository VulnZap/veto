/**
 * CLI commands for the policy template library.
 *
 * @module cli/template-commands
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { listTemplates, getTemplate, applyTemplate, TemplateValidationError } from '../templates/index.js';

function parseParamValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== '') return num;
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((s) => {
        const trimmed = s.trim().replace(/^["']|["']$/g, '');
        const n = Number(trimmed);
        return !Number.isNaN(n) && trimmed !== '' ? n : trimmed;
      });
  }
  return raw;
}

export function templateList(): void {
  const templates = listTemplates();

  if (templates.length === 0) {
    console.log('No templates available.');
    return;
  }

  console.log('');
  console.log('Available policy templates:');
  console.log('');

  const maxId = Math.max(...templates.map((t) => t.id.length));
  const maxCat = Math.max(...templates.map((t) => t.category.length));

  for (const t of templates) {
    const id = t.id.padEnd(maxId);
    const cat = t.category.padEnd(maxCat);
    console.log(`  ${id}  ${cat}  ${t.description}`);
  }

  console.log('');
  console.log('Run "veto template show <id>" for details.');
  console.log('');
}

export function templateShow(id: string): void {
  const template = getTemplate(id);

  if (!template) {
    console.error(`Template not found: ${id}`);
    console.error('Run "veto template list" to see available templates.');
    process.exit(1);
  }

  const m = template.metadata;

  console.log('');
  console.log(`${m.name} (${m.id})`);
  console.log(`  ${m.description}`);
  console.log('');
  console.log(`  Category:    ${m.category}`);
  console.log(`  Complexity:  ${m.complexity}`);
  console.log(`  Tags:        ${m.tags.join(', ')}`);
  console.log('');
  console.log('  Parameters:');

  for (const [name, schema] of Object.entries(m.params)) {
    const req = schema.required ? ' (required)' : '';
    const def = schema.default !== undefined ? ` [default: ${JSON.stringify(schema.default)}]` : '';
    const typeStr = schema.type === 'array' && schema.items ? `${schema.items}[]` : schema.type;
    console.log(`    ${name}: ${typeStr}${req}${def}`);
    console.log(`      ${schema.description}`);
  }

  console.log('');
  console.log('  Example:');
  const exampleParts = Object.entries(m.params)
    .filter(([_, s]) => s.required)
    .map(([name]) => `--param ${name}=<value>`);
  console.log(`    veto template apply ${m.id} ${exampleParts.join(' ')}`);
  console.log('');
}

export function templateApply(
  id: string,
  rawParams: Record<string, string>,
  outputPath?: string
): void {
  const template = getTemplate(id);

  if (!template) {
    console.error(`Template not found: ${id}`);
    console.error('Run "veto template list" to see available templates.');
    process.exit(1);
  }

  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    params[key] = parseParamValue(value);
  }

  let output: string;
  try {
    output = applyTemplate(template, params);
  } catch (err) {
    if (err instanceof TemplateValidationError) {
      console.error(`Validation error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  if (outputPath) {
    const resolved = resolve(outputPath);
    const dir = join(resolved, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(resolved, output, 'utf-8');
    console.log(`Policy written to ${resolved}`);
  } else {
    console.log(output);
  }
}
