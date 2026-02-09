/**
 * Stack-based virtual machine for executing compiled policy bytecode.
 *
 * Deterministic execution with bounded stack depth and instruction count.
 *
 * @module wasm/vm
 */

import {
  Opcode,
  type CompiledPolicy,
  type ConstantPoolEntry,
  type EvaluationResult,
  type VMState,
} from './types.js';

const DEFAULT_MAX_STACK = 256;
const DEFAULT_MAX_INSTRUCTIONS = 10_000;

export interface VMOptions {
  maxStackDepth?: number;
  maxInstructions?: number;
}

/**
 * Execute a compiled policy against a set of tool call arguments.
 *
 * Returns the first decision emitted by an EMIT_DECISION instruction
 * whose condition evaluates to truthy. If no rule matches, returns "allow".
 */
export function evaluate(
  policy: CompiledPolicy,
  args: Record<string, unknown>,
  options?: VMOptions,
): EvaluationResult {
  const t0 = performance.now();
  const maxStack = options?.maxStackDepth ?? DEFAULT_MAX_STACK;
  const maxInstr = options?.maxInstructions ?? DEFAULT_MAX_INSTRUCTIONS;

  const state: VMState = {
    stack: [],
    ip: 0,
    instructionsExecuted: 0,
    halted: false,
    pendingReason: undefined,
    pendingRuleId: undefined,
  };

  const matchedRules: string[] = [];
  const instructions = policy.instructions;
  const pool = policy.constantPool;
  const argKeys = policy.argKeys;

  while (!state.halted && state.ip < instructions.length) {
    if (state.instructionsExecuted >= maxInstr) {
      throw new Error(
        `VM execution limit reached: ${maxInstr} instructions`,
      );
    }

    const instr = instructions[state.ip];
    state.ip++;
    state.instructionsExecuted++;

    switch (instr.op) {
      case Opcode.LOAD_ARG: {
        const key = argKeys[instr.operand!];
        const val = resolveArgPath(args, key);
        push(state, val, maxStack);
        break;
      }

      case Opcode.LOAD_CONST: {
        const entry = pool[instr.operand!];
        push(state, resolveConstant(entry), maxStack);
        break;
      }

      case Opcode.CMP_EQ: {
        const b = pop(state);
        const a = pop(state);
        push(state, a === b ? 1 : 0, maxStack);
        break;
      }

      case Opcode.CMP_NEQ: {
        const b = pop(state);
        const a = pop(state);
        push(state, a !== b ? 1 : 0, maxStack);
        break;
      }

      case Opcode.CMP_LT: {
        const b = pop(state);
        const a = pop(state);
        push(state, toNum(a) < toNum(b) ? 1 : 0, maxStack);
        break;
      }

      case Opcode.CMP_GT: {
        const b = pop(state);
        const a = pop(state);
        push(state, toNum(a) > toNum(b) ? 1 : 0, maxStack);
        break;
      }

      case Opcode.CMP_LTE: {
        const b = pop(state);
        const a = pop(state);
        push(state, toNum(a) <= toNum(b) ? 1 : 0, maxStack);
        break;
      }

      case Opcode.CMP_GTE: {
        const b = pop(state);
        const a = pop(state);
        push(state, toNum(a) >= toNum(b) ? 1 : 0, maxStack);
        break;
      }

      case Opcode.CMP_MATCH: {
        const pattern = pop(state);
        const str = pop(state);
        const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        push(
          state,
          re instanceof RegExp && re.test(String(str ?? '')) ? 1 : 0,
          maxStack,
        );
        break;
      }

      case Opcode.CMP_CONTAINS: {
        const sub = pop(state);
        const str = pop(state);
        push(
          state,
          String(str ?? '').includes(String(sub ?? '')) ? 1 : 0,
          maxStack,
        );
        break;
      }

      case Opcode.CMP_STARTS_WITH: {
        const prefix = pop(state);
        const str = pop(state);
        push(
          state,
          String(str ?? '').startsWith(String(prefix ?? '')) ? 1 : 0,
          maxStack,
        );
        break;
      }

      case Opcode.CMP_ENDS_WITH: {
        const suffix = pop(state);
        const str = pop(state);
        push(
          state,
          String(str ?? '').endsWith(String(suffix ?? '')) ? 1 : 0,
          maxStack,
        );
        break;
      }

      case Opcode.CMP_IN: {
        const arrConst = pop(state);
        const val = pop(state);
        const arr = Array.isArray(arrConst) ? arrConst : [];
        push(state, arr.includes(val) ? 1 : 0, maxStack);
        break;
      }

      case Opcode.CMP_NOT_IN: {
        const arrConst = pop(state);
        const val = pop(state);
        const arr = Array.isArray(arrConst) ? arrConst : [];
        push(state, arr.includes(val) ? 0 : 1, maxStack);
        break;
      }

      case Opcode.AND: {
        const b = pop(state);
        const a = pop(state);
        push(state, truthy(a) && truthy(b) ? 1 : 0, maxStack);
        break;
      }

      case Opcode.OR: {
        const b = pop(state);
        const a = pop(state);
        push(state, truthy(a) || truthy(b) ? 1 : 0, maxStack);
        break;
      }

      case Opcode.NOT: {
        const a = pop(state);
        push(state, truthy(a) ? 0 : 1, maxStack);
        break;
      }

      case Opcode.SET_REASON: {
        const entry = pool[instr.operand!];
        state.pendingReason = resolveConstant(entry) as string;
        break;
      }

      case Opcode.SET_RULE_ID: {
        const entry = pool[instr.operand!];
        state.pendingRuleId = resolveConstant(entry) as string;
        break;
      }

      case Opcode.EMIT_DECISION: {
        const condition = pop(state);
        if (truthy(condition)) {
          if (state.pendingRuleId) {
            matchedRules.push(state.pendingRuleId);
          }
          const decision = instr.operand === 1 ? 'deny' : 'allow';
          // For deny decisions, return immediately
          if (decision === 'deny') {
            const latencyNs = (performance.now() - t0) * 1e6;
            return {
              decision,
              reason: state.pendingReason,
              ruleId: state.pendingRuleId,
              latencyNs,
              matchedRules,
            };
          }
        }
        break;
      }

      case Opcode.HALT: {
        state.halted = true;
        break;
      }

      default:
        throw new Error(`Unknown opcode: 0x${(instr.op as number).toString(16)}`);
    }
  }

  // No deny was emitted, default to allow
  const latencyNs = (performance.now() - t0) * 1e6;
  return {
    decision: 'allow',
    latencyNs,
    matchedRules,
  };
}

