/**
 * Type definitions for YAML-based rules.
 *
 * Rules define restrictions on tools and agent behavior. They are loaded
 * from YAML files and used to validate tool calls via an external API.
 *
 * @module rules/types
 */

/**
 * Condition operators for rule matching.
 */
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'matches'  // Regex match
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in';

/**
 * A single condition within a rule.
 */
export interface RuleCondition {
  /** The field to check (supports dot notation, e.g., "arguments.path") */
  field: string;
  /** The operator to use for comparison */
  operator: ConditionOperator;
  /** The value to compare against */
  value: unknown;
}

/**
 * Action to take when a rule matches.
 */
export type RuleAction = 'block' | 'warn' | 'log' | 'allow';

/**
 * Severity level for a rule.
 */
export type RuleSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * A single rule definition.
 */
export interface Rule {
  /** Unique identifier for the rule */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description of what the rule does */
  description?: string;
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Severity level */
  severity: RuleSeverity;
  /** Default action when conditions match */
  action: RuleAction;
  /** Tools this rule applies to (empty = all tools) */
  tools?: string[];
  /** Conditions that must be met for the rule to trigger (AND logic) */
  conditions?: RuleCondition[];
  /** Alternative condition groups (OR logic between groups) */
  condition_groups?: RuleCondition[][];
  /** Tags for categorization */
  tags?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A rule set containing multiple rules with shared configuration.
 */
export interface RuleSet {
  /** Version of the rule set format */
  version: string;
  /** Name of the rule set */
  name: string;
  /** Description of the rule set */
  description?: string;
  /** Rules in this set */
  rules: Rule[];
  /** Global settings for this rule set */
  settings?: RuleSetSettings;
}

/**
 * Global settings for a rule set.
 */
export interface RuleSetSettings {
  /** Default action when no rules match */
  default_action?: RuleAction;
  /** Whether to fail open (allow) or closed (block) on errors */
  fail_mode?: 'open' | 'closed';
  /** Tags to apply to all rules in this set */
  global_tags?: string[];
}

/**
 * Context passed to the validation API.
 */
export interface ToolCallContext {
  /** Unique identifier for this tool call */
  call_id: string;
  /** Name of the tool being called */
  tool_name: string;
  /** Arguments passed to the tool */
  arguments: Record<string, unknown>;
  /** Timestamp of the call */
  timestamp: string;
  /** Session or conversation ID (if available) */
  session_id?: string;
  /** User or agent ID (if available) */
  agent_id?: string;
  /** Previous tool calls in this session */
  call_history?: ToolCallHistorySummary[];
  /** Custom context data */
  custom?: Record<string, unknown>;
}

/**
 * Summary of a previous tool call for history context.
 */
export interface ToolCallHistorySummary {
  /** Tool name */
  tool_name: string;
  /** Whether it was allowed */
  allowed: boolean;
  /** Timestamp */
  timestamp: string;
}

/**
 * Request payload sent to the validation API.
 */
export interface ValidationAPIRequest {
  /** The tool call context */
  context: ToolCallContext;
  /** Rules applicable to this tool call */
  rules: Rule[];
}

/**
 * Response from the validation API.
 */
export interface ValidationAPIResponse {
  /** Weight indicating confidence that the call should pass (0.0 - 1.0) */
  should_pass_weight: number;
  /** Weight indicating confidence that the call should be blocked (0.0 - 1.0) */
  should_block_weight: number;
  /** Final decision */
  decision: 'pass' | 'block';
  /** Human-readable reasoning for the decision */
  reasoning: string;
  /** Optional: IDs of rules that matched */
  matched_rules?: string[];
  /** Optional: Additional metadata from the API */
  metadata?: Record<string, unknown>;
}

/**
 * Loaded rules with their source information.
 */
export interface LoadedRules {
  /** All loaded rule sets */
  ruleSets: RuleSet[];
  /** All rules flattened from rule sets */
  allRules: Rule[];
  /** Rules indexed by tool name for quick lookup */
  rulesByTool: Map<string, Rule[]>;
  /** Global rules that apply to all tools */
  globalRules: Rule[];
  /** Source files that were loaded */
  sourceFiles: string[];
}

/**
 * Get rules applicable to a specific tool.
 */
export function getRulesForTool(
  loadedRules: LoadedRules,
  toolName: string
): Rule[] {
  const toolSpecific = loadedRules.rulesByTool.get(toolName) ?? [];
  return [...loadedRules.globalRules, ...toolSpecific].filter(
    (rule) => rule.enabled
  );
}

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Error thrown when rule/config schema validation fails.
 */
export class RuleSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleSchemaError';
  }
}

