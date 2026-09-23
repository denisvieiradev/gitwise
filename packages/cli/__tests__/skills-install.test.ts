/**
 * T23 — DIST-01..06: `gw skills install <tool>` copies the adapter files
 * bundled in @denisvieiradev/gitwise-skills into the user's own project,
 * touching only gitwise-owned paths. Runs against real temp directories.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installSkills, makeSkillsCommand, resolveBundledAdapters, isSkillsPackageResolvableFrom } from "../src/commands/skills.js";

const COMMANDS = ["commit", "review", "pr", "release"];

let root: string;
let adapters: string;
let project: string;

async function seedAdapters(version: string): Promise<void> {
  for (const cmd of COMMANDS) {
    for (const [dir, base] of [["codex", ".agents/skills"], ["kiro", ".kiro/skills"]] as const) {
      const d = join(adapters, dir, base, `gitwise-${cmd}`);
      await mkdir(d, { recursive: true });
      await writeFile(join(d, "SKILL.md"), `gitwise-${cmd} ${version}`);
    }
  }
  const c = join(adapters, "copilot", ".github", "instructions");
  await mkdir(c, { recursive: true });
  await writeFile(join(c, "gitwise.instructions.md"), `copilot ${version}`);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "gitwise-skills-install-"));
  adapters = join(root, "adapters");
  project = join(root, "project");
  await mkdir(join(project, ".git"), { recursive: true });
  await seedAdapters("v1");
});

afterEach(async () => {
  await chmod(project, 0o755).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
});

const install = (tool: string, cwd = project): string[] => installSkills(tool, { cwd, adaptersRoot: adapters });

describe("gw skills install", () => {
  it("codex: installs .agents/skills/gitwise-<command>/SKILL.md for all 4 commands, creating the directories", async () => {
    install("codex");

    for (const cmd of COMMANDS) {
      expect(await readFile(join(project, ".agents/skills", `gitwise-${cmd}`, "SKILL.md"), "utf8")).toBe(`gitwise-${cmd} v1`);
    }
  });

  it("kiro: installs .kiro/skills/gitwise-<command>/SKILL.md for all 4 commands", async () => {
    install("kiro");

    for (const cmd of COMMANDS) {
      expect(await readFile(join(project, ".kiro/skills", `gitwise-${cmd}`, "SKILL.md"), "utf8")).toBe(`gitwise-${cmd} v1`);
    }
  });

  it("copilot: installs .github/instructions/gitwise.instructions.md, creating the directory", async () => {
    install("copilot");

    expect(await readFile(join(project, ".github/instructions/gitwise.instructions.md"), "utf8")).toBe("copilot v1");
  });

  it("copilot: leaves an existing .github/copilot-instructions.md untouched", async () => {
    await mkdir(join(project, ".github"), { recursive: true });
    await writeFile(join(project, ".github/copilot-instructions.md"), "my own rules");

    install("copilot");

    expect(await readFile(join(project, ".github/copilot-instructions.md"), "utf8")).toBe("my own rules");
  });

  it("re-running overwrites gitwise-owned files with the new version but leaves unrelated files untouched", async () => {
    await mkdir(join(project, ".agents/skills/my-own-skill"), { recursive: true });
    await writeFile(join(project, ".agents/skills/my-own-skill/SKILL.md"), "mine");
    await writeFile(join(project, ".agents/skills/README.md"), "notes");
    install("codex");

    await seedAdapters("v2"); // simulates a gw version bump
    install("codex");

    expect(await readFile(join(project, ".agents/skills/gitwise-commit/SKILL.md"), "utf8")).toBe("gitwise-commit v2");
    expect(await readFile(join(project, ".agents/skills/my-own-skill/SKILL.md"), "utf8")).toBe("mine");
    expect(await readFile(join(project, ".agents/skills/README.md"), "utf8")).toBe("notes");
    expect((await readdir(join(project, ".agents/skills"))).sort()).toEqual(
      ["README.md", "gitwise-commit", "gitwise-pr", "gitwise-release", "gitwise-review", "my-own-skill"],
    );
  });

  it("rejects an unknown tool listing the valid names, without creating any file", async () => {
    expect(() => install("bogus-tool")).toThrow("Valid tools: codex, kiro, copilot");
    expect(await readdir(project)).toEqual([".git"]);
  });

  it("refuses to run outside a git repository, before writing anything", async () => {
    const outside = await mkdtemp(join(tmpdir(), "gitwise-not-a-repo-"));
    try {
      expect(() => install("codex", outside)).toThrow(/not inside a git repository/);
      expect(existsSync(join(outside, ".agents"))).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  const itUnlessRoot = process.platform === "win32" || process.getuid?.() === 0 ? it.skip : it;
  itUnlessRoot("fails fast with a clear error in an unwritable directory, leaving no partial install", async () => {
    await chmod(project, 0o555);

    expect(() => install("codex")).toThrow(/permission denied/);

    await chmod(project, 0o755);
    expect(existsSync(join(project, ".agents"))).toBe(false);
  });

  it("refuses a bundle containing a file outside the gitwise-owned paths", async () => {
    await mkdir(join(adapters, "codex/.agents/skills/other-skill"), { recursive: true });
    await writeFile(join(adapters, "codex/.agents/skills/other-skill/SKILL.md"), "x");

    expect(() => install("codex")).toThrow(/not a gitwise-owned path/);
    expect(existsSync(join(project, ".agents"))).toBe(false);
  });
});

describe("bundled adapters location", () => {
  it("resolves dist/adapters inside the installed @denisvieiradev/gitwise-skills package", async () => {
    const adaptersDir = resolveBundledAdapters();
    expect(adaptersDir.split("/").slice(-2)).toEqual(["dist", "adapters"]);
    const pkg = JSON.parse(await readFile(join(adaptersDir, "..", "..", "package.json"), "utf8")) as { name: string };
    expect(pkg.name).toBe("@denisvieiradev/gitwise-skills");
  });
});

describe("skills package prerequisite check", () => {
  it("reports the package as unresolvable from a project that does not depend on it", () => {
    expect(isSkillsPackageResolvableFrom(project)).toBe(false);
  });

  it("reports the package as resolvable once the project has it in node_modules", async () => {
    const pkgDir = join(project, "node_modules", "@denisvieiradev", "gitwise-skills");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, "package.json"), '{"name":"@denisvieiradev/gitwise-skills","version":"0.0.0"}');

    expect(isSkillsPackageResolvableFrom(project)).toBe(true);
  });
});

describe("gw skills install command wiring", () => {
  it("exposes `skills install <tool>`", () => {
    const skills = makeSkillsCommand();
    const installCmd = skills.commands.find((c) => c.name() === "install");
    expect(skills.name()).toBe("skills");
    expect(installCmd?.usage()).toContain("<tool>");
  });

  it("prints the valid tools and exits 1 on an unknown tool", async () => {
    const exit = jest.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    const err = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(makeSkillsCommand().parseAsync(["node", "gw", "install", "nope"])).rejects.toThrow("process.exit");
      expect(String(err.mock.calls[0]?.[0])).toContain("Valid tools: codex, kiro, copilot");
    } finally {
      exit.mockRestore();
      err.mockRestore();
    }
  });
});
