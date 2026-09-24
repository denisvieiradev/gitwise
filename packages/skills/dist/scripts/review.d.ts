#!/usr/bin/env node
/**
 * gitwise-skills: review runner
 * Usage: node scripts/review.js [--base <branch>] [--prompt "<text>"]
 */
declare function runReviewSkill(rawArgs: string[], cwd?: string): Promise<void>;

export { runReviewSkill };
