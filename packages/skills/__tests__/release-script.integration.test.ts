/**
 * Integration tests: exercise the built `dist/scripts/release.js` script as a
 * subprocess against a temp git repo for each phase (task_10 deliverable).
 *
 * The skill's runtime entry point is the bundled ESM file under
 * `packages/skills/dist`. To verify it boots and dispatches correctly we have
 * to run it the same way Claude Code does: `node dist/scripts/release.js …`.
 *
 * For phases that don't need an LLM (`finish`, `abort`), the plan file is
 * seeded in-process using the published core API plus `MockLLMProvider`. For
 * `prepare`, the test points `.gitwise.json` at a tiny fake `claude` shell
 * script that emits canned JSON — that path exercises the same provider/config
 * resolution the real skill uses.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { execFile, execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  prepareRelease,
  type LLMProvider,
} from "@denisvieiradev/gitwise-core";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgRoot = resolve(__dirname, "..");
const repoRoot = resolve(pkgRoot, "..", "..");
const scriptPath = join(pkgRoot, "dist", "scripts", "release.js");

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runScript(
  args: string[],
  cwd: string,
  homeDir?: string,
): Promise<SpawnResult> {
  return new Promise((resolveFn) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: {
        ...process.env,
        // The skill defers to gitwise-core for config + API key loading.
        // Pin HOME so the test never leaks into the developer's real
        // ~/.gitwise/. Default to the repo cwd for phases that don't need
        // a user config file; pass a separate dir for `prepare` so the
        // `.gitwise/` config directory does not dirty the work tree.
        HOME: homeDir ?? cwd,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      resolveFn({ code, stdout, stderr });
    });
  });
}

function seedRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gitwise-skill-release-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Tester"], { cwd: dir });
  // commit.gpgsign / tag.gpgsign can break tag creation on dev machines.
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
  execFileSync("git", ["config", "tag.gpgsign", "false"], { cwd: dir });
  // Wire a bare local remote so `finishRelease`'s `git push` doesn't reach out
  // to the real network during the test.
  const remoteDir = mkdtempSync(join(tmpdir(), "gitwise-skill-remote-"));
  execFileSync("git", ["init", "--bare", "-q", "-b", "main"], { cwd: remoteDir });
  execFileSync("git", ["remote", "add", "origin", remoteDir], { cwd: dir });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture", version: "0.1.0" }, null, 2),
  );
  writeFileSync(join(dir, "README.md"), "# fixture\n");
  // Ignore the test-only artifacts so prepare's clean-tree check doesn't trip
  // on them (the production runbook expects users to add their own .gitignore
  // entries for any local config; we just simulate that here).
  writeFileSync(join(dir, ".gitignore"), ".gitwise.json\nfake-claude.mjs\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync(
    "git",
    ["commit", "-q", "-m", "feat: initial commit"],
    { cwd: dir },
  );
  // Add a second commit so the release planner has something to reason about.
  writeFileSync(join(dir, "README.md"), "# fixture\n\nMore.\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "feat: add detail"], { cwd: dir });
  return dir;
}

class StubProvider implements LLMProvider {
  async chat(req: {
    systemPrompt: string;
    userMessage: string;
  }): Promise<{ content: string; tokens: { input: number; output: number } }> {
    if (req.systemPrompt.includes("changelog")) {
      return {
        content: "### Added\n- New behaviour from stub",
        tokens: { input: 5, output: 5 },
      };
    }
    if (req.systemPrompt.includes("communications")) {
      return {
        content: "Release notes from stub.",
        tokens: { input: 5, output: 5 },
      };
    }
    return {
      content: JSON.stringify({ suggestion: "patch", reasoning: "stub" }),
      tokens: { input: 5, output: 5 },
    };
  }
}

async function seedPlan(cwd: string): Promise<void> {
  await prepareRelease({ cwd, provider: new StubProvider(), bump: "patch" });
}

function writeFakeClaude(cwd: string): string {
  // A shebanged Node script that mimics the `claude` CLI JSON output, with
  // branching keyed off the `--system-prompt` argument so we feed the release
  // planner sensible content per call (changelog vs. notes).
  const fakePath = join(cwd, "fake-claude.mjs");
  const src = `#!/usr/bin/env node
const args = process.argv.slice(2);
const sysIdx = args.indexOf("--system-prompt");
const sys = sysIdx !== -1 ? String(args[sysIdx + 1] ?? "") : "";
let result = "";
if (sys.includes("changelog")) {
  result = "### Added\\n- Stubbed entry";
} else if (sys.includes("communications")) {
  result = "Stub release notes.";
} else {
  result = JSON.stringify({ suggestion: "patch", reasoning: "stub" });
}
process.stdout.write(JSON.stringify({
  result,
  is_error: false,
  usage: { input_tokens: 1, output_tokens: 1 },
}));
`;
  writeFileSync(fakePath, src);
  chmodSync(fakePath, 0o755);
  return fakePath;
}

describe("dist/scripts/release.js — built skill runner", () => {
  beforeAll(async () => {
    if (!existsSync(scriptPath)) {
      // Build once if the dist is missing. Building also covers gitwise-core
      // dependencies when invoked at the workspace root.
      await execFileAsync(
        "npm",
        ["run", "--workspace=@denisvieiradev/gitwise-skills", "build"],
        { cwd: repoRoot },
      );
    }
    expect(existsSync(scriptPath)).toBe(true);
  }, 120_000);

  it("surfaces a typed error.code in stderr and exits non-zero on missing plan (abort phase)", async () => {
    const dir = seedRepo();
    const result = await runScript(["abort"], dir);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/\[NO_RELEASE_PLAN\]/);
  }, 30_000);

  it("rejects an unrecognized phase with exit code 2 and a clear message", async () => {
    const dir = seedRepo();
    const result = await runScript(["bogus"], dir);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/\[UNKNOWN_PHASE\]/);
    expect(result.stderr).toMatch(/bogus/);
  }, 30_000);

  it("`abort` removes a seeded plan file and exits 0", async () => {
    const dir = seedRepo();
    await seedPlan(dir);
    expect(existsSync(join(dir, ".gitwise", "release-plan.json"))).toBe(true);

    const result = await runScript(["abort"], dir);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(existsSync(join(dir, ".gitwise", "release-plan.json"))).toBe(false);
  }, 30_000);

  it("`finish` applies a seeded plan, creating the version tag and exiting 0", async () => {
    const dir = seedRepo();
    await seedPlan(dir);

    const result = await runScript(
      ["finish", "--no-gh-release", "--no-workspace-propagation"],
      dir,
    );
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);

    const tags = execFileSync("git", ["tag", "-l"], { cwd: dir })
      .toString()
      .trim()
      .split("\n");
    expect(tags).toContain("v0.1.1");
    expect(existsSync(join(dir, ".gitwise", "release-plan.json"))).toBe(false);
  }, 60_000);

  it("legacy `--apply` propagates the new version to every workspace package.json", async () => {
    // Regression guard: the legacy one-shot path used to call `applyRelease`
    // without forwarding `workspacePropagation`, so monorepo users invoking
    // `node release.js --apply` silently shipped a release commit that only
    // bumped the root package.json. Mirror the existing `prepare` test setup
    // (fake claude binary + isolated HOME) so the LLM-driven planning step
    // is deterministic, then assert every workspace manifest landed at the
    // new version after the apply runs.
    const dir = seedRepo();
    mkdirSync(join(dir, "packages", "alpha"), { recursive: true });
    writeFileSync(
      join(dir, "packages", "alpha", "package.json"),
      JSON.stringify({ name: "alpha", version: "0.1.0" }, null, 2),
    );
    // Re-emit the root package.json with a workspaces field so
    // `propagateVersionToWorkspaces` finds the sub-package via npm patterns.
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        { name: "fixture", version: "0.1.0", workspaces: ["packages/*"] },
        null,
        2,
      ),
    );
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "chore: add workspace"], { cwd: dir });

    const fake = writeFakeClaude(dir);
    const home = mkdtempSync(join(tmpdir(), "gitwise-skill-home-"));
    mkdirSync(join(home, ".gitwise"), { recursive: true });
    writeFileSync(
      join(home, ".gitwise", "config.json"),
      JSON.stringify(
        {
          provider: "claude-code",
          claudeCliPath: fake,
          models: {
            fast: "claude-haiku-4-5-20251001",
            balanced: "claude-sonnet-4-6",
            powerful: "claude-opus-4-7",
          },
          language: "en",
          commitConvention: "conventional",
        },
        null,
        2,
      ),
    );

    const result = await runScript(
      ["--bump", "patch", "--apply", "--no-gh-release"],
      dir,
      home,
    );
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);

    const rootPkg = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf8"),
    ) as { version: string };
    const alphaPkg = JSON.parse(
      readFileSync(join(dir, "packages", "alpha", "package.json"), "utf8"),
    ) as { version: string };
    expect(rootPkg.version).toBe("0.1.1");
    expect(alphaPkg.version).toBe("0.1.1");

    // The release commit must include the workspace bump so consumers of the
    // tagged artifact see a coherent version tree, not a partial bump.
    const lastCommitFiles = execFileSync(
      "git",
      ["show", "--name-only", "--pretty=format:", "HEAD"],
      { cwd: dir },
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(lastCommitFiles).toContain("packages/alpha/package.json");
  }, 60_000);

  it("`prepare --bump patch` plans a release via a stubbed claude binary and writes the plan file", async () => {
    const dir = seedRepo();
    const fake = writeFakeClaude(dir);
    // Provider config lives at $HOME/.gitwise/config.json. We isolate HOME to
    // a separate temp dir (not the repo cwd) so the config dir does not
    // surface as untracked when prepare runs its clean-tree check.
    const home = mkdtempSync(join(tmpdir(), "gitwise-skill-home-"));
    mkdirSync(join(home, ".gitwise"), { recursive: true });
    writeFileSync(
      join(home, ".gitwise", "config.json"),
      JSON.stringify(
        {
          provider: "claude-code",
          claudeCliPath: fake,
          models: {
            fast: "claude-haiku-4-5-20251001",
            balanced: "claude-sonnet-4-6",
            powerful: "claude-opus-4-7",
          },
          language: "en",
          commitConvention: "conventional",
        },
        null,
        2,
      ),
    );

    const result = await runScript(["prepare", "--bump", "patch"], dir, home);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(existsSync(join(dir, ".gitwise", "release-plan.json"))).toBe(true);
    expect(result.stdout).toMatch(/Release Plan/);
    expect(result.stdout).toMatch(/0\.1\.0\s*→\s*0\.1\.1/);
  }, 60_000);
});
