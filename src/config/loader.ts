// src/config/loader.ts
// Load and parse .leash configuration files

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import {
  validateConfig,
  generateDefaultConfig,
  generateLeashYaml,
  DEFAULT_SETTINGS,
  type LeashConfig,
  type CompiledLeashConfig,
} from './schema.js';
import { compile } from '../compiler/index.js';
import { COLORS, SYMBOLS, createSpinner } from '../ui/colors.js';

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
 */
export function loadLeashConfig(path: string): LeashConfig | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    
    let config: unknown;
    
    if (path.endsWith('.json')) {
      config = JSON.parse(content);
    } else {
      config = parseYaml(content);
    }

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
 * Compile all policies in a .leash config
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

  const spinner = createSpinner(`Compiling ${config.policies.length} policies...`);

  for (const restriction of config.policies) {
    try {
      const policy = await compile(restriction);
      compiled.policies.push({ restriction, policy });
    } catch (err) {
      spinner.stop();
      console.error(`${COLORS.error}${SYMBOLS.error} Failed to compile: "${restriction}"${COLORS.reset}`);
      console.error(`  ${(err as Error).message}`);
      throw err;
    }
  }

  spinner.stop();
  return compiled;
}

/**
 * Create a new .leash config file
 */
export function createLeashConfig(dir: string = process.cwd()): string {
  const path = join(dir, LEASH_FILE);
  
  if (existsSync(path)) {
    console.log(`${COLORS.warning}${SYMBOLS.warning} .leash already exists${COLORS.reset}`);
    return path;
  }

  const config = generateDefaultConfig();
  const content = generateLeashYaml(config);
  
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
