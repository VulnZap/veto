// src/config/leash-parser.ts
// Simple plain-text .leash file parser
// Format: one policy per line, # for comments, ` - ` for optional reason

export interface LeashPolicy {
  raw: string;           // Original line: "no lodash - use native methods"
  restriction: string;   // The policy: "no lodash"
  reason?: string;       // Optional reason: "use native methods"
  extend?: string;       // Extend directive target: "@acme/strict"
}

/**
 * Parse a simple .leash file into policies.
 * 
 * Format:
 *   # Comment lines start with #
 *   no lodash
 *   no any types - enforces strict TypeScript
 *   extend @acme/typescript-strict
 */
export function parseLeashFile(content: string): LeashPolicy[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(parseLine);
}

function parseLine(line: string): LeashPolicy {
  // Handle extend directive
  if (line.startsWith('extend ')) {
    const target = line.slice(7).trim();
    return { raw: line, restriction: '', extend: target };
  }

  // Split by ' - ' for optional reason
  const dashIndex = line.indexOf(' - ');
  if (dashIndex !== -1) {
    const restriction = line.slice(0, dashIndex).trim();
    const reason = line.slice(dashIndex + 3).trim();
    return { raw: line, restriction, reason };
  }

  // Simple policy without reason
  return { raw: line, restriction: line };
}

/**
 * Detect if content is simple .leash format (not YAML).
 * YAML format has 'version:' or 'policies:' keys.
 */
export function isSimpleLeashFormat(content: string): boolean {
  const trimmed = content.trim();
  
  // Empty file = simple format (will result in no policies)
  if (!trimmed) return true;
  
  // Check first meaningful line
  const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length === 0) return true;
  
  // YAML indicators
  const firstLine = lines[0];
  if (firstLine.startsWith('version:')) return false;
  if (firstLine.startsWith('policies:')) return false;
  if (firstLine.startsWith('{')) return false;  // JSON
  
  return true;
}

/**
 * Convert parsed policies to the internal LeashConfig format.
 */
export function policiesToConfig(policies: LeashPolicy[]): { version: 1; policies: string[] } {
  return {
    version: 1,
    policies: policies
      .filter(p => p.restriction)  // Skip extend directives for now
      .map(p => p.restriction),
  };
}
