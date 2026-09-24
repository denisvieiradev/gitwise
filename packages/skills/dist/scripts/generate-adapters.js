#!/usr/bin/env node

// scripts/generate-adapters.ts
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// scripts/invoked-directly.ts
import { realpathSync } from "fs";
import { fileURLToPath } from "url";
function isInvokedDirectly(importMetaUrl) {
  const entry = process.argv[1];
  if (entry === void 0) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}

// scripts/generate-adapters.ts
var COMMANDS = ["commit", "review", "pr", "release"];
var CLAUDE_SCRIPT = /node "\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/scripts\/(\w+)\.js"/g;
function installedScript(command) {
  return `node "$(node -p "require.resolve('@denisvieiradev/gitwise-skills/package.json').replace(/package\\.json$/, '')")dist/scripts/${command}.js"`;
}
function parseSkill(command, raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`skills/${command}/SKILL.md is missing YAML frontmatter`);
  const description = match[1]?.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!description) throw new Error(`skills/${command}/SKILL.md has no description`);
  const body = (match[2] ?? "").replace(/^## Tool allowlist\n[\s\S]*?(?=^## )/m, "").replace(CLAUDE_SCRIPT, (_m, cmd) => installedScript(cmd));
  return { command, description, body };
}
function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
function generateAdapters(skillsDir, outDir) {
  const skills = COMMANDS.map(
    (command) => parseSkill(command, readFileSync(join(skillsDir, command, "SKILL.md"), "utf8"))
  );
  const skillMd = (s) => `---
name: gitwise-${s.command}
description: ${s.description}
---

# gitwise-${s.command}
${s.body.replace(/^\s*# .*\n/, "")}`;
  for (const s of skills) {
    write(join(outDir, "codex", ".agents", "skills", `gitwise-${s.command}`, "SKILL.md"), skillMd(s));
    write(join(outDir, "kiro", ".kiro", "skills", `gitwise-${s.command}`, "SKILL.md"), skillMd(s));
  }
  const sections = skills.map((s) => `## ${s.command}

When to use: ${s.description}
${s.body.replace(/^\s*# .*\n/, "").replace(/^##/gm, "###")}`).join("\n");
  write(
    join(outDir, "copilot", ".github", "instructions", "gitwise.instructions.md"),
    `---
applyTo: "**"
---

# gitwise

These instructions let you run gitwise's commit, review, pr, and release commands when the user asks for them.

${sections}`
  );
}
var invokedDirectly = isInvokedDirectly(import.meta.url);
if (invokedDirectly) {
  const pkgRoot = join(dirname(fileURLToPath2(import.meta.url)), "..", "..");
  generateAdapters(join(pkgRoot, "skills"), join(pkgRoot, "dist", "adapters"));
}
export {
  COMMANDS,
  generateAdapters
};
//# sourceMappingURL=generate-adapters.js.map