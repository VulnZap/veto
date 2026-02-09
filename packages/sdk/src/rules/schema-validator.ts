import { createRequire } from 'node:module';
import { POLICY_IR_V1_SCHEMA } from './policy-ir-schema.js';

const require = createRequire(import.meta.url);

export class PolicySchemaError extends Error {
  readonly errors: PolicyValidationError[];

  constructor(errors: PolicyValidationError[]) {
    const summary = errors
      .map((e) => `  - ${e.path}: ${e.message}`)
      .join('\n');
    super(`Invalid policy document:\n${summary}`);
    this.name = 'PolicySchemaError';
    this.errors = errors;
  }
}

export interface PolicyValidationError {
  path: string;
  message: string;
  keyword: string;
}

interface AjvErrorObject {
  instancePath: string;
  message?: string;
  keyword: string;
}

interface ValidateFunction {
  (data: unknown): boolean;
  errors?: AjvErrorObject[] | null;
}

interface AjvInstance {
  compile(schema: object): ValidateFunction;
}

interface AjvConstructor {
  new (opts: { allErrors: boolean }): AjvInstance;
}

let _validate: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (!_validate) {
     
    const { Ajv2020 } = require('ajv/dist/2020') as { Ajv2020: AjvConstructor };
    const ajv = new Ajv2020({ allErrors: true });
    _validate = ajv.compile(POLICY_IR_V1_SCHEMA);
  }
  return _validate;
}

function formatErrors(errors: AjvErrorObject[]): PolicyValidationError[] {
  return errors.map((err) => ({
    path: err.instancePath || '/',
    message: err.message ?? `failed ${err.keyword} validation`,
    keyword: err.keyword,
  }));
}

export function validatePolicyIR(data: unknown): void {
  const validate = getValidator();
  const valid = validate(data);
  if (!valid && validate.errors) {
    throw new PolicySchemaError(formatErrors(validate.errors));
  }
}
