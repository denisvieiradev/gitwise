#!/usr/bin/env node
/**
 * gitwise-skills: pr runner
 * Usage: node scripts/pr.js [--base <branch>] [--apply] [--prompt "<text>"]
 */
declare function runPrSkill(rawArgs: string[], cwd?: string): Promise<void>;

export { runPrSkill };
