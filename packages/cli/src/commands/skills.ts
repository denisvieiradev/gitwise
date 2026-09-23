import { Command } from "commander";
import { createRequire } from "node:module";
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

// DIST-01..06: copies the generated adapter files bundled inside the
// published @denisvieiradev/gitwise-skills package into the user's own
// project, so Codex/Kiro/Copilot can discover gitwise's commands there.
// Re-running it is the update mechanism (DIST-03).

export const SKILL_TOOLS = ["codex", "kiro", "copilot"] as const;
export type SkillTool = (typeof SKILL_TOOLS)[number];

export function isSkillTool(value: string): value is SkillTool {
  return (SKILL_TOOLS as readonly string[]).includes(value);
}

/**
 * DIST-04: the only paths install may ever create or overwrite — files under
 * `gitwise-*` directories of `.agents/skills/` or `.kiro/skills/`, and the one
 * `.github/instructions/gitwise.instructions.md` file. Enforced per file as
 * defense in depth, so a wrong bundle can never touch anything else.
 */
function isGitwiseOwned(relPath: string): boolean {
  const parts = relPath.split(sep);
  const [root, dir, name] = parts;
  if (root === ".github" && dir === "instructions") {
    return parts.length === 3 && name === "gitwise.instructions.md";
  }
  const isSkillsRoot = (root === ".agents" || root === ".kiro") && dir === "skills";
  return isSkillsRoot && parts.length >= 4 && (name ?? "").startsWith("gitwise-");
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function insideGitRepo(start: string): boolean {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function nearestExistingDir(path: string): string {
  let dir = path;
  while (!existsSync(dir)) dir = dirname(dir);
  return dir;
}

/** Locates `dist/adapters` inside the installed @denisvieiradev/gitwise-skills package. */
export function resolveBundledAdapters(): string {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve("@denisvieiradev/gitwise-skills/package.json");
  return join(dirname(pkgJson), "dist", "adapters");
}

/**
 * The installed skills run the scripts of @denisvieiradev/gitwise-skills via
 * Node module resolution from the user's project, so the package must be
 * resolvable there (a project dependency); being installed only next to a
 * global `gw` is not enough.
 */
export function isSkillsPackageResolvableFrom(cwd: string): boolean {
  try {
    createRequire(join(resolve(cwd), "noop.js")).resolve("@denisvieiradev/gitwise-skills/package.json");
    return true;
  } catch {
    return false;
  }
}

export interface InstallOptions {
  /** Project directory to install into. */
  cwd: string;
  /** Directory holding `<tool>/` adapter trees (defaults to the installed package's dist/adapters). */
  adaptersRoot?: string;
}

/**
 * Installs `tool`'s adapter files into `cwd`. Every precondition is checked
 * before the first write so a failure never leaves a half-installed skill.
 * Returns the installed paths, relative to `cwd`.
 */
export function installSkills(tool: string, opts: InstallOptions): string[] {
  if (!isSkillTool(tool)) {
    throw new Error(`Unknown tool '${tool}'. Valid tools: ${SKILL_TOOLS.join(", ")}`);
  }
  const cwd = resolve(opts.cwd);
  if (!insideGitRepo(cwd)) {
    throw new Error(`${cwd} is not inside a git repository. Run this from your project's root.`);
  }

  const source = join(opts.adaptersRoot ?? resolveBundledAdapters(), tool);
  if (!existsSync(source)) {
    throw new Error(`No bundled ${tool} adapter found at ${source}. Reinstall @denisvieiradev/gitwise-skills.`);
  }

  const files = listFiles(source).map((abs) => relative(source, abs));
  for (const rel of files) {
    if (!isGitwiseOwned(rel)) {
      throw new Error(`Refusing to install '${rel}': not a gitwise-owned path.`);
    }
    const targetDir = nearestExistingDir(dirname(join(cwd, rel)));
    try {
      accessSync(targetDir, constants.W_OK);
    } catch {
      throw new Error(`Cannot write to ${targetDir}: permission denied.`);
    }
  }

  for (const rel of files) {
    const target = join(cwd, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, rel), target);
  }
  return files;
}

export function makeSkillsCommand(): Command {
  const skills = new Command("skills").description("Manage gitwise's native agent skills in your project");

  skills
    .command("install")
    .description("Install gitwise's commands for Codex, Kiro, or Copilot into the current project (re-run to update)")
    .argument("<tool>", `Target tool: ${SKILL_TOOLS.join(", ")}`)
    .action((tool: string) => {
      try {
        const installed = installSkills(tool, { cwd: process.cwd() });
        for (const file of installed) console.log(`  ${file}`);
        console.log(`Installed gitwise for ${tool} (${installed.length} files).`);
        if (!isSkillsPackageResolvableFrom(process.cwd())) {
          console.warn(
            "Note: the installed skills run scripts from @denisvieiradev/gitwise-skills, which this project cannot resolve yet. Add it with: npm install --save-dev @denisvieiradev/gitwise-skills",
          );
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  return skills;
}