function push(state: VMState, value: unknown, maxDepth: number): void {
  if (state.stack.length >= maxDepth) {
    throw new Error(`VM stack overflow: depth ${maxDepth}`);
  }
  state.stack.push(value);
}

function pop(state: VMState): unknown {
  if (state.stack.length === 0) {
    throw new Error('VM stack underflow');
  }
  return state.stack.pop();
}

function truthy(value: unknown): boolean {
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return false;
  return Boolean(value);
}

function toNum(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/**
 * Resolve a dot-path key against the arguments object.
 * e.g. "arguments.path" looks up args["arguments"]["path"],
 * but since we already receive the arguments object directly,
 * "path" resolves to args["path"].
 *
 * Supports the "arguments." prefix for compatibility with rule field specs.
 */
function resolveArgPath(
  args: Record<string, unknown>,
  path: string,
): unknown {
  // Strip "arguments." prefix if present (rules reference fields as "arguments.x")
  const cleanPath = path.startsWith('arguments.') ? path.slice(10) : path;
  const parts = cleanPath.split('.');
  let current: unknown = args;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function resolveConstant(entry: ConstantPoolEntry): unknown {
  switch (entry.type) {
    case 'string':
      return entry.value;
    case 'number':
      return entry.value;
    case 'boolean':
      return entry.value;
    case 'null':
      return null;
    case 'array':
      return entry.value;
    case 'regex':
      return new RegExp(entry.source, entry.flags);
  }
}
