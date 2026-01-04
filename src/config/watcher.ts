// src/config/watcher.ts
// Background file watcher for automatic .leash recompilation

import { watch, FSWatcher } from 'chokidar';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { findLeashConfig, loadLeashConfig, compileLeashConfig } from './loader.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';

let watcher: FSWatcher | null = null;
let isCompiling = false;

/**
 * Compiled cache file path (sibling to .leash)
 */
function getCompiledPath(leashPath: string): string {
  return join(dirname(leashPath), '.leash.compiled.json');
}

/**
 * Compile the .leash file and write to cache.
 * Called on file change and on initial startup.
 */
async function recompile(leashPath: string): Promise<boolean> {
  if (isCompiling) return false;
  isCompiling = true;

  try {
    const config = loadLeashConfig(leashPath);
    if (!config) {
      isCompiling = false;
      return false;
    }

    if (config.policies.length === 0) {
      console.log(`  ${COLORS.dim}No policies to compile${COLORS.reset}`);
      isCompiling = false;
      return true;
    }

    const compiled = await compileLeashConfig(config);
    const outPath = getCompiledPath(leashPath);
    writeFileSync(outPath, JSON.stringify(compiled, null, 2));
    
    console.log(`  ${COLORS.success}${SYMBOLS.success} Compiled ${compiled.policies.length} policies${COLORS.reset}`);
    isCompiling = false;
    return true;
  } catch (err) {
    console.error(`  ${COLORS.error}${SYMBOLS.error} Compilation failed: ${(err as Error).message}${COLORS.reset}`);
    isCompiling = false;
    return false;
  }
}

/**
 * Start watching the .leash file for changes.
 * Automatically recompiles on every save.
 */
export async function startLeashWatcher(dir: string = process.cwd()): Promise<boolean> {
  const leashPath = findLeashConfig(dir);
  if (!leashPath) {
    console.log(`${COLORS.warning}${SYMBOLS.warning} No .leash file found${COLORS.reset}`);
    return false;
  }

  console.log(`\n${COLORS.info}Watching ${leashPath} for changes...${COLORS.reset}`);
  
  // Initial compile
  await recompile(leashPath);

  // Watch for changes
  watcher = watch(leashPath, {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('change', async () => {
    console.log(`\n${COLORS.dim}[${new Date().toLocaleTimeString()}] .leash changed${COLORS.reset}`);
    await recompile(leashPath);
  });

  watcher.on('unlink', () => {
    console.log(`\n${COLORS.warning}${SYMBOLS.warning} .leash file deleted${COLORS.reset}`);
  });

  return true;
}

/**
 * Stop watching the .leash file.
 */
export async function stopLeashWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
}

/**
 * Check if compiled cache exists and is up-to-date.
 */
export function hasCompiledCache(dir: string = process.cwd()): boolean {
  const leashPath = findLeashConfig(dir);
  if (!leashPath) return false;
  return existsSync(getCompiledPath(leashPath));
}

/**
 * Force recompile the .leash file.
 */
export async function forceRecompile(dir: string = process.cwd()): Promise<boolean> {
  const leashPath = findLeashConfig(dir);
  if (!leashPath) return false;
  return recompile(leashPath);
}
