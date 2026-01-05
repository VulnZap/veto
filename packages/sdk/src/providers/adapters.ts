/**
 * Provider adapters for converting between Veto's format and provider formats.
 *
 * These adapters enable Veto to work transparently with different AI providers
 * while maintaining a consistent internal representation.
 *
 * @module providers/adapters
 */

import type { ToolDefinition, ToolCall } from '../types/tool.js';
import type {
  Provider,
  OpenAITool,
  OpenAIToolCall,
  AnthropicTool,
  AnthropicToolUse,
  GoogleTool,
  GoogleFunctionDeclaration,
  GoogleFunctionCall,
} from './types.js';
import { generateToolCallId } from '../utils/id.js';

// ============================================================================
// OpenAI Adapter
// ============================================================================

/**
 * Convert Veto tool definition to OpenAI format.
 *
 * @param tool - Veto tool definition
 * @returns OpenAI tool format
 *
 * @example
 * ```typescript
 * const openAITool = toOpenAI({
 *   name: 'get_weather',
 *   description: 'Get current weather',
 *   inputSchema: { type: 'object', properties: { city: { type: 'string' } } }
 * });
 * ```
 */
export function toOpenAI(tool: ToolDefinition): OpenAITool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

/**
 * Convert OpenAI tool format to Veto definition.
 *
 * @param tool - OpenAI tool
 * @returns Veto tool definition
 */
export function fromOpenAI(tool: OpenAITool): ToolDefinition {
  return {
    name: tool.function.name,
    description: tool.function.description,
    inputSchema: tool.function.parameters ?? { type: 'object' },
  };
}

/**
 * Convert OpenAI tool call to Veto format.
 *
 * @param toolCall - OpenAI tool call from API response
 * @returns Veto tool call
 */
export function fromOpenAIToolCall(toolCall: OpenAIToolCall): ToolCall {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    args = {};
  }

  return {
    id: toolCall.id,
    name: toolCall.function.name,
    arguments: args,
    rawArguments: toolCall.function.arguments,
  };
}

/**
 * Convert multiple Veto tools to OpenAI format.
 *
 * @param tools - Veto tool definitions
 * @returns OpenAI tools array
 */
export function toOpenAITools(tools: readonly ToolDefinition[]): OpenAITool[] {
  return tools.map(toOpenAI);
}

// ============================================================================
// Anthropic Adapter
// ============================================================================

/**
 * Convert Veto tool definition to Anthropic format.
 *
 * @param tool - Veto tool definition
 * @returns Anthropic tool format
 *
 * @example
 * ```typescript
 * const anthropicTool = toAnthropic({
 *   name: 'get_weather',
 *   description: 'Get current weather',
 *   inputSchema: { type: 'object', properties: { city: { type: 'string' } } }
 * });
 * ```
 */
export function toAnthropic(tool: ToolDefinition): AnthropicTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

/**
 * Convert Anthropic tool format to Veto definition.
 *
 * @param tool - Anthropic tool
 * @returns Veto tool definition
 */
export function fromAnthropic(tool: AnthropicTool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema,
  };
}

/**
 * Convert Anthropic tool use to Veto format.
 *
 * @param toolUse - Anthropic tool use block from API response
 * @returns Veto tool call
 */
export function fromAnthropicToolUse(toolUse: AnthropicToolUse): ToolCall {
  return {
    id: toolUse.id,
    name: toolUse.name,
    arguments: toolUse.input,
  };
}

/**
 * Convert multiple Veto tools to Anthropic format.
 *
 * @param tools - Veto tool definitions
 * @returns Anthropic tools array
 */
export function toAnthropicTools(tools: readonly ToolDefinition[]): AnthropicTool[] {
  return tools.map(toAnthropic);
}

// ============================================================================
// Google (Gemini) Adapter
// ============================================================================

/**
 * Convert Veto tool definition to Google function declaration.
 *
 * @param tool - Veto tool definition
 * @returns Google function declaration
 */
export function toGoogleFunctionDeclaration(
  tool: ToolDefinition
): GoogleFunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  };
}

