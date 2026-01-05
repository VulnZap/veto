/**
 * Prompt builder for the Veto kernel.
 *
 * Formats tool calls and rules into the exact prompt format
 * used for training the Veto model.
 *
 * @module kernel/prompt
 */

import type { Rule, RuleCondition } from '../rules/types.js';
import type { KernelToolCall } from './types.js';

/**
 * System prompt for the Veto guardrail model.
 */
const SYSTEM_PROMPT = `You are a security guardrail for AI agent tool calls. You receive a tool call and a ruleset defining security policies.
Evaluate whether the tool call violates any rules in the ruleset.
Respond with JSON only:
{"pass_weight": <float 0-1>, "block_weight": <float 0-1>, "decision": "<pass|block>", "reasoning": "<brief explanation>"}`;

/**
 * Build the system prompt for kernel inference.
 */
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Format a value for YAML-like output.
 */
function formatValue(value: unknown, indent: number = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (value === null || value === undefined) {
    return 'null';
  }
  
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
      return `[${value.join(', ')}]`;
    }
    return value.map(v => `\n${spaces}- ${formatValue(v, indent + 1)}`).join('');
  }
  
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        const formattedValue = formatValue(v, indent + 1);
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          return `\n${spaces}${k}:${formattedValue}`;
        }
        return `\n${spaces}${k}: ${formattedValue}`;
      })
      .join('');
  }
  
  return String(value);
}

/**
 * Format a tool call for the kernel prompt.
 */
export function formatToolCall(toolCall: KernelToolCall): string {
  const lines: string[] = ['TOOL CALL:', `tool: ${toolCall.tool}`, 'arguments:'];
  
  for (const [key, value] of Object.entries(toolCall.arguments)) {
    const formattedValue = formatValue(value, 1);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      lines.push(`  ${key}:${formattedValue}`);
    } else {
      lines.push(`  ${key}: ${formattedValue}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Format a single condition.
 */
function formatCondition(condition: RuleCondition, indent: string): string {
  const lines: string[] = [
    `${indent}- field: ${condition.field}`,
    `${indent}  operator: ${condition.operator}`,
    `${indent}  value: ${formatValue(condition.value)}`,
  ];
  return lines.join('\n');
}

/**
 * Format rules for the kernel prompt.
 */
export function formatRules(rules: Rule[]): string {
  const lines: string[] = ['RULES:'];
  
  for (const rule of rules) {
    lines.push(`- id: ${rule.id}`);
    lines.push(`  name: ${rule.name}`);
    lines.push(`  enabled: ${rule.enabled}`);
    lines.push(`  severity: ${rule.severity}`);
    lines.push(`  action: ${rule.action}`);
    
    if (rule.tools && rule.tools.length > 0) {
      lines.push(`  tools: [${rule.tools.join(', ')}]`);
    }
    
    if (rule.conditions && rule.conditions.length > 0) {
      lines.push('  conditions:');
      for (const condition of rule.conditions) {
        lines.push(formatCondition(condition, '    '));
      }
    }
    
    if (rule.condition_groups && rule.condition_groups.length > 0) {
      lines.push('  condition_groups:');
      for (const group of rule.condition_groups) {
        lines.push('    - conditions:');
        for (const condition of group) {
          lines.push(formatCondition(condition, '        '));
        }
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Build the complete user prompt for kernel inference.
 */
export function buildPrompt(toolCall: KernelToolCall, rules: Rule[]): string {
  const toolCallSection = formatToolCall(toolCall);
  const rulesSection = formatRules(rules);
  
  return `${toolCallSection}\n\n${rulesSection}`;
}
