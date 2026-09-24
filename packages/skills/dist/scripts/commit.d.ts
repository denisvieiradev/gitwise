#!/usr/bin/env node
/**
 * gitwise-skills: commit runner
 * Usage: node scripts/commit.js [intent] [--split auto|never|always] [--apply] [--push]
 */
declare function runCommitSkill(rawArgs: string[], cwd?: string): Promise<void>;

export { runCommitSkill };
