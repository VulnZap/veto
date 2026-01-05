// src/config/loader.ts
// Load and parse .leash configuration files

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import {
  validateConfig,
  generateSimpleLeash,
  DEFAULT_SETTINGS,
  DEFAULT_SIMPLE_POLICIES,
  type LeashConfig,
  type CompiledLeashConfig,
} from './schema.js';
import { compile } from '../compiler/index.js';
import { COLORS, SYMBOLS, createSpinner } from '../ui/colors.js';
import { parseLeashFile, isSimpleLeashFormat, policiesToConfig } from './leash-parser.js';

const LEASH_FILE = '.leash';
const LEASH_YAML = '.leash.yaml';
const LEASH_YML = '.leash.yml';
const LEASH_JSON = '.leash.json';

/**
 * Find .leash config file in current directory
 */
export function findLeashConfig(dir: string = process.cwd()): string | null {
  const candidates = [LEASH_FILE, LEASH_YAML, LEASH_YML, LEASH_JSON];
  
  for (const name of candidates) {
    const path = join(dir, name);
    if (existsSync(path)) {
      return path;
    }
  }
  
  return null;
}

/**
 * Load and parse .leash config
 * Supports both simple plain-text format and YAML format.
 */
export function loadLeashConfig(path: string): LeashConfig | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    
    // Handle JSON explicitly
    if (path.endsWith('.json')) {
      const config = JSON.parse(content);
      if (!validateConfig(config)) {
        console.error(`${COLORS.error}${SYMBOLS.error} Invalid .leash config${COLORS.reset}`);
        return null;
      }
      return config;
    }
    
    // Check for simple plain-text format (one rule per line)
    if (isSimpleLeashFormat(content)) {
      const policies = parseLeashFile(content);
      return policiesToConfig(policies);
    }
    
    // Fall back to YAML parsing
    const config = parseYaml(content);
    if (!validateConfig(config)) {
      console.error(`${COLORS.error}${SYMBOLS.error} Invalid .leash config${COLORS.reset}`);
      return null;
    }
    return config;
  } catch (err) {
    console.error(`${COLORS.error}${SYMBOLS.error} Failed to parse .leash: ${(err as Error).message}${COLORS.reset}`);
    return null;
  }
}

/**
 * Compile all policies in a .leash config (parallel for performance)
 */
export async function compileLeashConfig(
  config: LeashConfig
): Promise<CompiledLeashConfig> {
  const compiled: CompiledLeashConfig = {
    version: 1,
    policies: [],
    settings: { ...DEFAULT_SETTINGS, ...config.settings },
    cloud: config.cloud,
  };

  if (config.policies.length === 0) {
    return compiled;
  }

  const spinner = createSpinner(`Compiling ${config.policies.length} policies...`);

  // Compile all policies in parallel for performance
  const results = await Promise.allSettled(
    config.policies.map(async (restriction) => {
      const policy = await compile(restriction);
      return { restriction, policy };
    })
  );

  spinner.stop();

  // Process results, collecting errors
  const errors: string[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      compiled.policies.push(result.value);
    } else {
      errors.push(result.reason?.message || 'Unknown error');
    }
  }

  if (errors.length > 0) {
    console.error(`${COLORS.error}${SYMBOLS.error} Failed to compile ${errors.length} policies:${COLORS.reset}`);
    for (const err of errors) {
      console.error(`  ${err}`);
    }
    if (compiled.policies.length === 0) {
      throw new Error('All policies failed to compile');
    }
    console.log(`${COLORS.warning}${SYMBOLS.warning} Continuing with ${compiled.policies.length} successful policies${COLORS.reset}`);
  }

  return compiled;
}

/**
 * Create a new .leash config file (simple plain-text format)
 */
export function createLeashConfig(dir: string = process.cwd()): string {
  const path = join(dir, LEASH_FILE);
  
  if (existsSync(path)) {
    console.log(`${COLORS.warning}${SYMBOLS.warning} .leash already exists${COLORS.reset}`);
    return path;
  }

  const content = generateSimpleLeash(DEFAULT_SIMPLE_POLICIES);
  
  writeFileSync(path, content);
  console.log(`${COLORS.success}${SYMBOLS.success} Created ${path}${COLORS.reset}`);
  
  return path;
}

/**
 * Check if current directory has a .leash config
 */
export function hasLeashConfig(dir: string = process.cwd()): boolean {
  return findLeashConfig(dir) !== null;
}
