/**
 * T21 — SKILL-01..07: the build-time generator turns the canonical
 * skills/<command>/SKILL.md files into Codex/Kiro SKILL.md bundles and a
 * single Copilot instructions file, targeting the paths each tool discovers
 * once `gw skills install <tool>` copies them into a user's project.
 */

import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateAdapters } from "../scripts/generate-adapters.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMMANDS = ["commit", "review", "pr", "release"] as const;

let outDir: string;

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), "gitwise-adapters-"));
  generateAdapters(join(pkgRoot, "skills"), outDir);
});

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

function read(...parts: string[]): string {
  return readFileSync(join(outDir, ...parts), "utf8");
}

function frontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match || match[1] === undefined) throw new Error("missing YAML frontmatter");
  return match[1];
}

describe.each([
  ["codex", ".agents/skills"],
  ["kiro", ".kiro/skills"],
] as const)("%s adapter", (tool, skillsRoot) => {
  it.each(COMMANDS)(`emits ${skillsRoot}/gitwise-%s/SKILL.md with name and description frontmatter`, (cmd) => {
    const content = read(tool, ...skillsRoot.split("/"), `gitwise-${cmd}`, "SKILL.md");
    const fm = frontmatter(content);
    expect(fm).toMatch(new RegExp(`^name: gitwise-${cmd}$`, "m"));
    expect(fm).toMatch(/^description: \S/m);
  });

  it.each(COMMANDS)("gitwise-%s runs the script from the installed gitwise-skills package", (cmd) => {
    const content = read(tool, ...skillsRoot.split("/"), `gitwise-${cmd}`, "SKILL.md");
    expect(content).toContain("@denisvieiradev/gitwise-skills");
    expect(content).toContain(`dist/scripts/${cmd}.js`);
    expect(content).not.toContain("CLAUDE_PLUGIN_ROOT");
  });

  it("keeps the source skill's flags in the instructions", () => {
    const content = read(tool, ...skillsRoot.split("/"), "gitwise-commit", "SKILL.md");
    expect(content).toContain("--split auto|never|always");
  });
});

describe("copilot adapter", () => {
  const rel = [".github", "instructions", "gitwise.instructions.md"];

  it("emits a single gitwise.instructions.md with applyTo frontmatter", () => {
    expect(frontmatter(read("copilot", ...rel))).toMatch(/^applyTo: "\*\*"$/m);
  });

  it.each(COMMANDS)("describes the %s command and its installed-package script", (cmd) => {
    const content = read("copilot", ...rel);
    expect(content).toContain(`## ${cmd}`);
    expect(content).toContain(`dist/scripts/${cmd}.js`);
    expect(content).toContain("@denisvieiradev/gitwise-skills");
    expect(content).not.toContain("CLAUDE_PLUGIN_ROOT");
  });

  it("never emits a copilot-instructions.md (must not touch the user's own file)", () => {
    expect(existsSync(join(outDir, "copilot", ".github", "copilot-instructions.md"))).toBe(false);
  });
});

describe("build wiring", () => {
  it("runs the generator after tsup in the package build script", () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
      scripts: { build: string };
    };
    expect(pkg.scripts.build).toMatch(/^tsup && .*generate-adapters/);
  });
});
