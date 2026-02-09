/**
 * AST node types for the policy expression compiler.
 *
 * @module compiler/ast
 */

export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '=='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | '&&'
  | '||'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'matches';

export type UnaryOp = '!' | '-';

export interface LiteralNode {
  kind: 'literal';
  value: string | number | boolean;
}

export interface PathNode {
  kind: 'path';
  segments: PathSegment[];
}

export type PathSegment =
  | { type: 'field'; name: string }
  | { type: 'index'; value: number }
  | { type: 'wildcard' };

export interface BinaryNode {
  kind: 'binary';
  op: BinaryOp;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryNode {
  kind: 'unary';
  op: UnaryOp;
  operand: ASTNode;
}

export interface FunctionCallNode {
  kind: 'call';
  name: string;
  args: ASTNode[];
}

export type ASTNode =
  | LiteralNode
  | PathNode
  | BinaryNode
  | UnaryNode
  | FunctionCallNode;

/**
 * Compute the depth of an AST tree.
 */
export function astDepth(node: ASTNode): number {
  switch (node.kind) {
    case 'literal':
    case 'path':
      return 1;
    case 'unary':
      return 1 + astDepth(node.operand);
    case 'binary':
      return 1 + Math.max(astDepth(node.left), astDepth(node.right));
    case 'call':
      return 1 + Math.max(0, ...node.args.map(astDepth));
  }
}
