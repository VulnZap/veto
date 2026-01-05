/**
 * CLI module exports.
 *
 * @module cli
 */

export { init, isInitialized, getVetoDir, type InitOptions, type InitResult } from './init.js';
export {
  loadVetoConfig,
  findVetoDir,
  loadEnvOverrides,
  type VetoConfigFile,
  type LoadedVetoConfig,
  type LoadConfigOptions,
} from './config.js';
export { DEFAULT_CONFIG, DEFAULT_RULES } from './templates.js';
