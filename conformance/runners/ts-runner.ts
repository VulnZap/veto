import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  ValidationEngine,
  createPassthroughValidator,
  createBlocklistValidator,
  createAllowlistValidator,
} from '../../packages/sdk/src/core/validator.js';
import { silentLogger } from '../../packages/sdk/src/utils/logger.js';
import type { NamedValidator, ValidationContext, ValidationResult } from '../../packages/sdk/src/types/config.js';

interface FixtureCase {
  id: string;
  name: string;
  description?: string;
  validators: ValidatorConfig[];
  default_decision?: 'allow' | 'deny';
  input: {
    tool_name: string;
    arguments: Record<string, unknown>;
  };
  expected: {
    decision: 'allow' | 'deny' | 'modify';
    reason_contains?: string;
    reason_absent?: boolean;
    validator_count?: number;
  };
}

interface ValidatorConfig {
  type: 'passthrough' | 'blocklist' | 'allowlist' | 'custom_allow' | 'custom_deny' | 'custom_throw';
  tools?: string[];
  reason?: string;
  priority?: number;
  tool_filter?: string[];
  custom_reason?: string;
}

interface FixtureSuite {
  suite: string;
  description?: string;
  cases: FixtureCase[];
}

function normalizeReason(reason: string): string {
  return reason.replace(/\s+/g, ' ').trim().toLowerCase();
}

function buildValidator(config: ValidatorConfig): NamedValidator {
  switch (config.type) {
    case 'passthrough':
      return {
        ...createPassthroughValidator(),
        ...(config.priority !== undefined && { priority: config.priority }),
        ...(config.tool_filter && { toolFilter: config.tool_filter }),
      };

    case 'blocklist':
      return {
        ...createBlocklistValidator(config.tools ?? [], config.reason),
        ...(config.priority !== undefined && { priority: config.priority }),
      };

    case 'allowlist':
      return {
        ...createAllowlistValidator(config.tools ?? [], config.reason),
        ...(config.priority !== undefined && { priority: config.priority }),
      };

    case 'custom_allow': {
      const reason = config.custom_reason ?? 'Allowed';
      return {
        name: `custom_allow_${config.priority ?? 100}`,
        priority: config.priority ?? 100,
        validate: (): ValidationResult => ({ decision: 'allow', reason }),
        ...(config.tool_filter && { toolFilter: config.tool_filter }),
      };
    }

    case 'custom_deny': {
      const reason = config.custom_reason ?? 'Denied';
      return {
        name: `custom_deny_${config.priority ?? 100}`,
        priority: config.priority ?? 100,
        validate: (): ValidationResult => ({ decision: 'deny', reason }),
        ...(config.tool_filter && { toolFilter: config.tool_filter }),
      };
    }

    case 'custom_throw': {
      const message = config.custom_reason ?? 'Error';
      return {
        name: `custom_throw_${config.priority ?? 100}`,
        priority: config.priority ?? 100,
        validate: (): ValidationResult => {
          throw new Error(message);
        },
        ...(config.tool_filter && { toolFilter: config.tool_filter }),
      };
    }

    default:
      throw new Error(`Unknown validator type: ${config.type}`);
  }
}

function buildContext(input: FixtureCase['input']): ValidationContext {
  return {
    toolName: input.tool_name,
    arguments: input.arguments ?? {},
    callId: 'conformance-test',
    timestamp: new Date(),
    callHistory: [],
  };
}

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith('.yaml'));

for (const file of fixtureFiles) {
  const content = readFileSync(join(fixturesDir, file), 'utf-8');
  const suite: FixtureSuite = parseYaml(content);

  describe(`[conformance] ${suite.suite}`, () => {
    for (const tc of suite.cases) {
      it(`${tc.id}: ${tc.name}`, async () => {
        const engine = new ValidationEngine({
          logger: silentLogger,
          defaultDecision: tc.default_decision ?? 'allow',
        });

        for (const vc of tc.validators) {
          engine.addValidator(buildValidator(vc));
        }

        const ctx = buildContext(tc.input);
        const result = await engine.validate(ctx);

        expect(result.finalResult.decision).toBe(tc.expected.decision);

        if (tc.expected.reason_absent) {
          expect(result.finalResult.reason).toBeUndefined();
        }

        if (tc.expected.reason_contains) {
          expect(result.finalResult.reason).toBeDefined();
          const normalized = normalizeReason(result.finalResult.reason!);
          const target = normalizeReason(tc.expected.reason_contains);
          expect(normalized).toContain(target);
        }

        if (tc.expected.validator_count !== undefined) {
          expect(result.validatorResults).toHaveLength(tc.expected.validator_count);
        }
      });
    }
  });
}
