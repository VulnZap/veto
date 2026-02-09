/**
 * Type checker for AST expressions against tool argument schemas.
 *
 * Validates that paths referenced in expressions exist in the tool schema
 * and that operations are applied to compatible types.
 *
 * @module compiler/type-checker
 */

import type { ASTNode, BinaryOp } from './ast.js';
import type { JsonSchemaProperty, ToolInputSchema } from '../types/tool.js';

export type ExprType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown';

export interface TypeIssue {
  message: string;
  node: ASTNode;
  severity: 'error' | 'warning';
}

export interface TypeCheckResult {
  valid: boolean;
  issues: TypeIssue[];
  inferredType: ExprType;
}

export function typeCheck(node: ASTNode, schema?: ToolInputSchema): TypeCheckResult {
  const issues: TypeIssue[] = [];
  const inferred = infer(node, schema?.properties ?? {}, issues);
  return {
    valid: issues.every((i) => i.severity !== 'error'),
    issues,
    inferredType: inferred,
  };
}

function infer(
  node: ASTNode,
  properties: Record<string, JsonSchemaProperty>,
  issues: TypeIssue[],
): ExprType {
  switch (node.kind) {
    case 'literal':
      return typeof node.value as ExprType;

    case 'path':
      return inferPath(node, properties, issues);

    case 'unary':
      return inferUnary(node, properties, issues);

    case 'binary':
      return inferBinary(node, properties, issues);

    case 'call':
      return inferCall(node, properties, issues);
  }
}

function inferPath(
  node: ASTNode & { kind: 'path' },
  properties: Record<string, JsonSchemaProperty>,
  issues: TypeIssue[],
): ExprType {
  let current: JsonSchemaProperty | undefined;
  let currentProps = properties;

  for (let i = 0; i < node.segments.length; i++) {
    const seg = node.segments[i];

    if (seg.type === 'field') {
      current = currentProps[seg.name];
      if (!current && Object.keys(currentProps).length > 0) {
        issues.push({
          message: `Property '${seg.name}' not found in schema`,
          node,
          severity: 'warning',
        });
        return 'unknown';
      }
      if (!current) return 'unknown';
      currentProps = current.properties ?? {};
    } else if (seg.type === 'index' || seg.type === 'wildcard') {
      if (current && current.type !== 'array') {
        issues.push({
          message: `Cannot index into non-array type '${String(current.type)}'`,
          node,
          severity: 'error',
        });
        return 'unknown';
      }
      if (current?.items) {
        current = current.items;
        currentProps = current.properties ?? {};
      } else {
        return 'unknown';
      }
      if (seg.type === 'wildcard') return 'array';
    }
  }

  if (!current) return 'unknown';
  return schemaTypeToExprType(current.type);
}

function inferUnary(
  node: ASTNode & { kind: 'unary' },
  properties: Record<string, JsonSchemaProperty>,
  issues: TypeIssue[],
): ExprType {
  const operandType = infer(node.operand, properties, issues);

  if (node.op === '!') {
    if (operandType !== 'boolean' && operandType !== 'unknown') {
      issues.push({
        message: `Logical NOT applied to non-boolean type '${operandType}'`,
        node,
        severity: 'warning',
      });
    }
    return 'boolean';
  }

  if (node.op === '-') {
    if (operandType !== 'number' && operandType !== 'unknown') {
      issues.push({
        message: `Negation applied to non-number type '${operandType}'`,
        node,
        severity: 'error',
      });
    }
    return 'number';
  }

  return 'unknown';
}

function inferBinary(
  node: ASTNode & { kind: 'binary' },
  properties: Record<string, JsonSchemaProperty>,
  issues: TypeIssue[],
): ExprType {
  const leftType = infer(node.left, properties, issues);
  const rightType = infer(node.right, properties, issues);

  const booleanOps: BinaryOp[] = ['==', '!=', '<', '>', '<=', '>=', '&&', '||', 'in', 'not_in', 'contains', 'matches'];
  if (booleanOps.includes(node.op)) {
    return checkBooleanOp(node.op, leftType, rightType, node, issues);
  }

  const arithmeticOps: BinaryOp[] = ['+', '-', '*', '/'];
  if (arithmeticOps.includes(node.op)) {
    if (node.op === '+' && (leftType === 'string' || rightType === 'string')) {
      return 'string';
    }
    if (leftType !== 'number' && leftType !== 'unknown') {
      issues.push({
        message: `Arithmetic operator '${node.op}' applied to non-number type '${leftType}'`,
        node,
        severity: 'warning',
      });
    }
    if (rightType !== 'number' && rightType !== 'unknown') {
      issues.push({
        message: `Arithmetic operator '${node.op}' applied to non-number type '${rightType}'`,
        node,
        severity: 'warning',
      });
    }
    return 'number';
  }

  return 'unknown';
}

function checkBooleanOp(
  op: BinaryOp,
  leftType: ExprType,
  rightType: ExprType,
  node: ASTNode,
  issues: TypeIssue[],
): ExprType {
  if (op === '&&' || op === '||') {
    if (leftType !== 'boolean' && leftType !== 'unknown') {
      issues.push({
        message: `Logical '${op}' applied to non-boolean type '${leftType}'`,
        node,
        severity: 'warning',
      });
    }
    return 'boolean';
  }

  if (op === 'in' || op === 'not_in') {
    if (rightType !== 'array' && rightType !== 'unknown') {
      issues.push({
        message: `'${op}' requires array on right side, got '${rightType}'`,
        node,
        severity: 'error',
      });
    }
    return 'boolean';
  }

  if (op === 'contains') {
    if (leftType !== 'string' && leftType !== 'array' && leftType !== 'unknown') {
      issues.push({
        message: `'contains' requires string or array on left side, got '${leftType}'`,
        node,
        severity: 'error',
      });
    }
    return 'boolean';
  }

  if (op === 'matches') {
    if (leftType !== 'string' && leftType !== 'unknown') {
      issues.push({
        message: `'matches' requires string on left side, got '${leftType}'`,
        node,
        severity: 'error',
      });
    }
    if (rightType !== 'string' && rightType !== 'unknown') {
      issues.push({
        message: `'matches' requires string pattern on right side, got '${rightType}'`,
        node,
        severity: 'error',
      });
    }
    return 'boolean';
  }

  // comparison ops: ==, !=, <, >, <=, >=
  return 'boolean';
}

function inferCall(
  node: ASTNode & { kind: 'call' },
  properties: Record<string, JsonSchemaProperty>,
  issues: TypeIssue[],
): ExprType {
  // Type-check args
  for (const arg of node.args) {
    infer(arg, properties, issues);
  }

  const returnTypes: Record<string, ExprType> = {
    len: 'number',
    lower: 'string',
    upper: 'string',
    abs: 'number',
    min: 'number',
    max: 'number',
    starts_with: 'boolean',
    ends_with: 'boolean',
  };

  const ret = returnTypes[node.name];
  if (!ret) {
    issues.push({
      message: `Unknown function '${node.name}'`,
      node,
      severity: 'error',
    });
    return 'unknown';
  }
  return ret;
}

function schemaTypeToExprType(
  schemaType: string | string[] | undefined,
): ExprType {
  if (!schemaType) return 'unknown';
  const t = Array.isArray(schemaType) ? schemaType[0] : schemaType;
  switch (t) {
    case 'string': return 'string';
    case 'number':
    case 'integer': return 'number';
    case 'boolean': return 'boolean';
    case 'array': return 'array';
    case 'object': return 'object';
    default: return 'unknown';
  }
}
