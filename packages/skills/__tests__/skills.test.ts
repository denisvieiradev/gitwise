/**
 * Task 14 — packages/skills tests
 *
 * These tests verify:
 * 1. plugin.json is a valid Claude Code plugin manifest
 * 2. Each skill markdown file has required sections and flags
 * 3. Each script entry point has parseable TypeScript structure
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgRoot = join(__dirname, "..");

// ---------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------

describe("package.json", () => {
  const raw = readFileSync(join(pkgRoot, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as {
    version: string;
    dependencies: Record<string, string>;
  };
  const coreRaw = readFileSync(join(pkgRoot, "..", "core", "package.json"), "utf8");
  const corePkg = JSON.parse(coreRaw) as { version: string };

  // Regression guard for ADR-005 (locked-version monorepo releases). A wildcard
  // range survives `npm publish --workspaces`, so the published tarball would
  // let consumers resolve `gitwise-core` to whatever happens to be latest on
  // the registry, defeating the locked-version contract.
  it("pins @denisvieiradev/gitwise-core to an exact semver, never a wildcard", () => {
    const spec = pkg.dependencies["@denisvieiradev/gitwise-core"];
    expect(spec).toBeDefined();
    expect(spec).not.toBe("*");
    expect(spec).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it("keeps the gitwise-core dependency in lockstep with the sibling package version", () => {
    expect(pkg.dependencies["@denisvieiradev/gitwise-core"]).toBe(corePkg.version);
  });
});

// ---------------------------------------------------------------------------
// plugin.json
// ---------------------------------------------------------------------------

describe("plugin.json", () => {
  const raw = readFileSync(join(pkgRoot, "plugin.json"), "utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manifest = JSON.parse(raw) as Record<string, any>;

  it("has required top-level fields", () => {
    expect(manifest).toHaveProperty("name");
    expect(manifest).toHaveProperty("version");
    expect(manifest).toHaveProperty("skills");
    expect(Array.isArray(manifest.skills)).toBe(true);
  });

  it("declares exactly four skills", () => {
    expect(manifest.skills).toHaveLength(4);
  });

  it("each skill entry has name and path", () => {
    for (const skill of manifest.skills as Array<{ name: string; path: string }>) {
      expect(typeof skill.name).toBe("string");
      expect(typeof skill.path).toBe("string");
      expect(skill.path.startsWith("skills/")).toBe(true);
    }
  });

  it("skill names match expected set", () => {
    const names = (manifest.skills as Array<{ name: string }>).map((s) => s.name);
    expect(names).toContain("gitwise-commit");
    expect(names).toContain("gitwise-review");
    expect(names).toContain("gitwise-pr");
    expect(names).toContain("gitwise-release");
  });
});

// ---------------------------------------------------------------------------
// Skill markdown files
// ---------------------------------------------------------------------------

function readSkill(filename: string): string {
  return readFileSync(join(pkgRoot, "skills", filename), "utf8");
}

describe("skills/commit.md", () => {
  const content = readSkill("commit.md");

  it("has a trigger line", () => {
    expect(content).toMatch(/\*\*Trigger\*\*/);
  });

  it("has --apply flag documented", () => {
    expect(content).toMatch(/--apply/);
  });

  it("has --split flag documented", () => {
    expect(content).toMatch(/--split/);
  });

  it("references the node runner script", () => {
    expect(content).toMatch(/scripts\/commit\.js/);
  });

  it("anchors the runner path on ${CLAUDE_PLUGIN_ROOT} so the skill works from any user CWD", () => {
    expect(content).toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/scripts\/commit\.js/);
  });

  it("does not invoke the runner via a bare repo-relative path", () => {
    expect(content).not.toMatch(/(^|[^/${}])packages\/skills\/dist\/scripts\/commit\.js/);
  });
});

describe("skills/review.md", () => {
  const content = readSkill("review.md");

  it("has a trigger line", () => {
    expect(content).toMatch(/\*\*Trigger\*\*/);
  });

  it("has --base flag documented", () => {
    expect(content).toMatch(/--base/);
  });

  it("references the node runner script", () => {
    expect(content).toMatch(/scripts\/review\.js/);
  });

  it("anchors the runner path on ${CLAUDE_PLUGIN_ROOT} so the skill works from any user CWD", () => {
    expect(content).toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/scripts\/review\.js/);
  });

  it("does not invoke the runner via a bare repo-relative path", () => {
    expect(content).not.toMatch(/(^|[^/${}])packages\/skills\/dist\/scripts\/review\.js/);
  });
});

