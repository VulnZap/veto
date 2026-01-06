export interface ValidationResponse {
  pass_weight: number;
  block_weight: number;
  decision: 'pass' | 'block';
  reasoning: string;
  matched_rules?: string[];
}

export class ResponseParseError extends Error {
  constructor(
    message: string,
    public readonly rawContent: string
  ) {
    super(message);
    this.name = 'ResponseParseError';
  }
}

export function parseValidationResponse(content: string): ValidationResponse {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new ResponseParseError('No JSON found in response', content);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new ResponseParseError('Invalid JSON in response', content);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ResponseParseError('Response is not an object', content);
  }

  const response = parsed as Record<string, unknown>;

  if (typeof response.pass_weight !== 'number') {
    throw new ResponseParseError('Missing or invalid pass_weight', content);
  }
  if (typeof response.block_weight !== 'number') {
    throw new ResponseParseError('Missing or invalid block_weight', content);
  }
  if (response.decision !== 'pass' && response.decision !== 'block') {
    throw new ResponseParseError('Missing or invalid decision', content);
  }
  if (typeof response.reasoning !== 'string') {
    throw new ResponseParseError('Missing or invalid reasoning', content);
  }

  const result: ValidationResponse = {
    pass_weight: response.pass_weight,
    block_weight: response.block_weight,
    decision: response.decision,
    reasoning: response.reasoning,
  };

  if (Array.isArray(response.matched_rules)) {
    result.matched_rules = response.matched_rules.filter(
      (r): r is string => typeof r === 'string'
    );
  }

  return result;
}
