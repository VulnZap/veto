import {
  findVetoConfig,
  loadVetoConfig,
  compileVetoConfig,
} from '../config/loader.js';
import {
  installAgent,
  addPolicyToAgents,
} from '../native/index.js';
import { COLORS, SYMBOLS } from '../ui/colors.js';
import { NotFoundError, ConfigError } from '../errors.js';

export async function runSync(agent?: string) {
  const configPath = findVetoConfig();
  
  if (!configPath) {
    console.error(`${COLORS.error}${SYMBOLS.error} No .veto config found${COLORS.reset}`);
    console.log(`Run: ${COLORS.dim}veto init${COLORS.reset}`);
    throw new NotFoundError('No .veto config found');
  }

  const config = loadVetoConfig(configPath);
  if (!config) {
    throw new ConfigError('Failed to load .veto config');
  }

  console.log(`\n${COLORS.info}Loading ${configPath}...${COLORS.reset}`);

  // Compile all policies
  const compiled = await compileVetoConfig(config);

  console.log(`${COLORS.success}${SYMBOLS.success} Compiled ${compiled.policies.length} policies${COLORS.reset}\n`);

  // Save each policy
  for (const { restriction, policy } of compiled.policies) {
    const policyName = restriction
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    
    await addPolicyToAgents(policy, policyName);
  }

  // If agent specified, install for that agent
  if (agent) {
    console.log('');
    await installAgent(agent);
  } else {
    console.log(`To install for an agent:`);
    console.log(`  ${COLORS.dim}veto install cc${COLORS.reset}        Claude Code`);
    console.log(`  ${COLORS.dim}veto install windsurf${COLORS.reset}  Windsurf`);
    console.log(`  ${COLORS.dim}veto install oc${COLORS.reset}        OpenCode\n`);
  }
}