/**
 * Convert Veto tools to Google tool format.
 *
 * Google's format wraps all function declarations in a single tool object.
 *
 * @param tools - Veto tool definitions
 * @returns Google tool with function declarations
 *
 * @example
 * ```typescript
 * const googleTool = toGoogleTool([
 *   { name: 'get_weather', ... },
 *   { name: 'search', ... }
 * ]);
 * // { functionDeclarations: [...] }
 * ```
 */
export function toGoogleTool(tools: readonly ToolDefinition[]): GoogleTool {
  return {
    functionDeclarations: tools.map(toGoogleFunctionDeclaration),
  };
}

/**
 * Convert Google function declaration to Veto definition.
 *
 * @param func - Google function declaration
 * @returns Veto tool definition
 */
export function fromGoogleFunctionDeclaration(
  func: GoogleFunctionDeclaration
): ToolDefinition {
  return {
    name: func.name,
    description: func.description,
    inputSchema: func.parameters ?? { type: 'object' },
  };
}

/**
 * Convert Google tool to Veto definitions.
 *
 * @param tool - Google tool with function declarations
 * @returns Array of Veto tool definitions
 */
export function fromGoogleTool(tool: GoogleTool): ToolDefinition[] {
  return tool.functionDeclarations.map(fromGoogleFunctionDeclaration);
}

/**
 * Convert Google function call to Veto format.
 *
 * @param functionCall - Google function call from API response
 * @returns Veto tool call
 */
export function fromGoogleFunctionCall(functionCall: GoogleFunctionCall): ToolCall {
  return {
    id: generateToolCallId(),
    name: functionCall.name,
    arguments: functionCall.args,
  };
}

// ============================================================================
// Generic Adapter Factory
// ============================================================================

/**
 * Adapter interface for converting between formats.
 */
export interface ProviderAdapter<TTool, TToolCall> {
  /** Convert Veto tool to provider format */
  toProviderTool(tool: ToolDefinition): TTool;
  /** Convert provider tool to Veto format */
  fromProviderTool(tool: TTool): ToolDefinition;
  /** Convert provider tool call to Veto format */
  fromProviderToolCall(toolCall: TToolCall): ToolCall;
  /** Convert multiple Veto tools to provider format */
  toProviderTools(tools: readonly ToolDefinition[]): TTool[];
}

/**
 * OpenAI adapter instance.
 */
export const openAIAdapter: ProviderAdapter<OpenAITool, OpenAIToolCall> = {
  toProviderTool: toOpenAI,
  fromProviderTool: fromOpenAI,
  fromProviderToolCall: fromOpenAIToolCall,
  toProviderTools: toOpenAITools,
};

/**
 * Anthropic adapter instance.
 */
export const anthropicAdapter: ProviderAdapter<AnthropicTool, AnthropicToolUse> = {
  toProviderTool: toAnthropic,
  fromProviderTool: fromAnthropic,
  fromProviderToolCall: fromAnthropicToolUse,
  toProviderTools: toAnthropicTools,
};

/**
 * Get an adapter for a specific provider.
 *
 * @param provider - Provider name
 * @returns Provider adapter
 * @throws Error if provider is not supported
 *
 * @example
 * ```typescript
 * const adapter = getAdapter('openai');
 * const providerTools = adapter.toProviderTools(vetoTools);
 * ```
 */
export function getAdapter(
  provider: 'openai'
): ProviderAdapter<OpenAITool, OpenAIToolCall>;
export function getAdapter(
  provider: 'anthropic'
): ProviderAdapter<AnthropicTool, AnthropicToolUse>;
export function getAdapter(
  provider: Provider
): ProviderAdapter<unknown, unknown> {
  switch (provider) {
    case 'openai':
      return openAIAdapter;
    case 'anthropic':
      return anthropicAdapter;
    case 'google':
      throw new Error(
        'Google adapter not available via getAdapter(). Use toGoogleTool() and fromGoogleFunctionCall() directly.'
      );
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
