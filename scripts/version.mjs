#!/usr/bin/env node

/**
 * Custom version script for the changesets release workflow.
 *
 * Runs `changeset version` to bump npm packages, then syncs the Python SDK
 * version in pyproject.toml to match. This ensures the "Version Packages" PR
 * includes both npm and Python version bumps — no direct push to master needed.
 *
 * Python version scheme: 0.{npm_minor}.0
 *   npm 1.4.0 → Python 0.4.0
 *   npm 1.5.0 → Python 0.5.0
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 1. Run standard changeset version (bumps package.json + changelogs)
execSync("pnpm changeset version", { stdio: "inherit" });

// 2. Read the new npm SDK version
const sdkPkgPath = resolve("packages/sdk/package.json");
const sdkPkg = JSON.parse(readFileSync(sdkPkgPath, "utf8"));
const npmMinor = sdkPkg.version.split(".")[1];
const newPyVersion = `0.${npmMinor}.0`;

// 3. Read and update pyproject.toml if needed
const pyprojectPath = resolve("packages/sdk-python/pyproject.toml");
const pyproject = readFileSync(pyprojectPath, "utf8");
const match = pyproject.match(/version = "([^"]+)"/);

if (!match) {
  console.error("Could not find version in pyproject.toml");
  process.exit(1);
}

const currentPyVersion = match[1];

if (currentPyVersion !== newPyVersion) {
  const updated = pyproject.replace(
    `version = "${currentPyVersion}"`,
    `version = "${newPyVersion}"`,
  );
  writeFileSync(pyprojectPath, updated);
  console.log(`Python SDK: ${currentPyVersion} → ${newPyVersion}`);
} else {
  console.log(`Python SDK already at ${newPyVersion}`);
}
