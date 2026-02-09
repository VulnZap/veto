/**
 * Recursive descent parser for policy expressions.
 *
 * Grammar:
 *   expr     -> or_expr
 *   or_expr  -> and_expr ('||' and_expr)*
 *   and_expr -> not_expr ('&&' not_expr)*
 *   not_expr -> '!' not_expr | cmp_expr
 *   cmp_expr -> add_expr (('==' | '!=' | '<' | '>' | '<=' | '>=' | 'in' | 'not_in' | 'contains' | 'matches') add_expr)?
 *   add_expr -> mul_expr (('+' | '-') mul_expr)*
 *   mul_expr -> unary (('*' | '/') unary)*
 *   unary    -> '-' unary | primary
 *   primary  -> NUMBER | STRING | BOOLEAN | path | '(' expr ')' | IDENTIFIER '(' args ')'
 *   path     -> IDENTIFIER ('.' IDENTIFIER | '[' (NUMBER | '*') ']')*
 *   args     -> expr (',' expr)*
 *
 * @module compiler/parser
 */

import type { Token, TokenType } from './lexer.js';
import type { ASTNode, BinaryOp, PathSegment } from './ast.js';

const MAX_DEPTH = 50;

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly pos: number,
  ) {
    super(`${message} at position ${pos}`);
    this.name = 'ParseError';
  }
}

export function parse(tokens: Token[]): ASTNode {
  let cursor = 0;
  let depth = 0;

  function peek(): Token {
    return tokens[cursor];
  }

  function advance(): Token {
    return tokens[cursor++];
  }

  function expect(type: TokenType): Token {
    const tok = peek();
    if (tok.type !== type) {
      throw new ParseError(`Expected ${type}, got ${tok.type} '${tok.value}'`, tok.pos);
    }
    return advance();
  }

  function match(...types: TokenType[]): Token | null {
    const tok = peek();
    if (types.includes(tok.type)) {
      return advance();
    }
    return null;
  }

  function enterDepth(): void {
    depth++;
    if (depth > MAX_DEPTH) {
      throw new ParseError('Expression exceeds maximum depth of 50', peek().pos);
    }
  }

  function exitDepth(): void {
    depth--;
  }

  function expr(): ASTNode {
    enterDepth();
    const node = orExpr();
    exitDepth();
    return node;
  }

  function orExpr(): ASTNode {
    let left = andExpr();
    while (match('OR')) {
      const right = andExpr();
      left = { kind: 'binary', op: '||', left, right };
    }
    return left;
  }

  function andExpr(): ASTNode {
    let left = notExpr();
    while (match('AND')) {
      const right = notExpr();
      left = { kind: 'binary', op: '&&', left, right };
    }
    return left;
  }

  function notExpr(): ASTNode {
    if (match('NOT')) {
      const operand = notExpr();
      return { kind: 'unary', op: '!', operand };
    }
    return cmpExpr();
  }

  function cmpExpr(): ASTNode {
    const left = addExpr();
    const opMap: Partial<Record<TokenType, BinaryOp>> = {
      EQ: '==',
      NEQ: '!=',
      LT: '<',
      GT: '>',
      LTE: '<=',
      GTE: '>=',
      IN: 'in',
      NOT_IN: 'not_in',
      CONTAINS: 'contains',
      MATCHES: 'matches',
    };
    const tok = peek();
    const op = opMap[tok.type];
    if (op) {
      advance();
      const right = addExpr();
      return { kind: 'binary', op, left, right };
    }
    return left;
  }

  function addExpr(): ASTNode {
    let left = mulExpr();
    let tok: Token | null;
    while ((tok = match('PLUS', 'MINUS'))) {
      const op: BinaryOp = tok.type === 'PLUS' ? '+' : '-';
      const right = mulExpr();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  function mulExpr(): ASTNode {
    let left = unary();
    let tok: Token | null;
    while ((tok = match('STAR', 'SLASH'))) {
      const op: BinaryOp = tok.type === 'STAR' ? '*' : '/';
      const right = unary();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  function unary(): ASTNode {
    if (match('MINUS')) {
      const operand = unary();
      return { kind: 'unary', op: '-', operand };
    }
    return primary();
  }

  function primary(): ASTNode {
    const tok = peek();

    if (tok.type === 'NUMBER') {
      advance();
      const val = tok.value.includes('.') ? parseFloat(tok.value) : parseInt(tok.value, 10);
      return { kind: 'literal', value: val };
    }

    if (tok.type === 'STRING') {
      advance();
      return { kind: 'literal', value: tok.value };
    }

    if (tok.type === 'BOOLEAN') {
      advance();
      return { kind: 'literal', value: tok.value === 'true' };
    }

    if (tok.type === 'LPAREN') {
      advance();
      const node = expr();
      expect('RPAREN');
      return node;
    }

    if (tok.type === 'IDENTIFIER') {
      advance();
      // Check if this is a function call
      if (peek().type === 'LPAREN') {
        advance(); // consume '('
        const args: ASTNode[] = [];
        if (peek().type !== 'RPAREN') {
          args.push(expr());
          while (match('COMMA')) {
            args.push(expr());
          }
        }
        expect('RPAREN');
        return { kind: 'call', name: tok.value, args };
      }

      // Otherwise it's a path
      const segments: PathSegment[] = [{ type: 'field', name: tok.value }];
      while (true) {
        if (match('DOT')) {
          const field = expect('IDENTIFIER');
          segments.push({ type: 'field', name: field.value });
        } else if (match('LBRACKET')) {
          if (peek().type === 'STAR') {
            advance();
            segments.push({ type: 'wildcard' });
          } else {
            const idx = expect('NUMBER');
            segments.push({ type: 'index', value: parseInt(idx.value, 10) });
          }
          expect('RBRACKET');
        } else {
          break;
        }
      }
      if (segments.length === 1 && segments[0].type === 'field') {
        return { kind: 'path', segments };
      }
      return { kind: 'path', segments };
    }

    throw new ParseError(`Unexpected token ${tok.type} '${tok.value}'`, tok.pos);
  }

  const result = expr();
  if (peek().type !== 'EOF') {
    const tok = peek();
    throw new ParseError(`Unexpected token ${tok.type} '${tok.value}' after expression`, tok.pos);
  }
  return result;
}
