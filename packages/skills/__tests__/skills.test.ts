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
// .claude-plugin/plugin.json (Claude Code plugin manifest)
// ---------------------------------------------------------------------------

describe(".claude-plugin/plugin.json", () => {
  const raw = readFileSync(join(pkgRoot, ".claude-plugin", "plugin.json"), "utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manifest = JSON.parse(raw) as Record<string, any>;

  it("has required top-level fields", () => {
    expect(typeof manifest.name).toBe("string");
    expect(typeof manifest.description).toBe("string");
    expect(typeof manifest.version).toBe("string");
  });

  it("is named gitwise so skills namespace as gitwise:<skill>", () => {
    expect(manifest.name).toBe("gitwise");
  });

  it("relies on skills/ auto-discovery (no legacy skills array)", () => {
    expect(manifest).not.toHaveProperty("skills");
  });

  it("keeps the manifest version in lockstep with package.json", () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
      version: string;
    };
    expect(manifest.version).toBe(pkg.version);
  });
});

// ---------------------------------------------------------------------------
// Skill markdown files
// ---------------------------------------------------------------------------

function readSkill(name: string): string {
  return readFileSync(join(pkgRoot, "skills", name, "SKILL.md"), "utf8");
}

function frontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match || match[1] === undefined) throw new Error("missing YAML frontmatter");
  return match[1];
}

describe("skills/commit/SKILL.md", () => {
  const content = readSkill("commit");

  it("has YAML frontmatter with name and description", () => {
    const fm = frontmatter(content);
    expect(fm).toMatch(/^name:\s*commit\s*$/m);
    expect(fm).toMatch(/^description:\s*\S/m);
  });

  it("has --apply flag documented", () => {
    expect(content).toMatch(/--apply/);
  });

  it("has --split flag documented", () => {
    expect(content).toMatch(/--split/);
  });

  it("anchors the runner path on ${CLAUDE_PLUGIN_ROOT}/dist/scripts/commit.js", () => {
    expect(content).toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/scripts\/commit\.js/);
  });

  it("does not invoke the runner via a bare repo-relative path", () => {
    expect(content).not.toMatch(/(^|[^/${}])packages\/skills\/dist\/scripts\/commit\.js/);
  });
});

describe("skills/review/SKILL.md", () => {
  const content = readSkill("review");

  it("has YAML frontmatter with name and description", () => {
    const fm = frontmatter(content);
    expect(fm).toMatch(/^name:\s*review\s*$/m);
    expect(fm).toMatch(/^description:\s*\S/m);
  });

  it("has --base flag documented", () => {
    expect(content).toMatch(/--base/);
  });

  it("anchors the runner path on ${CLAUDE_PLUGIN_ROOT}/dist/scripts/review.js", () => {
    expect(content).toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/scripts\/review\.js/);
  });

  it("does not invoke the runner via a bare repo-relative path", () => {
    expect(content).not.toMatch(/(^|[^/${}])packages\/skills\/dist\/scripts\/review\.js/);
  });
});

describe("skills/pr/SKILL.md", () => {
  const content = readSkill("pr");

  it("has YAML frontmatter with name and description", () => {
    const fm = frontmatter(content);
    expect(fm).toMatch(/^name:\s*pr\s*$/m);
    expect(fm).toMatch(/^description:\s*\S/m);
  });

  it("has --apply flag documented", () => {
    expect(content).toMatch(/--apply/);
  });

  it("anchors the runner path on ${CLAUDE_PLUGIN_ROOT}/dist/scripts/pr.js", () => {
    expect(content).toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/scripts\/pr\.js/);
  });

  it("does not invoke the runner via a bare repo-relative path", () => {
    expect(content).not.toMatch(/(^|[^/${}])packages\/skills\/dist\/scripts\/pr\.js/);
  });
});

describe("skills/release/SKILL.md", () => {
  const content = readSkill("release");

  it("has YAML frontmatter with name and description", () => {
    const fm = frontmatter(content);
    expect(fm).toMatch(/^name:\s*release\s*$/m);
    expect(fm).toMatch(/^description:\s*\S/m);
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

  it("anchors the runner path on ${CLAUDE_PLUGIN_ROOT}/dist/scripts/release.js", () => {
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

// ---------------------------------------------------------------------------
// Bundled runner scripts must be self-contained (Claude Code installs the
// plugin via git-clone; no `npm install` runs, so there is no node_modules to
// resolve external imports against).
// ---------------------------------------------------------------------------

describe("dist/scripts self-containment", () => {
  const runners = ["commit", "review", "pr", "release"] as const;

  function readDistRunner(name: string): string {
    return readFileSync(join(pkgRoot, "dist", "scripts", `${name}.js`), "utf8");
  }

  for (const name of runners) {
    describe(`dist/scripts/${name}.js`, () => {
      const content = readDistRunner(name);

      it("starts with the node shebang", () => {
        expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
      });

      it("does not import @denisvieiradev/gitwise-core at runtime (must be bundled in)", () => {
        expect(content).not.toMatch(/from\s+["']@denisvieiradev\/gitwise-core["']/);
        expect(content).not.toMatch(/require\(\s*["']@denisvieiradev\/gitwise-core["']\s*\)/);
      });

      it("does not import @anthropic-ai/sdk at runtime (must be bundled in)", () => {
        expect(content).not.toMatch(/from\s+["']@anthropic-ai\/sdk["']/);
        expect(content).not.toMatch(/require\(\s*["']@anthropic-ai\/sdk["']\s*\)/);
      });
    });
  }
});
