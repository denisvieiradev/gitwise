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

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isInvokedDirectly } from "./invoked-directly.js";

export const COMMANDS = ["commit", "review", "pr", "release"] as const;

const CLAUDE_SCRIPT = /node "\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/scripts\/(\w+)\.js"/g;

// Resolves the installed package from the user's project via Node module
// resolution, then runs its bundled script.
function installedScript(command: string): string {
  return `node "$(node -p "require.resolve('@denisvieiradev/gitwise-skills/package.json').replace(/package\\.json$/, '')")dist/scripts/${command}.js"`;
}

interface SourceSkill {
  command: string;
  description: string;
  /** Instructions and flags, with the Claude-only "Tool allowlist" section dropped. */
  body: string;
}

function parseSkill(command: string, raw: string): SourceSkill {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`skills/${command}/SKILL.md is missing YAML frontmatter`);
  const description = match[1]?.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!description) throw new Error(`skills/${command}/SKILL.md has no description`);
  const body = (match[2] ?? "")
    .replace(/^## Tool allowlist\n[\s\S]*?(?=^## )/m, "")
    .replace(CLAUDE_SCRIPT, (_m, cmd: string) => installedScript(cmd));
  return { command, description, body };
}

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function generateAdapters(skillsDir: string, outDir: string): void {
  const skills = COMMANDS.map((command) =>
    parseSkill(command, readFileSync(join(skillsDir, command, "SKILL.md"), "utf8")),
  );

  const skillMd = (s: SourceSkill): string =>
    `---\nname: gitwise-${s.command}\ndescription: ${s.description}\n---\n\n# gitwise-${s.command}\n${s.body.replace(/^\s*# .*\n/, "")}`;

  for (const s of skills) {
    write(join(outDir, "codex", ".agents", "skills", `gitwise-${s.command}`, "SKILL.md"), skillMd(s));
    write(join(outDir, "kiro", ".kiro", "skills", `gitwise-${s.command}`, "SKILL.md"), skillMd(s));
  }

  // Copilot has no skill mechanism: one always-loaded instructions file, kept
  // separate from the user's own .github/copilot-instructions.md.
  const sections = skills
    .map((s) => `## ${s.command}\n\nWhen to use: ${s.description}\n${s.body.replace(/^\s*# .*\n/, "").replace(/^##/gm, "###")}`)
    .join("\n");
  write(
    join(outDir, "copilot", ".github", "instructions", "gitwise.instructions.md"),
    `---\napplyTo: "**"\n---\n\n# gitwise\n\nThese instructions let you run gitwise's commit, review, pr, and release commands when the user asks for them.\n\n${sections}`,
  );
}

// Only run when invoked directly (`node dist/scripts/generate-adapters.js`),
// so the tests can import generateAdapters without side effects.
const invokedDirectly = isInvokedDirectly(import.meta.url);

if (invokedDirectly) {
  // dist/scripts/generate-adapters.js → package root is two levels up.
  const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  generateAdapters(join(pkgRoot, "skills"), join(pkgRoot, "dist", "adapters"));
}
