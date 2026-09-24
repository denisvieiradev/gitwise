import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureGitignored } from "../../src/commands/release-plan.js";
import { finishRelease } from "../../src/commands/release.js";

const exec = promisify(execFile);

describe("ensureGitignored (integration with a real .gitignore)", () => {
  let cwd: string;
  let logSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-ensure-gitignored-"));
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it("preserves unrelated content and appends the entry with a trailing newline", async () => {
    const original = [
      "# Build artifacts",
      "node_modules/",
      "dist/",
      "",
      "# Local env",
      ".env.local",
      "",
    ].join("\n");
    await writeFile(join(cwd, ".gitignore"), original, "utf-8");

    await ensureGitignored(cwd, ".gitwise/release-plan.json");

    const updated = await readFile(join(cwd, ".gitignore"), "utf-8");
    expect(updated.startsWith(original)).toBe(true);
    expect(updated.endsWith("\n.gitwise/release-plan.json\n")).toBe(true);
    expect(updated).toBe(`${original}.gitwise/release-plan.json\n`);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("rerunning against an already-ignored file is a no-op", async () => {
    const original = "node_modules/\n.gitwise/release-plan.json\n";
    await writeFile(join(cwd, ".gitignore"), original, "utf-8");

    await ensureGitignored(cwd, ".gitwise/release-plan.json");

    const updated = await readFile(join(cwd, ".gitignore"), "utf-8");
    expect(updated).toBe(original);
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe("finishRelease against a legacy-shape persisted plan (AD-002 backward compat)", () => {
  let tempDir: string;

  async function initRepo(dir: string, version = "1.0.0"): Promise<void> {
    await exec("git", ["init", "-b", "main"], { cwd: dir });
    await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
    await exec("git", ["config", "user.name", "Test"], { cwd: dir });
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "test-pkg", version }, null, 2));
    await exec("git", ["add", "."], { cwd: dir });
    await exec("git", ["commit", "-m", "initial commit"], { cwd: dir });
  }

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gitwise-legacy-plan-"));
    await initRepo(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("finishes successfully against a plan file persisted before tokensAvailable existed", async () => {
    const { stdout: baseCommit } = await exec("git", ["rev-parse", "HEAD"], { cwd: tempDir });
    // Deliberately omits tokensAvailable — simulates a plan written by a
    // pre-this-feature gitwise binary.
    const legacyPlan = {
      schema: 1,
      strategy: "github-flow",
      currentVersion: "1.0.0",
      newVersion: "1.1.0",
      suggestedBump: "minor",
      changelog: "### Added\n- thing",
      notes: "Legacy release notes.",
      commits: "feat: thing",
      preparedAt: new Date().toISOString(),
      baseCommit: baseCommit.trim(),
      targetBranch: "main",
      releaseBranchCreated: false,
      tokens: { input: 10, output: 5 },
    };
    await mkdir(join(tempDir, ".gitwise"), { recursive: true });
    await writeFile(join(tempDir, ".gitwise", "release-plan.json"), JSON.stringify(legacyPlan), "utf-8");
    await writeFile(join(tempDir, ".gitwise", "release-1.1.0.md"), "Legacy release notes.", "utf-8");

    await expect(
      finishRelease({ cwd: tempDir, tagAndPush: false, createGhRelease: false }),
    ).resolves.toBeUndefined();

    const pkg = JSON.parse(await readFile(join(tempDir, "package.json"), "utf-8")) as { version: string };
    expect(pkg.version).toBe("1.1.0");
  });
});
