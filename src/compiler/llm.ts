// src/compiler/llm.ts

import { GoogleGenAI, Type } from '@google/genai';
import type { Policy } from '../types.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { COLORS } from '../ui/colors.js';

// Native JSON schema - GUARANTEES valid output from Gemini
// Using Type enum for proper schema typing
const POLICY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      enum: ['delete', 'modify', 'execute', 'read'],
      description: 'The action type this policy restricts',
    },
    include: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Glob patterns for protected files (can be empty for command-only policies)',
    },
    exclude: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Glob patterns for safe exceptions',
    },
    description: {
      type: Type.STRING,
      description: 'Human-readable description of what is protected',
    },
    commandRules: {
      type: Type.ARRAY,
      description: 'Optional command-level rules for tool/command preferences',
      items: {
        type: Type.OBJECT,
        properties: {
          block: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Glob patterns for commands to block (e.g., "npm install*", "sudo *")',
          },
          suggest: {
            type: Type.STRING,
            description: 'Optional suggestion for alternative command',
          },
          reason: {
            type: Type.STRING,
            description: 'Human-readable reason for blocking',
          },
        },
        required: ['block', 'reason'],
      },
    },
    contentRules: {
      type: Type.ARRAY,
      description: 'Optional content-level rules to check file contents for banned patterns',
      items: {
        type: Type.OBJECT,
        properties: {
          pattern: {
            type: Type.STRING,
            description: 'Regex pattern to match in file content (e.g., "import.*lodash", "console\\.log")',
          },
          fileTypes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'File patterns where this rule applies (e.g., ["*.ts", "*.js"])',
          },
          reason: {
            type: Type.STRING,
            description: 'Human-readable reason for blocking',
          },
          suggest: {
            type: Type.STRING,
            description: 'Optional suggestion for alternative',
          },
        },
        required: ['pattern', 'fileTypes', 'reason'],
      },
    },
    astRules: {
      type: Type.ARRAY,
      description: 'Optional AST-based rules for precise code pattern matching (TypeScript/JavaScript only)',
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: 'Unique identifier for this rule (e.g., "no-lodash-import")',
          },
          query: {
            type: Type.STRING,
            description: 'Tree-sitter S-expression query (e.g., "(import_statement source: (string) @s (#match? @s \\"lodash\\"))")',
          },
          languages: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Languages this rule applies to: ["typescript", "javascript"]',
          },
          reason: {
            type: Type.STRING,
            description: 'Human-readable reason for blocking',
          },
          suggest: {
            type: Type.STRING,
            description: 'Optional suggestion for alternative',
          },
          regexPreFilter: {
            type: Type.STRING,
            description: 'Fast pre-filter string - if content does not contain this, skip AST parsing',
          },
        },
        required: ['id', 'query', 'languages', 'reason'],
      },
    },
  },
  required: ['action', 'include', 'exclude', 'description'],
} as const;

let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export async function compileWithLLM(
  restriction: string,
  suggestedAction: Policy['action']
): Promise<Policy> {
  const client = getAI();

  const prompt = `${SYSTEM_PROMPT}

The user has indicated the action should be: "${suggestedAction}"

Restriction: "${restriction}"`;

  const MAX_RETRIES = 4;
  const INITIAL_DELAY = 4000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
        config: {
          temperature: 0,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
          responseSchema: POLICY_SCHEMA,
        },
      });
      
      const text = response.text;
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      const parsed = JSON.parse(text) as Policy;

      // Override action with suggested action if not present
      if (!parsed.action) {
        parsed.action = suggestedAction;
      }

      return parsed;

    } catch (error: any) {
      if (attempt === MAX_RETRIES) throw error;
      
      // Check for 429 Resource Exhausted or 503 Service Unavailable
      const isRateLimit = error.status === 429 || 
                          error.message?.includes('429') || 
                          error.message?.includes('RESOURCE_EXHAUSTED');
      
      const isServerOverload = error.status === 503 || error.message?.includes('503');

      if (!isRateLimit && !isServerOverload) throw error;

      // Calculate delay with jitter: delay * 2^attempt + random(0-1000ms)
      const delay = INITIAL_DELAY * Math.pow(2, attempt) + Math.random() * 1000;
      const seconds = Math.round(delay / 1000);
      
      console.log(`\n${COLORS.warning}Rate limit exceeded. Retrying in ${seconds}s...${COLORS.reset} (Attempt ${attempt + 1}/${MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}
