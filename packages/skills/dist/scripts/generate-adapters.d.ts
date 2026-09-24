#!/usr/bin/env node
/**
 * gitwise-skills: build-time adapter generator (AD-003).
 *
 * Reads the canonical skills/<command>/SKILL.md files and emits, per tool, the
 * exact file tree `gw skills install <tool>` copies into a user's project:
 *
 *   <out>/codex/.agents/skills/gitwise-<command>/SKILL.md      (Codex)
 *   <out>/kiro/.kiro/skills/gitwise-<command>/SKILL.md         (Kiro)
 *   <out>/copilot/.github/instructions/gitwise.instructions.md (Copilot)
 *
 * None of the three tools provides a `${CLAUDE_PLUGIN_ROOT}`-style variable,
 * so the Claude-specific script path is rewritten to a Node module resolution
 * of the installed @denisvieiradev/gitwise-skills package.
 */
declare const COMMANDS: readonly ["commit", "review", "pr", "release"];
declare function generateAdapters(skillsDir: string, outDir: string): void;

export { COMMANDS, generateAdapters };
