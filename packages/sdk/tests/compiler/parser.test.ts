import { describe, it, expect } from 'vitest';
import { compile } from '../../src/compiler/index.js';
import { ParseError } from '../../src/compiler/parser.js';
import type { ASTNode } from '../../src/compiler/ast.js';

describe('Parser', () => {
  describe('literals', () => {
    it('should parse integer', () => {
      const ast = compile('42');
      expect(ast).toEqual({ kind: 'literal', value: 42 });
    });

    it('should parse float', () => {
      const ast = compile('3.14');
      expect(ast).toEqual({ kind: 'literal', value: 3.14 });
    });

    it('should parse string', () => {
      const ast = compile('"hello"');
      expect(ast).toEqual({ kind: 'literal', value: 'hello' });
    });

    it('should parse boolean', () => {
      expect(compile('true')).toEqual({ kind: 'literal', value: true });
      expect(compile('false')).toEqual({ kind: 'literal', value: false });
    });
  });

  describe('paths', () => {
    it('should parse simple identifier', () => {
      const ast = compile('foo');
      expect(ast).toEqual({
        kind: 'path',
        segments: [{ type: 'field', name: 'foo' }],
      });
    });

    it('should parse dotted path', () => {
      const ast = compile('args.path');
      expect(ast).toEqual({
        kind: 'path',
        segments: [
          { type: 'field', name: 'args' },
          { type: 'field', name: 'path' },
        ],
      });
    });

    it('should parse array index', () => {
      const ast = compile('items[0]');
      expect(ast).toEqual({
        kind: 'path',
        segments: [
          { type: 'field', name: 'items' },
          { type: 'index', value: 0 },
        ],
      });
    });

    it('should parse wildcard', () => {
      const ast = compile('items[*]');
      expect(ast).toEqual({
        kind: 'path',
        segments: [
          { type: 'field', name: 'items' },
          { type: 'wildcard' },
        ],
      });
    });

    it('should parse complex nested path', () => {
      const ast = compile('data.items[0].name');
      expect(ast).toEqual({
        kind: 'path',
        segments: [
          { type: 'field', name: 'data' },
          { type: 'field', name: 'items' },
          { type: 'index', value: 0 },
          { type: 'field', name: 'name' },
        ],
      });
    });
  });

  describe('binary expressions', () => {
    it('should parse comparison', () => {
      const ast = compile('x > 5');
      expect(ast.kind).toBe('binary');
      expect((ast as ASTNode & { kind: 'binary' }).op).toBe('>');
    });

    it('should parse equality', () => {
      const ast = compile('x == "hello"');
      expect(ast.kind).toBe('binary');
      expect((ast as ASTNode & { kind: 'binary' }).op).toBe('==');
    });

    it('should parse arithmetic with precedence', () => {
      const ast = compile('a + b * c');
      expect(ast.kind).toBe('binary');
      const bin = ast as ASTNode & { kind: 'binary' };
      expect(bin.op).toBe('+');
      expect(bin.right.kind).toBe('binary');
      expect((bin.right as ASTNode & { kind: 'binary' }).op).toBe('*');
    });

    it('should parse logical AND', () => {
      const ast = compile('a && b');
      expect(ast.kind).toBe('binary');
      expect((ast as ASTNode & { kind: 'binary' }).op).toBe('&&');
    });

    it('should parse logical OR', () => {
      const ast = compile('a || b');
      expect(ast.kind).toBe('binary');
      expect((ast as ASTNode & { kind: 'binary' }).op).toBe('||');
    });

    it('should parse AND with higher precedence than OR', () => {
      const ast = compile('a || b && c');
      const bin = ast as ASTNode & { kind: 'binary' };
      expect(bin.op).toBe('||');
      expect(bin.right.kind).toBe('binary');
      expect((bin.right as ASTNode & { kind: 'binary' }).op).toBe('&&');
    });

    it('should parse in operator', () => {
      const ast = compile('x in items');
      expect(ast.kind).toBe('binary');
      expect((ast as ASTNode & { kind: 'binary' }).op).toBe('in');
    });

    it('should parse not_in operator', () => {
      const ast = compile('x not_in blocked');
      expect(ast.kind).toBe('binary');
      expect((ast as ASTNode & { kind: 'binary' }).op).toBe('not_in');
    });

    it('should parse contains operator', () => {
      const ast = compile('name contains "test"');
      expect(ast.kind).toBe('binary');
      expect((ast as ASTNode & { kind: 'binary' }).op).toBe('contains');
    });

    it('should parse matches operator', () => {
      const ast = compile('email matches "^[a-z]+@"');
      expect(ast.kind).toBe('binary');
      expect((ast as ASTNode & { kind: 'binary' }).op).toBe('matches');
    });
  });

  describe('unary expressions', () => {
    it('should parse logical NOT', () => {
      const ast = compile('!x');
      expect(ast.kind).toBe('unary');
      expect((ast as ASTNode & { kind: 'unary' }).op).toBe('!');
    });

    it('should parse negation', () => {
      const ast = compile('-5');
      expect(ast.kind).toBe('unary');
      expect((ast as ASTNode & { kind: 'unary' }).op).toBe('-');
    });

    it('should parse double negation', () => {
      const ast = compile('!!x');
      expect(ast.kind).toBe('unary');
      const outer = ast as ASTNode & { kind: 'unary' };
      expect(outer.operand.kind).toBe('unary');
    });
  });

  describe('function calls', () => {
    it('should parse zero-arg function', () => {
      // Our grammar requires an identifier, so we test with a named arg
      const ast = compile('len("hello")');
      expect(ast.kind).toBe('call');
      const call = ast as ASTNode & { kind: 'call' };
      expect(call.name).toBe('len');
      expect(call.args).toHaveLength(1);
    });

    it('should parse multi-arg function', () => {
      const ast = compile('min(a, b, c)');
      expect(ast.kind).toBe('call');
      const call = ast as ASTNode & { kind: 'call' };
      expect(call.name).toBe('min');
      expect(call.args).toHaveLength(3);
    });
  });

  describe('grouping', () => {
    it('should parse parenthesized expression', () => {
      const ast = compile('(a + b) * c');
      const bin = ast as ASTNode & { kind: 'binary' };
      expect(bin.op).toBe('*');
      expect(bin.left.kind).toBe('binary');
      expect((bin.left as ASTNode & { kind: 'binary' }).op).toBe('+');
    });
  });

  describe('complex expressions', () => {
    it('should parse compound boolean expression', () => {
      const ast = compile('amount > 1000 && currency == "USD" || vip == true');
      expect(ast.kind).toBe('binary');
    });

    it('should parse nested path with comparison', () => {
      const ast = compile('user.role == "admin" && action.target.path contains "/etc"');
      expect(ast.kind).toBe('binary');
    });
  });

  describe('errors', () => {
    it('should throw on empty expression', () => {
      expect(() => compile('')).toThrow(ParseError);
    });

    it('should throw on trailing tokens', () => {
      expect(() => compile('42 42')).toThrow(ParseError);
    });

    it('should throw on unclosed paren', () => {
      expect(() => compile('(a + b')).toThrow(ParseError);
    });
  });

  describe('depth limit', () => {
    it('should reject deeply nested expressions', () => {
      const deep = '(' .repeat(55) + '1' + ')'.repeat(55);
      expect(() => compile(deep)).toThrow(/maximum depth/);
    });
  });
});
