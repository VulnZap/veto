/**
 * Types for the WASM decision engine.
 *
 * @module wasm/types
 */

/**
 * Opcodes for the bytecode virtual machine.
 *
 * Each instruction operates on a stack-based execution model.
 * Values are pushed/popped from the operand stack.
 */
export const enum Opcode {
  /** Load a tool call argument value onto the stack. Operand: argument key index. */
  LOAD_ARG = 0x01,
  /** Load a constant value onto the stack. Operand: constant pool index. */
  LOAD_CONST = 0x02,
  /** Pop two values, push 1 if equal, 0 otherwise. */
  CMP_EQ = 0x10,
  /** Pop two values, push 1 if not equal, 0 otherwise. */
  CMP_NEQ = 0x11,
  /** Pop two values (a, b), push 1 if a < b. */
  CMP_LT = 0x12,
  /** Pop two values (a, b), push 1 if a > b. */
  CMP_GT = 0x13,
  /** Pop two values (a, b), push 1 if a <= b. */
  CMP_LTE = 0x14,
  /** Pop two values (a, b), push 1 if a >= b. */
  CMP_GTE = 0x15,
  /** Pop two values (string, pattern), push 1 if regex matches. */
  CMP_MATCH = 0x16,
  /** Pop two values (string, substring), push 1 if contains. */
  CMP_CONTAINS = 0x17,
  /** Pop two values (string, prefix), push 1 if starts with. */
  CMP_STARTS_WITH = 0x18,
  /** Pop two values (string, suffix), push 1 if ends with. */
  CMP_ENDS_WITH = 0x19,
  /** Pop two values (value, array index), push 1 if value is in array at constant pool index. */
  CMP_IN = 0x1A,
  /** Pop two values (value, array index), push 1 if value is not in array at constant pool index. */
  CMP_NOT_IN = 0x1B,
  /** Pop two values, push logical AND. */
  AND = 0x20,
  /** Pop two values, push logical OR. */
  OR = 0x21,
  /** Pop one value, push logical NOT. */
  NOT = 0x22,
  /** Emit decision. Operand: 0 = allow, 1 = deny. Pops condition from stack. */
  EMIT_DECISION = 0x30,
  /** Set the reason string index for the next decision. Operand: constant pool index. */
  SET_REASON = 0x31,
  /** Set the rule ID for the next decision. Operand: constant pool index. */
  SET_RULE_ID = 0x32,
  /** Halt execution. */
  HALT = 0xFF,
}

/**
 * A single VM instruction.
 */
export interface Instruction {
  op: Opcode;
  operand?: number;
}

/**
 * Compiled policy in a serializable format.
 *
 * Contains the instruction sequence and a constant pool
 * for string/number/array literals referenced by instructions.
 */
export interface CompiledPolicy {
  /** Format version for forward compatibility. */
  version: 1;
  /** Bytecode instruction sequence. */
  instructions: Instruction[];
  /** Pool of constant values referenced by operand indices. */
  constantPool: ConstantPoolEntry[];
  /** Argument key lookup table: index -> dot-path string. */
  argKeys: string[];
  /** Source rule IDs included in this compiled policy. */
  ruleIds: string[];
  /** Compilation timestamp (ISO string). */
  compiledAt: string;
}

/**
 * Entry in the constant pool.
 */
export type ConstantPoolEntry =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }
  | { type: 'array'; value: unknown[] }
  | { type: 'regex'; source: string; flags: string };

/**
 * VM execution state.
 */
export interface VMState {
  /** Operand stack. */
  stack: unknown[];
  /** Instruction pointer. */
  ip: number;
  /** Instructions executed count (for bounding). */
  instructionsExecuted: number;
  /** Whether execution has halted. */
  halted: boolean;
  /** Pending reason string (set by SET_REASON). */
  pendingReason: string | undefined;
  /** Pending rule ID (set by SET_RULE_ID). */
  pendingRuleId: string | undefined;
}

/**
 * Result of a single policy evaluation.
 */
export interface EvaluationResult {
  /** Allow or deny. */
  decision: 'allow' | 'deny';
  /** Human-readable reason for the decision. */
  reason?: string;
  /** Rule ID that produced this decision. */
  ruleId?: string;
  /** Evaluation latency in nanoseconds (via performance.now * 1e6). */
  latencyNs: number;
  /** IDs of rules that were matched. */
  matchedRules: string[];
}

/**
 * Configuration for the WASM decision engine.
 */
export interface WasmEngineConfig {
  /** Maximum stack depth for the VM. Default: 256. */
  maxStackDepth?: number;
  /** Maximum instructions per evaluation. Default: 10000. */
  maxInstructions?: number;
  /** Maximum compiled policies to cache. Default: 100. */
  maxCachedPolicies?: number;
  /** Policy cache TTL in milliseconds. Default: 60000 (60s). */
  cacheTtlMs?: number;
  /** URL to fetch policies from (for sync). */
  policySyncUrl?: string;
  /** Sync interval in milliseconds. Default: 30000 (30s). */
  syncIntervalMs?: number;
  /** API key for policy sync authentication. */
  syncApiKey?: string;
}

/**
 * Serialized format of a compiled policy for storage/transfer.
 */
export interface SerializedPolicy {
  /** Raw bytes as base64. */
  data: string;
  /** SHA-256 hash of the data for integrity. */
  hash: string;
  /** Compilation timestamp. */
  compiledAt: string;
  /** Rule IDs included. */
  ruleIds: string[];
}

/**
 * Cache entry for a compiled policy.
 */
export interface PolicyCacheEntry {
  policy: CompiledPolicy;
  cachedAt: number;
  lastUsed: number;
  hitCount: number;
}
