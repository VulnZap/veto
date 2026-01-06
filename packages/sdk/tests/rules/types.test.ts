import { describe, it, expect } from 'vitest';
import { parseRuleStrict, parseRuleSetStrict, RuleSchemaError } from '../../src/rules/types.js';

describe('Rule Schema Validation', () => {
  describe('ReDoS Protection', () => {
    it('should block nested quantifier pattern (a+)+', () => {
      const rule = {
        id: 'test-redos-1',
        name: 'Test ReDoS',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.input',
            operator: 'matches',
            value: '(a+)+',
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/nested quantifiers/);
    });

    it('should block nested quantifier pattern (a*)*', () => {
      const rule = {
        id: 'test-redos-2',
        name: 'Test ReDoS',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.input',
            operator: 'matches',
            value: '(a*)*',
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/nested quantifiers/);
    });

    it('should block nested quantifier pattern (a+){2,}', () => {
      const rule = {
        id: 'test-redos-3',
        name: 'Test ReDoS',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.input',
            operator: 'matches',
            value: '(a+){2,}',
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/nested quantifiers/);
    });

    it('should block nested quantifier with optional (a+)?+', () => {
      const rule = {
        id: 'test-redos-4',
        name: 'Test ReDoS',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.input',
            operator: 'matches',
            value: '(a+)?+',
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/nested quantifiers/);
    });

    it('should block invalid regex syntax', () => {
      const rule = {
        id: 'test-invalid-regex',
        name: 'Test Invalid Regex',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.input',
            operator: 'matches',
            value: '(unclosed',
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/Invalid regex pattern/);
    });

    it('should block regex patterns longer than 1000 characters', () => {
      const longPattern = 'a'.repeat(1001);
      const rule = {
        id: 'test-long-regex',
        name: 'Test Long Regex',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.input',
            operator: 'matches',
            value: longPattern,
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/too long/);
    });

    it('should allow safe regex patterns', () => {
      const rule = {
        id: 'test-safe-regex',
        name: 'Test Safe Regex',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.path',
            operator: 'matches',
            value: '^/etc/.*',
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).not.toThrow();
    });

    it('should allow complex but safe regex patterns', () => {
      const rule = {
        id: 'test-complex-safe',
        name: 'Test Complex Safe',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.email',
            operator: 'matches',
            value: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).not.toThrow();
    });

    it('should only validate regex for matches operator', () => {
      const rule = {
        id: 'test-non-regex',
        name: 'Test Non-Regex',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.path',
            operator: 'contains',
            value: '(a+)+',
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).not.toThrow();
    });

    it('should handle non-string values for matches operator', () => {
      const rule = {
        id: 'test-non-string',
        name: 'Test Non-String',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.count',
            operator: 'matches',
            value: 123,
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).not.toThrow();
    });
  });

  describe('Basic Rule Validation', () => {
    it('should parse valid rule', () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.path',
            operator: 'starts_with',
            value: '/etc',
          },
        ],
      };

      const parsed = parseRuleStrict(rule, 'test.yaml');
      expect(parsed.id).toBe('test-rule');
      expect(parsed.name).toBe('Test Rule');
      expect(parsed.enabled).toBe(true);
      expect(parsed.severity).toBe('high');
      expect(parsed.action).toBe('block');
      expect(parsed.conditions).toHaveLength(1);
    });

    it('should reject rule with missing id', () => {
      const rule = {
        name: 'Test Rule',
        enabled: true,
        severity: 'high',
        action: 'block',
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/id/);
    });

    it('should reject rule with invalid severity', () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        enabled: true,
        severity: 'invalid',
        action: 'block',
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/severity/);
    });

    it('should reject rule with invalid action', () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        enabled: true,
        severity: 'high',
        action: 'invalid',
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/action/);
    });

    it('should reject condition with invalid operator', () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.path',
            operator: 'invalid_op',
            value: '/etc',
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/operator/);
    });

    it('should reject condition with missing value', () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        enabled: true,
        severity: 'high',
        action: 'block',
        conditions: [
          {
            field: 'arguments.path',
            operator: 'starts_with',
          },
        ],
      };

      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleStrict(rule, 'test.yaml')).toThrow(/value/);
    });
  });

  describe('RuleSet Validation', () => {
    it('should parse rule set with rules array', () => {
      const ruleSet = {
        version: '1.0',
        name: 'Test Rules',
        rules: [
          {
            id: 'rule-1',
            name: 'Rule 1',
            enabled: true,
            severity: 'high',
            action: 'block',
          },
        ],
      };

      const parsed = parseRuleSetStrict(ruleSet, 'test.yaml');
      expect(parsed.version).toBe('1.0');
      expect(parsed.name).toBe('Test Rules');
      expect(parsed.rules).toHaveLength(1);
    });

    it('should parse array of rules', () => {
      const rules = [
        {
          id: 'rule-1',
          name: 'Rule 1',
          enabled: true,
          severity: 'high',
          action: 'block',
        },
        {
          id: 'rule-2',
          name: 'Rule 2',
          enabled: true,
          severity: 'medium',
          action: 'warn',
        },
      ];

      const parsed = parseRuleSetStrict(rules, 'test.yaml');
      expect(parsed.rules).toHaveLength(2);
    });

    it('should reject empty rules array', () => {
      const ruleSet = {
        version: '1.0',
        name: 'Test Rules',
        rules: [],
      };

      expect(() => parseRuleSetStrict(ruleSet, 'test.yaml')).toThrow(RuleSchemaError);
      expect(() => parseRuleSetStrict(ruleSet, 'test.yaml')).toThrow(/Empty rules array/);
    });
  });
});
