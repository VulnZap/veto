import { describe, it, expect } from 'vitest';
import { compile, typeCheck } from '../../src/compiler/index.js';
import type { ToolInputSchema } from '../../src/types/tool.js';

const schema: ToolInputSchema = {
  type: 'object',
  properties: {
    amount: { type: 'number', description: 'Amount' },
    currency: { type: 'string', description: 'Currency code' },
    items: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of items',
    },
    user: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
    },
  },
};

describe('TypeChecker', () => {
  it('should validate a valid expression', () => {
    const ast = compile('amount > 1000');
    const result = typeCheck(ast, schema);
    expect(result.valid).toBe(true);
    expect(result.inferredType).toBe('boolean');
  });

  it('should warn on unknown property', () => {
    const ast = compile('nonexistent > 5');
    const result = typeCheck(ast, schema);
    expect(result.issues.some((i) => i.message.includes('not found'))).toBe(true);
  });

  it('should infer string type for string comparison', () => {
    const ast = compile('currency == "USD"');
    const result = typeCheck(ast, schema);
    expect(result.valid).toBe(true);
    expect(result.inferredType).toBe('boolean');
  });

  it('should infer number type for arithmetic', () => {
    const ast = compile('amount + 5');
    const result = typeCheck(ast, schema);
    expect(result.inferredType).toBe('number');
  });

  it('should handle nested path types', () => {
    const ast = compile('user.name == "alice"');
    const result = typeCheck(ast, schema);
    expect(result.valid).toBe(true);
    expect(result.inferredType).toBe('boolean');
  });

  it('should error on indexing non-array', () => {
    const ast = compile('currency[0]');
    const result = typeCheck(ast, schema);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('non-array'))).toBe(true);
  });

  it('should error on unknown function', () => {
    const ast = compile('bogus(amount)');
    const result = typeCheck(ast, schema);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('Unknown function'))).toBe(true);
  });

  it('should validate function return types', () => {
    const ast = compile('len(items) > 5');
    const result = typeCheck(ast, schema);
    expect(result.valid).toBe(true);
    expect(result.inferredType).toBe('boolean');
  });

  it('should pass with no schema', () => {
    const ast = compile('x > 5');
    const result = typeCheck(ast);
    expect(result.valid).toBe(true);
    expect(result.inferredType).toBe('boolean');
  });

  it('should check matches requires strings', () => {
    const ast = compile('amount matches "^[0-9]+"');
    const result = typeCheck(ast, schema);
    expect(result.issues.some((i) => i.message.includes('matches'))).toBe(true);
  });

  it('should infer string for string concatenation', () => {
    const ast = compile('currency + "_suffix"');
    const result = typeCheck(ast, schema);
    expect(result.inferredType).toBe('string');
  });
});
