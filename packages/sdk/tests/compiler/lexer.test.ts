import { describe, it, expect } from 'vitest';
import { tokenize, LexerError } from '../../src/compiler/lexer.js';

describe('Lexer', () => {
  it('should tokenize numbers', () => {
    const tokens = tokenize('42 3.14');
    expect(tokens[0]).toMatchObject({ type: 'NUMBER', value: '42' });
    expect(tokens[1]).toMatchObject({ type: 'NUMBER', value: '3.14' });
  });

  it('should tokenize strings with single and double quotes', () => {
    const tokens = tokenize('"hello" \'world\'');
    expect(tokens[0]).toMatchObject({ type: 'STRING', value: 'hello' });
    expect(tokens[1]).toMatchObject({ type: 'STRING', value: 'world' });
  });

  it('should handle escape sequences in strings', () => {
    const tokens = tokenize('"hello\\nworld"');
    expect(tokens[0]).toMatchObject({ type: 'STRING', value: 'hello\nworld' });
  });

  it('should tokenize booleans', () => {
    const tokens = tokenize('true false');
    expect(tokens[0]).toMatchObject({ type: 'BOOLEAN', value: 'true' });
    expect(tokens[1]).toMatchObject({ type: 'BOOLEAN', value: 'false' });
  });

  it('should tokenize identifiers', () => {
    const tokens = tokenize('foo bar_baz _x');
    expect(tokens[0]).toMatchObject({ type: 'IDENTIFIER', value: 'foo' });
    expect(tokens[1]).toMatchObject({ type: 'IDENTIFIER', value: 'bar_baz' });
    expect(tokens[2]).toMatchObject({ type: 'IDENTIFIER', value: '_x' });
  });

  it('should tokenize keywords', () => {
    const tokens = tokenize('in not_in contains matches');
    expect(tokens[0]).toMatchObject({ type: 'IN' });
    expect(tokens[1]).toMatchObject({ type: 'NOT_IN' });
    expect(tokens[2]).toMatchObject({ type: 'CONTAINS' });
    expect(tokens[3]).toMatchObject({ type: 'MATCHES' });
  });

  it('should tokenize comparison operators', () => {
    const tokens = tokenize('== != < > <= >=');
    expect(tokens[0]).toMatchObject({ type: 'EQ' });
    expect(tokens[1]).toMatchObject({ type: 'NEQ' });
    expect(tokens[2]).toMatchObject({ type: 'LT' });
    expect(tokens[3]).toMatchObject({ type: 'GT' });
    expect(tokens[4]).toMatchObject({ type: 'LTE' });
    expect(tokens[5]).toMatchObject({ type: 'GTE' });
  });

  it('should tokenize logical operators', () => {
    const tokens = tokenize('&& || !');
    expect(tokens[0]).toMatchObject({ type: 'AND' });
    expect(tokens[1]).toMatchObject({ type: 'OR' });
    expect(tokens[2]).toMatchObject({ type: 'NOT' });
  });

  it('should tokenize arithmetic operators', () => {
    const tokens = tokenize('+ - * /');
    expect(tokens[0]).toMatchObject({ type: 'PLUS' });
    expect(tokens[1]).toMatchObject({ type: 'MINUS' });
    expect(tokens[2]).toMatchObject({ type: 'STAR' });
    expect(tokens[3]).toMatchObject({ type: 'SLASH' });
  });

  it('should tokenize structural tokens', () => {
    const tokens = tokenize('. [ ] ( ) ,');
    expect(tokens[0]).toMatchObject({ type: 'DOT' });
    expect(tokens[1]).toMatchObject({ type: 'LBRACKET' });
    expect(tokens[2]).toMatchObject({ type: 'RBRACKET' });
    expect(tokens[3]).toMatchObject({ type: 'LPAREN' });
    expect(tokens[4]).toMatchObject({ type: 'RPAREN' });
    expect(tokens[5]).toMatchObject({ type: 'COMMA' });
  });

  it('should always end with EOF', () => {
    const tokens = tokenize('42');
    expect(tokens[tokens.length - 1].type).toBe('EOF');
  });

  it('should skip whitespace', () => {
    const tokens = tokenize('  42   +   3  ');
    expect(tokens).toHaveLength(4); // NUMBER PLUS NUMBER EOF
  });

  it('should track position', () => {
    const tokens = tokenize('a + b');
    expect(tokens[0].pos).toBe(0);
    expect(tokens[1].pos).toBe(2);
    expect(tokens[2].pos).toBe(4);
  });

  it('should tokenize a full expression', () => {
    const tokens = tokenize('amount > 1000 && currency == "USD"');
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      'IDENTIFIER', 'GT', 'NUMBER', 'AND',
      'IDENTIFIER', 'EQ', 'STRING', 'EOF',
    ]);
  });

  it('should tokenize path expressions', () => {
    const tokens = tokenize('args.items[0].name');
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      'IDENTIFIER', 'DOT', 'IDENTIFIER', 'LBRACKET', 'NUMBER', 'RBRACKET',
      'DOT', 'IDENTIFIER', 'EOF',
    ]);
  });

  it('should throw on unexpected characters', () => {
    expect(() => tokenize('foo @ bar')).toThrow(LexerError);
  });

  it('should throw on unterminated strings', () => {
    expect(() => tokenize('"unterminated')).toThrow(LexerError);
  });
});
