#!/usr/bin/env node
/**
 * AST Validation CLI
 * 
 * Called by native validators (Python/shell) to perform AST-based content checking.
 * 
 * Usage:
 *   echo '{"file":"test.ts","content":"...","restriction":"no lodash"}' | node validate-cli.js
 * 
 * Input (JSON on stdin):
 *   - file: File path (used for language detection)
 *   - content: File content to check
 *   - restriction: The policy description (e.g., "no lodash", "no any")
 * 
 * Output (JSON on stdout):
 *   - allowed: boolean
 *   - match?: { line, column, text, reason, suggest, ruleId }
 *   - method: 'ast' | 'skipped'
 */

import { checkContentAST } from './checker.js';
import { initParser, loadLanguage, detectLanguage } from './parser.js';
import type { Policy } from '../types.js';

interface ValidateInput {
  file: string;
  content: string;
  restriction: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  try {
    // Initialize parser
    await initParser();
    
    // Read input
    const inputText = await readStdin();
    if (!inputText.trim()) {
      console.log(JSON.stringify({ allowed: true, method: 'skipped', error: 'Empty input' }));
      return;
    }

    const input: ValidateInput = JSON.parse(inputText);
    const { file, content, restriction } = input;

    if (!file || !content || !restriction) {
      console.log(JSON.stringify({ allowed: true, method: 'skipped', error: 'Missing required fields' }));
      return;
    }

    // Detect language and load parser
    const language = detectLanguage(file);
    if (!language) {
      console.log(JSON.stringify({ allowed: true, method: 'skipped', reason: 'Unsupported file type' }));
      return;
    }

    await loadLanguage(language);

    // Create policy from restriction
    const policy: Policy = {
      action: 'modify',
      include: ['**/*'],
      exclude: [],
      description: restriction,
    };

    // Run AST check
    const result = await checkContentAST(content, file, policy);
    console.log(JSON.stringify(result));
  } catch (error) {
    // On any error, allow (fail open) but log error
    console.log(JSON.stringify({
      allowed: true,
      method: 'skipped',
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

main();
