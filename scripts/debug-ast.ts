#!/usr/bin/env npx tsx
/**
 * Debug script to examine actual tree-sitter AST structure.
 * Run with: npx tsx scripts/debug-ast.ts
 */
import { initParser, loadLanguage, parseFile, resetParserState } from '../src/ast/parser.js';
import { Query } from 'web-tree-sitter';

async function printAST(code: string, lang: 'typescript' | 'javascript' = 'typescript') {
  console.log('\n' + '='.repeat(60));
  console.log('CODE:', code);
  console.log('='.repeat(60));
  
  const { tree } = await parseFile(code, `test.${lang === 'typescript' ? 'ts' : 'js'}`, lang);
  
  function printNode(node: any, indent = 0) {
    const prefix = '  '.repeat(indent);
    const fieldName = node.parent ? 
      Array.from({ length: node.parent.childCount }, (_, i) => {
        const child = node.parent.child(i);
        if (child?.id === node.id) {
          return node.parent.fieldNameForChild(i);
        }
        return null;
      }).find(f => f) : null;
    
    const fieldStr = fieldName ? `[${fieldName}] ` : '';
    console.log(`${prefix}${fieldStr}(${node.type}) ${node.isNamed ? '' : `"${node.text}"`}${node.childCount === 0 && node.isNamed ? ` = "${node.text}"` : ''}`);
    
    for (let i = 0; i < node.childCount; i++) {
      printNode(node.child(i), indent + 1);
    }
  }
  
  printNode(tree.rootNode);
  console.log('\nS-expression:', tree.rootNode.toString());
}

async function testQuery(code: string, queryStr: string, lang: 'typescript' | 'javascript' = 'typescript') {
  console.log('\n' + '-'.repeat(60));
  console.log('TESTING QUERY on:', code);
  console.log('QUERY:', queryStr.replace(/\s+/g, ' ').trim());
  
  const { tree } = await parseFile(code, `test.${lang === 'typescript' ? 'ts' : 'js'}`, lang);
  const language = await loadLanguage(lang);
  
  try {
    const query = new Query(language, queryStr);
    const matches = query.matches(tree.rootNode);
    console.log('MATCHES:', matches.length);
    for (const match of matches) {
      console.log('  Pattern:', match.patternIndex);
      for (const capture of match.captures) {
        console.log(`    @${capture.name}: "${capture.node.text}" (${capture.node.type}) line ${capture.node.startPosition.row + 1}`);
      }
    }
  } catch (e: any) {
    console.log('QUERY ERROR:', e.message);
  }
}

async function main() {
  // Reset all state to ensure clean loading
  resetParserState();
  
  await initParser();
  await loadLanguage('typescript');
  await loadLanguage('javascript');
  
  console.log('\n\n========== IMPORT STATEMENTS ==========\n');
  
  // Default import
  await printAST(`import _ from 'lodash';`);
  
  // Named import
  await printAST(`import { map, filter } from 'lodash';`);
  
  // Submodule import
  await printAST(`import map from 'lodash/map';`);
  
  // Require
  await printAST(`const _ = require('lodash');`);
  
  console.log('\n\n========== TYPE ANNOTATIONS ==========\n');
  
  // any type annotation
  await printAST(`function foo(x: any): void {}`);
  
  // any in generic
  await printAST(`const arr: Array<any> = [];`);
  
  // as any
  await printAST(`const x = value as any;`);
  
  console.log('\n\n========== CONSOLE ==========\n');
  
  // console.log
  await printAST(`console.log('test');`);
  
  // console.error
  await printAST(`console.error('error');`);
  
  console.log('\n\n========== TESTING WORKING QUERIES ==========\n');
  
  // Test the import query that works
  await testQuery(
    `import _ from 'lodash';`,
    `(import_statement source: (string) @source (#match? @source "lodash"))`
  );
  
  // Test named import
  await testQuery(
    `import { map } from 'lodash';`,
    `(import_statement source: (string) @source (#match? @source "lodash"))`
  );
  
  console.log('\n\n========== FIXING ANY QUERIES ==========\n');
  
  // Let's see the exact structure of type annotations
  await testQuery(
    `function foo(x: any): void {}`,
    `(type_annotation (predefined_type) @type (#eq? @type "any"))`
  );
  
  // Try without field name
  await testQuery(
    `function foo(x: any): void {}`,
    `(predefined_type) @type (#eq? @type "any")`
  );
  
  // Check if it's type_identifier instead
  await testQuery(
    `function foo(x: any): void {}`,
    `(type_identifier) @type (#eq? @type "any")`
  );
  
  console.log('\n\n========== CONSOLE QUERIES ==========\n');
  
  await testQuery(
    `console.log('test');`,
    `(call_expression function: (member_expression object: (identifier) @obj (#eq? @obj "console") property: (property_identifier) @prop (#eq? @prop "log")))`
  );
  
  // Simpler query
  await testQuery(
    `console.log('test');`,
    `(call_expression function: (member_expression object: (identifier) @obj property: (property_identifier) @prop) (#eq? @obj "console") (#eq? @prop "log"))`
  );
}

main().catch(console.error);