const VALID_ACTIONS: readonly RuleAction[] = ['block', 'warn', 'log', 'allow'];
const VALID_SEVERITIES: readonly RuleSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const VALID_OPERATORS: readonly ConditionOperator[] = [
  'equals', 'not_equals', 'contains', 'not_contains',
  'starts_with', 'ends_with', 'matches',
  'greater_than', 'less_than', 'in', 'not_in',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string, source: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RuleSchemaError(`Invalid ${field} in ${source}: expected non-empty string`);
  }
  return value;
}

function assertOptionalString(value: unknown, field: string, source: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new RuleSchemaError(`Invalid ${field} in ${source}: expected string`);
  }
  return value;
}

function assertStringArray(value: unknown, field: string, source: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new RuleSchemaError(`Invalid ${field} in ${source}: expected array`);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw new RuleSchemaError(`Invalid ${field}[${i}] in ${source}: expected string`);
    }
  }
  return value as string[];
}

/**
 * Validate regex pattern for ReDoS vulnerabilities.
 * Checks for dangerous patterns that can cause exponential backtracking.
 */
function validateRegexSafety(pattern: string, source: string): void {
  // Check for dangerous nested quantifiers that can cause ReDoS
  // These patterns look for quantifiers applied to groups/subpatterns that themselves contain quantifiers
  const dangerousPatterns = [
    /\([^)]*[*+][^)]*\)[*+{]/,       // (a+)+ or (a*)* or (a+){2,}
    /\([^)]*[*+][^)]*\)\?[*+{]/,     // (a+)?+ or (a*)?*
    /\([^)]*\{[^}]+\}[^)]*\)[*+{]/,  // (a{2,})+ or (a{1,})*
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      throw new RuleSchemaError(
        `Potentially unsafe regex pattern in ${source}: "${pattern}" contains nested quantifiers that may cause ReDoS attacks`
      );
    }
  }

  // Validate that the pattern compiles
  try {
    new RegExp(pattern);
  } catch (err) {
    throw new RuleSchemaError(
      `Invalid regex pattern in ${source}: "${pattern}" - ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Check pattern complexity (limit to 1000 characters)
  if (pattern.length > 1000) {
    throw new RuleSchemaError(
      `Regex pattern too long in ${source}: ${pattern.length} characters (max 1000)`
    );
  }
}

function parseRuleCondition(data: unknown, source: string): RuleCondition {
  if (!isRecord(data)) {
    throw new RuleSchemaError(`Invalid condition in ${source}: expected object`);
  }

  const field = assertNonEmptyString(data.field, 'field', source);
  const operator = assertNonEmptyString(data.operator, 'operator', source);

  if (!VALID_OPERATORS.includes(operator as ConditionOperator)) {
    throw new RuleSchemaError(
      `Invalid operator "${operator}" in ${source}: expected one of ${VALID_OPERATORS.join(', ')}`
    );
  }

  if (!Object.prototype.hasOwnProperty.call(data, 'value')) {
    throw new RuleSchemaError(`Missing value in ${source}`);
  }

  // Validate regex patterns for ReDoS vulnerabilities
  if (operator === 'matches' && typeof data.value === 'string') {
    validateRegexSafety(data.value, source);
  }

  return {
    field,
    operator: operator as ConditionOperator,
    value: data.value,
  };
}

/**
 * Parse and validate a single rule from parsed YAML data.
 * Throws RuleSchemaError if validation fails.
 */
export function parseRuleStrict(data: unknown, source: string): Rule {
  if (!isRecord(data)) {
    throw new RuleSchemaError(`Invalid rule in ${source}: expected object`);
  }

  const id = assertNonEmptyString(data.id, 'id', source);
  const name = assertNonEmptyString(data.name, 'name', source);
  const description = assertOptionalString(data.description, 'description', source);

  // enabled defaults to true
  let enabled = true;
  if (data.enabled !== undefined) {
    if (typeof data.enabled !== 'boolean') {
      throw new RuleSchemaError(`Invalid enabled in ${source}: expected boolean`);
    }
    enabled = data.enabled;
  }

  // severity is required
  const severityStr = assertNonEmptyString(data.severity, 'severity', source);
  if (!VALID_SEVERITIES.includes(severityStr as RuleSeverity)) {
    throw new RuleSchemaError(
      `Invalid severity "${severityStr}" in ${source}: expected one of ${VALID_SEVERITIES.join(', ')}`
    );
  }
  const severity = severityStr as RuleSeverity;

  // action is required
  const actionStr = assertNonEmptyString(data.action, 'action', source);
  if (!VALID_ACTIONS.includes(actionStr as RuleAction)) {
    throw new RuleSchemaError(
      `Invalid action "${actionStr}" in ${source}: expected one of ${VALID_ACTIONS.join(', ')}`
    );
  }
  const action = actionStr as RuleAction;

  const tools = assertStringArray(data.tools, 'tools', source);
  const tags = assertStringArray(data.tags, 'tags', source);

  // Parse conditions
  let conditions: RuleCondition[] | undefined;
  if (data.conditions !== undefined) {
    if (!Array.isArray(data.conditions)) {
      throw new RuleSchemaError(`Invalid conditions in ${source}: expected array`);
    }
    conditions = data.conditions.map((c, i) =>
      parseRuleCondition(c, `${source}.conditions[${i}]`)
    );
  }

  // Parse condition_groups
  let condition_groups: RuleCondition[][] | undefined;
  if (data.condition_groups !== undefined) {
    if (!Array.isArray(data.condition_groups)) {
      throw new RuleSchemaError(`Invalid condition_groups in ${source}: expected array`);
    }
    condition_groups = data.condition_groups.map((group, gi) => {
      if (!Array.isArray(group)) {
        throw new RuleSchemaError(`Invalid condition_groups[${gi}] in ${source}: expected array`);
      }
      return group.map((c, ci) =>
        parseRuleCondition(c, `${source}.condition_groups[${gi}][${ci}]`)
      );
    });
  }

  // metadata must be an object if present
  let metadata: Record<string, unknown> | undefined;
  if (data.metadata !== undefined) {
    if (!isRecord(data.metadata)) {
      throw new RuleSchemaError(`Invalid metadata in ${source}: expected object`);
    }
    metadata = data.metadata;
  }

  return {
    id,
    name,
    description,
    enabled,
    severity,
    action,
    tools,
    conditions,
    condition_groups,
    tags,
    metadata,
  };
}

/**
 * Parse and validate a rule set from parsed YAML data.
 * Supports: array of rules, object with rules array, or single rule object.
 * Throws RuleSchemaError if validation fails.
 */
export function parseRuleSetStrict(data: unknown, source: string): RuleSet {
  // Array of rules
  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new RuleSchemaError(`Empty rules array in ${source}`);
    }
    return {
      version: '1.0',
      name: source,
      rules: data.map((r, i) => parseRuleStrict(r, `${source}[${i}]`)),
    };
  }

  if (!isRecord(data)) {
    throw new RuleSchemaError(`Invalid rule file ${source}: expected object or array`);
  }

  // Object with rules array
  if (Array.isArray(data.rules)) {
    if (data.rules.length === 0) {
      throw new RuleSchemaError(`Empty rules array in ${source}`);
    }

    const version = typeof data.version === 'string' ? data.version : '1.0';
    const name = typeof data.name === 'string' ? data.name : source;
    const description = assertOptionalString(data.description, 'description', source);

    // Validate settings if present
    let settings: RuleSetSettings | undefined;
    if (data.settings !== undefined) {
      if (!isRecord(data.settings)) {
        throw new RuleSchemaError(`Invalid settings in ${source}: expected object`);
      }
      const s = data.settings;

      let default_action: RuleAction | undefined;
      if (s.default_action !== undefined) {
        const da = assertNonEmptyString(s.default_action, 'settings.default_action', source);
        if (!VALID_ACTIONS.includes(da as RuleAction)) {
          throw new RuleSchemaError(
            `Invalid settings.default_action "${da}" in ${source}: expected one of ${VALID_ACTIONS.join(', ')}`
          );
        }
        default_action = da as RuleAction;
      }

      let fail_mode: 'open' | 'closed' | undefined;
      if (s.fail_mode !== undefined) {
        if (s.fail_mode !== 'open' && s.fail_mode !== 'closed') {
          throw new RuleSchemaError(
            `Invalid settings.fail_mode in ${source}: expected "open" or "closed"`
          );
        }
        fail_mode = s.fail_mode;
      }

      const global_tags = assertStringArray(s.global_tags, 'settings.global_tags', source);

      settings = { default_action, fail_mode, global_tags };
    }

    return {
      version,
      name,
      description,
      rules: data.rules.map((r, i) => parseRuleStrict(r, `${source}.rules[${i}]`)),
      settings,
    };
  }

  // Single rule object
  if ('id' in data || 'name' in data) {
    return {
      version: '1.0',
      name: source,
      rules: [parseRuleStrict(data, source)],
    };
  }

  throw new RuleSchemaError(`Invalid rule file ${source}: no rules found`);
}