describe("skills/pr.md", () => {
  const content = readSkill("pr.md");

  it("has a trigger line", () => {
    expect(content).toMatch(/\*\*Trigger\*\*/);
  });

  it("has --apply flag documented", () => {
    expect(content).toMatch(/--apply/);
  });

  it("references the node runner script", () => {
    expect(content).toMatch(/scripts\/pr\.js/);
  });

  it("anchors the runner path on ${CLAUDE_PLUGIN_ROOT} so the skill works from any user CWD", () => {
    expect(content).toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/scripts\/pr\.js/);
  });

  it("does not invoke the runner via a bare repo-relative path", () => {
    expect(content).not.toMatch(/(^|[^/${}])packages\/skills\/dist\/scripts\/pr\.js/);
  });
});

describe("skills/release.md", () => {
  const content = readSkill("release.md");

  it("has a trigger line", () => {
    expect(content).toMatch(/\*\*Trigger\*\*/);
  });

  it("has --apply flag documented", () => {
    expect(content).toMatch(/--apply/);
  });

  it("has --bump flag documented", () => {
    expect(content).toMatch(/--bump/);
  });

  it("documents the prepare subcommand", () => {
    expect(content).toMatch(/\bprepare\b/);
  });

  it("documents the finish subcommand", () => {
    expect(content).toMatch(/\bfinish\b/);
  });

  it("documents the abort subcommand", () => {
    expect(content).toMatch(/\babort\b/);
  });

  it("documents the --no-delete-branch flag", () => {
    expect(content).toMatch(/--no-delete-branch/);
  });

  it("references the node runner script", () => {
    expect(content).toMatch(/scripts\/release\.js/);
  });

  it("anchors the runner path on ${CLAUDE_PLUGIN_ROOT} so the skill works from any user CWD", () => {
    expect(content).toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/scripts\/release\.js/);
  });

  it("does not invoke the runner via a bare repo-relative path", () => {
    expect(content).not.toMatch(/(^|[^/${}])packages\/skills\/dist\/scripts\/release\.js/);
  });
});

// ---------------------------------------------------------------------------
// Script source files exist and have expected structure
// ---------------------------------------------------------------------------

function readScript(filename: string): string {
  return readFileSync(join(pkgRoot, "scripts", filename), "utf8");
}

describe("scripts/commit.ts", () => {
  const content = readScript("commit.ts");

  it("imports from gitwise-core", () => {
    expect(content).toMatch(/@denisvieiradev\/gitwise-core/);
  });

  it("imports commit and applyCommitPlan", () => {
    expect(content).toMatch(/\bcommit\b/);
    expect(content).toMatch(/\bapplyCommitPlan\b/);
  });

  it("handles --apply flag", () => {
    expect(content).toMatch(/--apply/);
  });

  it("handles --split flag", () => {
    expect(content).toMatch(/--split/);
  });

  it("writes to stdout", () => {
    expect(content).toMatch(/process\.stdout\.write/);
  });
});

describe("scripts/review.ts", () => {
  const content = readScript("review.ts");

  it("imports from gitwise-core", () => {
    expect(content).toMatch(/@denisvieiradev\/gitwise-core/);
  });

  it("imports review", () => {
    expect(content).toMatch(/\breview\b/);
  });

  it("handles --base flag", () => {
    expect(content).toMatch(/--base/);
  });

  it("emits Critical/Suggestions/Nitpicks sections", () => {
    expect(content).toMatch(/critical/i);
    expect(content).toMatch(/suggestions/i);
    expect(content).toMatch(/nitpicks/i);
  });
});

describe("scripts/pr.ts", () => {
  const content = readScript("pr.ts");

  it("imports from gitwise-core", () => {
    expect(content).toMatch(/@denisvieiradev\/gitwise-core/);
  });

  it("imports pr and applyPr", () => {
    expect(content).toMatch(/\bpr\b/);
    expect(content).toMatch(/\bapplyPr\b/);
  });

  it("handles --apply flag", () => {
    expect(content).toMatch(/--apply/);
  });
});

describe("scripts/release.ts", () => {
  const content = readScript("release.ts");

  it("imports from gitwise-core", () => {
    expect(content).toMatch(/@denisvieiradev\/gitwise-core/);
  });

  it("imports release and applyRelease", () => {
    expect(content).toMatch(/\brelease\b/);
    expect(content).toMatch(/\bapplyRelease\b/);
  });

  it("imports prepareRelease, finishRelease, and abortRelease", () => {
    expect(content).toMatch(/\bprepareRelease\b/);
    expect(content).toMatch(/\bfinishRelease\b/);
    expect(content).toMatch(/\babortRelease\b/);
  });

  it("dispatches on the phase positional via the shared parser", () => {
    expect(content).toMatch(/parseReleaseArgs/);
  });

  it("handles --apply flag", () => {
    expect(content).toMatch(/--apply/);
  });

  it("handles --bump flag", () => {
    expect(content).toMatch(/--bump/);
  });

  it("surfaces the typed error.code on failure", () => {
    expect(content).toMatch(/error\.code|\.code/i);
    expect(content).toMatch(/process\.exit\(1\)/);
  });
});
