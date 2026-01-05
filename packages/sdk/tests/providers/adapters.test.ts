import { describe, it, expect } from 'vitest';
import {
  toOpenAI,
  fromOpenAI,
  fromOpenAIToolCall,
  toOpenAITools,
  toAnthropic,
  fromAnthropic,
  fromAnthropicToolUse,
  toAnthropicTools,
  toGoogleTool,
  fromGoogleFunctionCall,
  fromGoogleFunctionDeclaration,
  getAdapter,
} from '../../src/providers/adapters.js';
import type { ToolDefinition } from '../../src/types/tool.js';

const sampleTool: ToolDefinition = {
  name: 'get_weather',
  description: 'Get the current weather for a city',
  inputSchema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
      unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
    },
    required: ['city'],
  },
};

describe('OpenAI Adapter', () => {
  describe('toOpenAI', () => {
    it('should convert Veto tool to OpenAI format', () => {
      const result = toOpenAI(sampleTool);

      expect(result).toEqual({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather for a city',
          parameters: sampleTool.inputSchema,
        },
      });
    });

    it('should handle tool without description', () => {
      const tool: ToolDefinition = {
        name: 'simple_tool',
        inputSchema: { type: 'object' },
      };

      const result = toOpenAI(tool);

      expect(result.function.name).toBe('simple_tool');
      expect(result.function.description).toBeUndefined();
    });
  });

  describe('fromOpenAI', () => {
    it('should convert OpenAI tool to Veto format', () => {
      const openAITool = {
        type: 'function' as const,
        function: {
          name: 'search',
          description: 'Search the web',
          parameters: {
            type: 'object' as const,
            properties: { query: { type: 'string' as const } },
          },
        },
      };

      const result = fromOpenAI(openAITool);

      expect(result.name).toBe('search');
      expect(result.description).toBe('Search the web');
      expect(result.inputSchema).toEqual(openAITool.function.parameters);
    });

    it('should handle missing parameters', () => {
      const openAITool = {
        type: 'function' as const,
        function: {
          name: 'no_params',
          description: 'No parameters tool',
        },
      };

      const result = fromOpenAI(openAITool);

      expect(result.inputSchema).toEqual({ type: 'object' });
    });
  });

  describe('fromOpenAIToolCall', () => {
    it('should parse OpenAI tool call with valid JSON', () => {
      const toolCall = {
        id: 'call_abc123',
        type: 'function' as const,
        function: {
          name: 'get_weather',
          arguments: '{"city": "London", "unit": "celsius"}',
        },
      };

      const result = fromOpenAIToolCall(toolCall);

      expect(result.id).toBe('call_abc123');
      expect(result.name).toBe('get_weather');
      expect(result.arguments).toEqual({ city: 'London', unit: 'celsius' });
      expect(result.rawArguments).toBe('{"city": "London", "unit": "celsius"}');
    });

    it('should handle invalid JSON arguments', () => {
      const toolCall = {
        id: 'call_xyz',
        type: 'function' as const,
        function: {
          name: 'broken_tool',
          arguments: 'not valid json',
        },
      };

      const result = fromOpenAIToolCall(toolCall);

      expect(result.id).toBe('call_xyz');
      expect(result.name).toBe('broken_tool');
      expect(result.arguments).toEqual({});
    });
  });

  describe('toOpenAITools', () => {
    it('should convert multiple tools', () => {
      const tools: ToolDefinition[] = [
        sampleTool,
        { name: 'tool2', inputSchema: { type: 'object' } },
      ];

      const result = toOpenAITools(tools);

      expect(result).toHaveLength(2);
      expect(result[0].function.name).toBe('get_weather');
      expect(result[1].function.name).toBe('tool2');
    });
  });
});

