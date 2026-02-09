/**
 * Tokenizer for policy expressions.
 *
 * @module compiler/lexer
 */

export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'IDENTIFIER'
  | 'DOT'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'LPAREN'
  | 'RPAREN'
  | 'STAR'
  | 'PLUS'
  | 'MINUS'
  | 'SLASH'
  | 'EQ'
  | 'NEQ'
  | 'LT'
  | 'GT'
  | 'LTE'
  | 'GTE'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'IN'
  | 'NOT_IN'
  | 'CONTAINS'
  | 'MATCHES'
  | 'COMMA'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const KEYWORDS: Record<string, TokenType> = {
  true: 'BOOLEAN',
  false: 'BOOLEAN',
  in: 'IN',
  not_in: 'NOT_IN',
  contains: 'CONTAINS',
  matches: 'MATCHES',
};

export class LexerError extends Error {
  constructor(
    message: string,
    public readonly pos: number,
  ) {
    super(`${message} at position ${pos}`);
    this.name = 'LexerError';
  }
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    const start = i;
    const ch = input[i];

    // single-char tokens
    if (ch === '.') { tokens.push({ type: 'DOT', value: '.', pos: start }); i++; continue; }
    if (ch === '[') { tokens.push({ type: 'LBRACKET', value: '[', pos: start }); i++; continue; }
    if (ch === ']') { tokens.push({ type: 'RBRACKET', value: ']', pos: start }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(', pos: start }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')', pos: start }); i++; continue; }
    if (ch === '*') { tokens.push({ type: 'STAR', value: '*', pos: start }); i++; continue; }
    if (ch === '+') { tokens.push({ type: 'PLUS', value: '+', pos: start }); i++; continue; }
    if (ch === '-') { tokens.push({ type: 'MINUS', value: '-', pos: start }); i++; continue; }
    if (ch === '/') { tokens.push({ type: 'SLASH', value: '/', pos: start }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ',', pos: start }); i++; continue; }

    // two-char operators
    if (ch === '=' && input[i + 1] === '=') { tokens.push({ type: 'EQ', value: '==', pos: start }); i += 2; continue; }
    if (ch === '!' && input[i + 1] === '=') { tokens.push({ type: 'NEQ', value: '!=', pos: start }); i += 2; continue; }
    if (ch === '<' && input[i + 1] === '=') { tokens.push({ type: 'LTE', value: '<=', pos: start }); i += 2; continue; }
    if (ch === '>' && input[i + 1] === '=') { tokens.push({ type: 'GTE', value: '>=', pos: start }); i += 2; continue; }
    if (ch === '&' && input[i + 1] === '&') { tokens.push({ type: 'AND', value: '&&', pos: start }); i += 2; continue; }
    if (ch === '|' && input[i + 1] === '|') { tokens.push({ type: 'OR', value: '||', pos: start }); i += 2; continue; }

    // single-char < > !
    if (ch === '<') { tokens.push({ type: 'LT', value: '<', pos: start }); i++; continue; }
    if (ch === '>') { tokens.push({ type: 'GT', value: '>', pos: start }); i++; continue; }
    if (ch === '!') { tokens.push({ type: 'NOT', value: '!', pos: start }); i++; continue; }

    // numbers
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num, pos: start });
      continue;
    }

    // strings (single or double quotes)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++; // skip opening quote
      let str = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++;
          if (input[i] === 'n') str += '\n';
          else if (input[i] === 't') str += '\t';
          else if (input[i] === '\\') str += '\\';
          else if (input[i] === quote) str += quote;
          else str += '\\' + input[i];
        } else {
          str += input[i];
        }
        i++;
      }
      if (i >= input.length) {
        throw new LexerError('Unterminated string literal', start);
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str, pos: start });
      continue;
    }

    // identifiers and keywords
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      const keywordType = KEYWORDS[ident];
      if (keywordType) {
        tokens.push({ type: keywordType, value: ident, pos: start });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: ident, pos: start });
      }
      continue;
    }

    throw new LexerError(`Unexpected character '${ch}'`, start);
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}
