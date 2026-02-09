/**
 * WASM Decision Engine - high-performance local policy evaluation.
 *
 * @module wasm
 */

export { WasmDecisionEngine } from './engine.js';
export { compilePolicy, serializePolicy, deserializePolicy } from './compiler.js';
export { evaluate } from './vm.js';
export { PolicyCache } from './cache.js';
export { PolicySync } from './sync.js';
export type {
  Opcode,
  Instruction,
  CompiledPolicy,
  ConstantPoolEntry,
  VMState,
  EvaluationResult,
  WasmEngineConfig,
  SerializedPolicy,
  PolicyCacheEntry,
} from './types.js';
