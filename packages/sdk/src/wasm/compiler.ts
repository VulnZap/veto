/**
 * Policy compiler: transforms Rule objects into bytecode instructions.
 *
 * @module wasm/compiler
 */

import type { Rule, RuleCondition, ConditionOperator } from '../rules/types.js';
import {
  Opcode,
  type CompiledPolicy,
  type ConstantPoolEntry,
  type Instruction,
} from './types.js';

/**
 * Compile an array of rules into a single CompiledPolicy.
 *
 * Rules are compiled in order. Each rule becomes a sequence:
 *   1. Evaluate all conditions (AND within a group, OR across groups)
 *   2. If conditions match, emit the rule's decision
 *   3. If no conditions, the rule always matches
 *
 * If no rule matches, the default decision is "allow".
 */
export function compilePolicy(rules: Rule[]): CompiledPolicy {
  const ctx = new CompilerContext();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    ctx.compileRule(rule);
  }

  // Final HALT
  ctx.emit(Opcode.HALT);

  return {
    version: 1,
    instructions: ctx.instructions,
    constantPool: ctx.constantPool,
    argKeys: ctx.argKeys,
    ruleIds: rules.filter((r) => r.enabled).map((r) => r.id),
    compiledAt: new Date().toISOString(),
  };
}

/**
 * Serialize a CompiledPolicy to an ArrayBuffer for storage/transfer.
 */
export function serializePolicy(policy: CompiledPolicy): ArrayBuffer {
  const json = JSON.stringify(policy);
  const encoder = new TextEncoder();
  return encoder.encode(json).buffer as ArrayBuffer;
}

/**
 * Deserialize an ArrayBuffer back to a CompiledPolicy.
 */
export function deserializePolicy(buffer: ArrayBuffer): CompiledPolicy {
  const decoder = new TextDecoder();
  const json = decoder.decode(buffer);
  const parsed = JSON.parse(json) as CompiledPolicy;

  if (parsed.version !== 1) {
    throw new Error(`Unsupported compiled policy version: ${parsed.version}`);
  }

  return parsed;
}

class CompilerContext {
  instructions: Instruction[] = [];
  constantPool: ConstantPoolEntry[] = [];
  argKeys: string[] = [];

  private constantMap = new Map<string, number>();
  private argKeyMap = new Map<string, number>();

  emit(op: Opcode, operand?: number): void {
    this.instructions.push({ op, operand });
  }

  addConstant(entry: ConstantPoolEntry): number {
    const key = JSON.stringify(entry);
    const existing = this.constantMap.get(key);
    if (existing !== undefined) return existing;

    const idx = this.constantPool.length;
    this.constantPool.push(entry);
    this.constantMap.set(key, idx);
    return idx;
  }

  addArgKey(key: string): number {
    const existing = this.argKeyMap.get(key);
    if (existing !== undefined) return existing;

    const idx = this.argKeys.length;
    this.argKeys.push(key);
    this.argKeyMap.set(key, idx);
    return idx;
  }

  compileRule(rule: Rule): void {
    const reasonIdx = this.addConstant({
      type: 'string',
      value: rule.description ?? `Rule ${rule.id}: ${rule.name}`,
    });
    const ruleIdIdx = this.addConstant({ type: 'string', value: rule.id });

    this.emit(Opcode.SET_REASON, reasonIdx);
    this.emit(Opcode.SET_RULE_ID, ruleIdIdx);

    const decision = rule.action === 'block' ? 1 : 0;

    if (rule.condition_groups && rule.condition_groups.length > 0) {
      // OR across groups, AND within each group
      this.compileConditionGroups(rule.condition_groups);
      this.emit(Opcode.EMIT_DECISION, decision);
    } else if (rule.conditions && rule.conditions.length > 0) {
      // Single AND group
      this.compileConditionGroup(rule.conditions);
      this.emit(Opcode.EMIT_DECISION, decision);
    } else {
      // No conditions: always matches
      this.emit(Opcode.LOAD_CONST, this.addConstant({ type: 'boolean', value: true }));
      this.emit(Opcode.EMIT_DECISION, decision);
    }
  }

  private compileConditionGroups(groups: RuleCondition[][]): void {
    // First group
    this.compileConditionGroup(groups[0]);

    // OR with subsequent groups
    for (let i = 1; i < groups.length; i++) {
      this.compileConditionGroup(groups[i]);
      this.emit(Opcode.OR);
    }
  }

  private compileConditionGroup(conditions: RuleCondition[]): void {
    // First condition
    this.compileCondition(conditions[0]);

    // AND with subsequent conditions
    for (let i = 1; i < conditions.length; i++) {
      this.compileCondition(conditions[i]);
      this.emit(Opcode.AND);
    }
  }

  private compileCondition(condition: RuleCondition): void {
    // Load the argument value
    const argIdx = this.addArgKey(condition.field);
    this.emit(Opcode.LOAD_ARG, argIdx);

    // Load the comparison value
    const constIdx = this.addConstantValue(condition.value);
    this.emit(Opcode.LOAD_CONST, constIdx);

    // Emit the comparison operator
    this.emit(operatorToOpcode(condition.operator));

    // not_contains needs a NOT after CMP_CONTAINS
    if (condition.operator === 'not_contains') {
      this.emit(Opcode.NOT);
    }
  }

  private addConstantValue(value: unknown): number {
    if (value === null || value === undefined) {
      return this.addConstant({ type: 'null' });
    }
    if (typeof value === 'string') {
      return this.addConstant({ type: 'string', value });
    }
    if (typeof value === 'number') {
      return this.addConstant({ type: 'number', value });
    }
    if (typeof value === 'boolean') {
      return this.addConstant({ type: 'boolean', value });
    }
    if (Array.isArray(value)) {
      return this.addConstant({ type: 'array', value });
    }
    return this.addConstant({ type: 'string', value: String(value) });
  }
}

function operatorToOpcode(operator: ConditionOperator): Opcode {
  switch (operator) {
    case 'equals':
      return Opcode.CMP_EQ;
    case 'not_equals':
      return Opcode.CMP_NEQ;
    case 'less_than':
      return Opcode.CMP_LT;
    case 'greater_than':
      return Opcode.CMP_GT;
    case 'contains':
      return Opcode.CMP_CONTAINS;
    case 'not_contains':
      return Opcode.CMP_CONTAINS; // NOT is applied after
    case 'starts_with':
      return Opcode.CMP_STARTS_WITH;
    case 'ends_with':
      return Opcode.CMP_ENDS_WITH;
    case 'matches':
      return Opcode.CMP_MATCH;
    case 'in':
      return Opcode.CMP_IN;
    case 'not_in':
      return Opcode.CMP_NOT_IN;
    default:
      return Opcode.CMP_EQ;
  }
}