describe('Anthropic Adapter', () => {
  describe('toAnthropic', () => {
    it('should convert Veto tool to Anthropic format', () => {
      const result = toAnthropic(sampleTool);

      expect(result).toEqual({
        name: 'get_weather',
        description: 'Get the current weather for a city',
        input_schema: sampleTool.inputSchema,
      });
    });
  });

  describe('fromAnthropic', () => {
    it('should convert Anthropic tool to Veto format', () => {
      const anthropicTool = {
        name: 'read_file',
        description: 'Read a file',
        input_schema: {
          type: 'object' as const,
          properties: { path: { type: 'string' as const } },
        },
      };

      const result = fromAnthropic(anthropicTool);

      expect(result.name).toBe('read_file');
      expect(result.description).toBe('Read a file');
      expect(result.inputSchema).toEqual(anthropicTool.input_schema);
    });
  });

  describe('fromAnthropicToolUse', () => {
    it('should convert Anthropic tool use to Veto format', () => {
      const toolUse = {
        type: 'tool_use' as const,
        id: 'toolu_01abc',
        name: 'get_weather',
        input: { city: 'Paris' },
      };

      const result = fromAnthropicToolUse(toolUse);

      expect(result.id).toBe('toolu_01abc');
      expect(result.name).toBe('get_weather');
      expect(result.arguments).toEqual({ city: 'Paris' });
    });
  });

  describe('toAnthropicTools', () => {
    it('should convert multiple tools', () => {
      const tools: ToolDefinition[] = [
        sampleTool,
        { name: 'tool2', inputSchema: { type: 'object' } },
      ];

      const result = toAnthropicTools(tools);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('get_weather');
      expect(result[1].name).toBe('tool2');
    });
  });
});

describe('Google Adapter', () => {
  describe('toGoogleTool', () => {
    it('should wrap tools in functionDeclarations', () => {
      const tools: ToolDefinition[] = [
        sampleTool,
        { name: 'search', description: 'Search', inputSchema: { type: 'object' } },
      ];

      const result = toGoogleTool(tools);

      expect(result.functionDeclarations).toHaveLength(2);
      expect(result.functionDeclarations[0].name).toBe('get_weather');
      expect(result.functionDeclarations[1].name).toBe('search');
    });
  });

  describe('fromGoogleFunctionDeclaration', () => {
    it('should convert Google function declaration to Veto format', () => {
      const func = {
        name: 'calculate',
        description: 'Calculate math',
        parameters: {
          type: 'object' as const,
          properties: { expression: { type: 'string' as const } },
        },
      };

      const result = fromGoogleFunctionDeclaration(func);

      expect(result.name).toBe('calculate');
      expect(result.description).toBe('Calculate math');
    });

    it('should handle missing parameters', () => {
      const func = {
        name: 'simple',
        description: 'Simple function',
      };

      const result = fromGoogleFunctionDeclaration(func);

      expect(result.inputSchema).toEqual({ type: 'object' });
    });
  });

  describe('fromGoogleFunctionCall', () => {
    it('should convert Google function call to Veto format', () => {
      const functionCall = {
        name: 'get_weather',
        args: { city: 'Tokyo' },
      };

      const result = fromGoogleFunctionCall(functionCall);

      expect(result.name).toBe('get_weather');
      expect(result.arguments).toEqual({ city: 'Tokyo' });
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^call_/);
    });
  });
});

describe('getAdapter', () => {
  it('should return OpenAI adapter', () => {
    const adapter = getAdapter('openai');

    expect(adapter.toProviderTool).toBe(toOpenAI);
    expect(adapter.fromProviderTool).toBe(fromOpenAI);
  });

  it('should return Anthropic adapter', () => {
    const adapter = getAdapter('anthropic');

    expect(adapter.toProviderTool).toBe(toAnthropic);
    expect(adapter.fromProviderTool).toBe(fromAnthropic);
  });

  it('should throw for Google adapter', () => {
    expect(() => getAdapter('google' as any)).toThrow(
      'Google adapter not available via getAdapter()'
    );
  });

  it('should throw for unknown provider', () => {
    // @ts-expect-error Testing invalid input
    expect(() => getAdapter('unknown')).toThrow('Unknown provider: unknown');
  });
});
