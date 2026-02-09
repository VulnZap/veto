/**
 * AST-based policy expression compiler.
 *
 * Provides compile() to parse expressions into ASTs, and evaluate() to
 * execute them against a context. No runtime eval().
 *
 * @module compiler
 *
 * @example
 * ```typescript
 * import { compile, evaluate, typeCheck } from 'veto-sdk/compiler';
 *
 * const ast = compile('amount > 1000 && currency == "USD"');
 * const result = evaluate(ast, { amount: 1500, currency: 'USD' });
 * // result === true
 * ```
 */

export { tokenize, LexerError } from './lexer.js';
export type { Token, TokenType } from './lexer.js';

export { parse, ParseError } from './parser.js';

export { evaluate, EvaluationError } from './evaluator.js';
export type { EvalContext } from './evaluator.js';

export { typeCheck } from './type-checker.js';
export type { ExprType, TypeIssue, TypeCheckResult } from './type-checker.js';

export { astDepth } from './ast.js';
export type {
  ASTNode,
  BinaryNode,
  UnaryNode,
  LiteralNode,
  PathNode,
  FunctionCallNode,
  PathSegment,
  BinaryOp,
  UnaryOp,
} from './ast.js';

import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import type { ASTNode } from './ast.js';

/**
 * Compile a policy expression string into an AST.
 * No runtime eval() is used.
 */
export function compile(expression: string): ASTNode {
  const tokens = tokenize(expression);
  return parse(tokens);
}
