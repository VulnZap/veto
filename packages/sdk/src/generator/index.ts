/**
 * Natural language policy generator module.
 *
 * Generates valid typed policies from plain-English descriptions
 * using LLM providers. Output is always schema-validated and
 * deterministically normalized before persistence.
 *
 * @module generator
 */

export * from './types.js';
export { parseIntent } from './intent-parser.js';
export { synthesizePolicy } from './policy-synthesizer.js';
export { generateTestCases } from './test-generator.js';
export { validatePolicy } from './validator.js';
export { normalizePolicy } from './normalizer.js';
export { serializePolicy, serializeTestCases } from './serializer.js';
export { generate } from './generate.js';
