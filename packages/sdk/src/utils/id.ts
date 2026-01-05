/**
 * ID generation utilities for Veto.
 *
 * @module utils/id
 */

/**
 * Generate a random ID for tool calls.
 *
 * Creates a unique identifier suitable for tracking tool call instances.
 * Uses crypto.randomUUID when available, falls back to a custom implementation.
 *
 * @param prefix - Optional prefix for the ID
 * @returns A unique string ID
 *
 * @example
 * ```typescript
 * const callId = generateId('call');
 * // Returns something like: 'call_a1b2c3d4e5f6'
 * ```
 */
export function generateId(prefix = 'veto'): string {
  // Use crypto.randomUUID if available (Node 19+, modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    const uuid = crypto.randomUUID();
    return `${prefix}_${uuid.replace(/-/g, '').slice(0, 12)}`;
  }

  // Fallback for older environments
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${id}`;
}

/**
 * Generate a tool call ID in the format expected by providers.
 *
 * @returns A unique tool call ID
 */
export function generateToolCallId(): string {
  return generateId('call');
}
