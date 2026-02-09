const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BG_RED = '\x1b[41m';
const BG_GREEN = '\x1b[42m';

export function banner(title: string, subtitle?: string): void {
  const width = 60;
  const line = '='.repeat(width);
  console.log();
  console.log(`${BOLD}${CYAN}${line}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
  if (subtitle) {
    console.log(`${DIM}  ${subtitle}${RESET}`);
  }
  console.log(`${BOLD}${CYAN}${line}${RESET}`);
  console.log();
}

export function scenarioHeader(number: string, title: string, description: string): void {
  console.log(`${BOLD}${MAGENTA}--- Scenario ${number}: ${title} ---${RESET}`);
  console.log(`${DIM}${description}${RESET}`);
  console.log();
}

export function toolCall(agentName: string, toolName: string, args: Record<string, unknown>): void {
  console.log(`${BOLD}${BLUE}[${agentName}]${RESET} calls ${BOLD}${WHITE}${toolName}${RESET}`);
  const argStr = JSON.stringify(args, null, 2)
    .split('\n')
    .map((line) => `  ${DIM}${line}${RESET}`)
    .join('\n');
  console.log(argStr);
}

export function allowed(reason?: string): void {
  console.log(`  ${BG_GREEN}${BOLD}${WHITE} ALLOWED ${RESET}${reason ? ` ${GREEN}${reason}${RESET}` : ''}`);
  console.log();
}

export function denied(reason: string): void {
  console.log(`  ${BG_RED}${BOLD}${WHITE} DENIED ${RESET} ${RED}${reason}${RESET}`);
  console.log();
}

export function toolResult(result: string): void {
  console.log(`  ${DIM}=> ${result}${RESET}`);
}

export function info(message: string): void {
  console.log(`${DIM}${message}${RESET}`);
}

export function agentThinking(agentName: string, thought: string): void {
  console.log(`${YELLOW}[${agentName} thinking]${RESET} ${DIM}${thought}${RESET}`);
}

export function separator(): void {
  console.log(`${DIM}${'- '.repeat(30)}${RESET}`);
}

export function summary(stats: { total: number; allowed: number; denied: number }): void {
  console.log();
  console.log(`${BOLD}${CYAN}Summary:${RESET}`);
  console.log(`  Total tool calls:  ${BOLD}${stats.total}${RESET}`);
  console.log(`  Allowed:           ${GREEN}${stats.allowed}${RESET}`);
  console.log(`  Denied:            ${RED}${stats.denied}${RESET}`);
  console.log();
}

export interface DemoResult {
  toolName: string;
  args: Record<string, unknown>;
  decision: 'allow' | 'deny';
  reason?: string;
}

export function compareResults(actual: DemoResult[], expected: DemoResult[]): boolean {
  if (actual.length !== expected.length) {
    console.log(`${RED}Result count mismatch: got ${actual.length}, expected ${expected.length}${RESET}`);
    return false;
  }

  let allMatch = true;
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i];
    const e = expected[i];
    if (a.toolName !== e.toolName || a.decision !== e.decision) {
      console.log(`${RED}Mismatch at call ${i + 1}: ${a.toolName}=${a.decision}, expected ${e.toolName}=${e.decision}${RESET}`);
      allMatch = false;
    }
  }

  if (allMatch) {
    console.log(`${GREEN}All ${actual.length} results match expected outputs.${RESET}`);
  }
  return allMatch;
}
