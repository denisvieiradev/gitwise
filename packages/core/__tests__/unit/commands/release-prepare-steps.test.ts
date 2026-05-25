/**
 * Task 07 unit tests — Transaction step factories that drive `prepareRelease`.
 *
 * Each factory's `apply` AND `compensate` is exercised in isolation against a
 * real temp filesystem (and a real temp git repo, where needed). The point is
 * to assert that each compensate is independently correct — if any of them
 * regresses, the per-step contract documented in ADR-004 §Decision item 1
 * breaks before the integration suite even gets a chance to detect it.
 */
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  Transaction,
  type Logger,
} from "../../../src/infra/transaction.js";
import {
  commitReleaseStep,
  createReleaseBranchStep,
  mutateGitignoreStep,
  prepareRelease,
  savePlanStep,
  writeChangelogStep,
  writeFileStep,
} from "../../../src/commands/release.js";
import {
  loadReleasePlan,
  type PersistedReleasePlan,
} from "../../../src/commands/release-plan.js";
import { MockLLMProvider } from "../../../src/testing/mock-llm-provider.js";

const exec = promisify(execFile);

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const SILENT_LOGGER: Logger = { warn: () => {} };

async function initGitflowRepo(dir: string): Promise<void> {
  await exec("git", ["init", "-b", "main"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "p", version: "1.0.0" }, null, 2) + "\n",
  );
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "chore: initial"], { cwd: dir });
  await exec("git", ["checkout", "-b", "develop"], { cwd: dir });
  await writeFile(join(dir, "feature.ts"), "export const f = 1;");
  await exec("git", ["add", "feature.ts"], { cwd: dir });
  await exec("git", ["commit", "-m", "feat: develop feature"], { cwd: dir });
}

function planMock(bump = "minor"): MockLLMProvider {
  const mock = new MockLLMProvider();
  mock.queueByIndex({
    content: JSON.stringify({ suggestion: bump, reasoning: "feat present" }),
    tokens: { input: 50, output: 10 },
  });
  mock.queueByIndex({
    content: "### Added\n- shiny thing",
    tokens: { input: 80, output: 20 },
  });
  mock.queueByIndex({
    content: "## Release notes\n\nPolish.",
    tokens: { input: 60, output: 15 },
  });
  return mock;
}

// ─── writeFileStep ───────────────────────────────────────────────────────────

describe("writeFileStep", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-step-writefile-"));
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("apply: writes the file when the target does not exist; compensate: unlinks it", async () => {
    const target = join(cwd, "notes.md");
    const step = writeFileStep(target, "hello");
    const result = await step.apply();
    expect(result).toBeNull();
    expect(await readFile(target, "utf-8")).toBe("hello");

    await step.compensate(result);
    expect(await pathExists(target)).toBe(false);
  });

  it("apply: captures prior bytes when the target already exists; compensate: restores them byte-for-byte", async () => {
    const target = join(cwd, "notes.md");
    const original = Buffer.from("ORIGINAL\nwith trailing newline\n", "utf-8");
    await writeFile(target, original);

    const step = writeFileStep(target, "NEW BODY");
    const result = await step.apply();

    expect(result).not.toBeNull();
    expect(result?.equals(original)).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("NEW BODY");

    await step.compensate(result);
    expect(await readFile(target)).toEqual(original);
  });

  it("compensate(null) on a target that never existed is a no-op (idempotent)", async () => {
    const target = join(cwd, "ghost.md");
    const step = writeFileStep(target, "ignored");
    await expect(step.compensate(null)).resolves.toBeUndefined();
  });
});

// ─── mutateGitignoreStep ─────────────────────────────────────────────────────

describe("mutateGitignoreStep", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-step-gitignore-"));
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("apply: creates .gitignore with release-plan + notes glob entries; compensate: unlinks it", async () => {
    const gitignorePath = join(cwd, ".gitignore");
    const step = mutateGitignoreStep(cwd);
    const priorBytes = await step.apply();

    expect(priorBytes).toBeNull();
    const after = await readFile(gitignorePath, "utf-8");
    expect(after).toContain(".gitwise/release-plan.json");
    expect(after).toContain(".gitwise/release-*.md");

    await step.compensate(priorBytes);
    expect(await pathExists(gitignorePath)).toBe(false);
  });

  it("apply: captures prior .gitignore bytes when it exists; compensate: restores them byte-for-byte", async () => {
    const gitignorePath = join(cwd, ".gitignore");
    const original = Buffer.from("node_modules/\n", "utf-8");
    await writeFile(gitignorePath, original);

    const step = mutateGitignoreStep(cwd);
    const priorBytes = await step.apply();

    expect(priorBytes?.equals(original)).toBe(true);
    const after = await readFile(gitignorePath, "utf-8");
    expect(after).toContain("node_modules/");
    expect(after).toContain(".gitwise/release-plan.json");
    expect(after).toContain(".gitwise/release-*.md");

    await step.compensate(priorBytes);
    expect(await readFile(gitignorePath)).toEqual(original);
  });
});

// ─── writeChangelogStep ──────────────────────────────────────────────────────

describe("writeChangelogStep", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-step-changelog-"));
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("apply: creates CHANGELOG.md with the Keep-a-Changelog header when absent; compensate: unlinks", async () => {
    const path = join(cwd, "CHANGELOG.md");
    const step = writeChangelogStep(cwd, "1.2.3", "### Added\n- thing");
    const priorBytes = await step.apply();

    expect(priorBytes).toBeNull();
    const content = await readFile(path, "utf-8");
    expect(content).toContain("# Changelog");
    expect(content).toContain("## [1.2.3]");
    expect(content).toContain("### Added\n- thing");

    await step.compensate(priorBytes);
    expect(await pathExists(path)).toBe(false);
  });

  it("apply: prepends a new entry to an existing CHANGELOG.md; compensate: restores prior bytes", async () => {
    const path = join(cwd, "CHANGELOG.md");
    const original = Buffer.from(
      "# Changelog\n\n## [1.0.0] - 2020-01-01\n\n### Added\n- prior\n\n",
      "utf-8",
    );
    await writeFile(path, original);

    const step = writeChangelogStep(cwd, "1.2.3", "### Added\n- thing");
    const priorBytes = await step.apply();

    expect(priorBytes?.equals(original)).toBe(true);
    const after = await readFile(path, "utf-8");
    // Both entries are present; new entry is above the old one.
    const newIdx = after.indexOf("## [1.2.3]");
    const oldIdx = after.indexOf("## [1.0.0]");
    expect(newIdx).toBeGreaterThan(-1);
    expect(oldIdx).toBeGreaterThan(newIdx);

    await step.compensate(priorBytes);
    expect(await readFile(path)).toEqual(original);
  });
});

// ─── createReleaseBranchStep + commitReleaseStep ─────────────────────────────

describe("createReleaseBranchStep + commitReleaseStep", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-step-branch-"));
    await initGitflowRepo(cwd);
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("createReleaseBranchStep: apply switches to a new branch off develop; compensate returns to the prior branch and deletes the release branch", async () => {
    const step = createReleaseBranchStep(cwd, "release/9.9.9", "develop");
    const result = await step.apply();

    expect(result.branchName).toBe("release/9.9.9");
    expect(result.previousBranch).toBe("develop");
    const { stdout: branch } = await exec(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd },
    );
    expect(branch.trim()).toBe("release/9.9.9");

    await step.compensate(result);

    const { stdout: after } = await exec(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd },
    );
    expect(after.trim()).toBe("develop");
    const { stdout: branches } = await exec(
      "git",
      ["branch", "--list", "release/9.9.9"],
      { cwd },
    );
    expect(branches.trim()).toBe("");
  });

  it("createReleaseBranchStep compensate force-checkout discards uncommitted dirt before deleting the branch", async () => {
    const step = createReleaseBranchStep(cwd, "release/9.9.9", "develop");
    const result = await step.apply();

    // Smuggle a tracked-file modification onto the release branch — compensate
    // must still succeed because it uses `git checkout -f`.
    await writeFile(join(cwd, "feature.ts"), "export const f = 999;");

    await step.compensate(result);
    const { stdout: after } = await exec(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd },
    );
    expect(after.trim()).toBe("develop");
    // Tracked-file change is discarded.
    expect(await readFile(join(cwd, "feature.ts"), "utf-8")).toBe(
      "export const f = 1;",
    );
  });

  it("commitReleaseStep: apply commits staged files; compensate hard-resets back to the pre-commit SHA", async () => {
    await exec("git", ["checkout", "-b", "release/9.9.9", "develop"], { cwd });
    const pkgPath = join(cwd, "package.json");
    await writeFile(
      pkgPath,
      JSON.stringify({ name: "p", version: "9.9.9" }, null, 2) + "\n",
    );

    const step = commitReleaseStep(cwd, "chore(release): v9.9.9", [
      "package.json",
    ]);
    const preSha = await step.apply();
    expect(preSha).toMatch(/^[0-9a-f]{7,40}$/);

    const { stdout: log } = await exec(
      "git",
      ["log", "--oneline", "-1"],
      { cwd },
    );
    expect(log).toContain("chore(release): v9.9.9");

    await step.compensate(preSha);

    const { stdout: head } = await exec(
      "git",
      ["rev-parse", "HEAD"],
      { cwd },
    );
    expect(head.trim()).toBe(preSha);
    // The package.json bump is reverted by the hard reset.
    expect(JSON.parse(await readFile(pkgPath, "utf-8"))).toEqual({
      name: "p",
      version: "1.0.0",
    });
  });
});

// ─── savePlanStep ────────────────────────────────────────────────────────────

describe("savePlanStep", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-step-plan-"));
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("apply persists the plan to .gitwise/release-plan.json; compensate unlinks it", async () => {
    const plan: PersistedReleasePlan = {
      schema: 1,
      strategy: "github-flow",
      currentVersion: "1.0.0",
      newVersion: "1.1.0",
      suggestedBump: "minor",
      changelog: "x",
      notes: "y",
      commits: "feat: z",
      preparedAt: new Date().toISOString(),
      baseCommit: "deadbeef",
      targetBranch: "main",
      releaseBranchCreated: false,
      tokens: { input: 0, output: 0 },
    };

    const step = savePlanStep(cwd, plan);
    await step.apply();

    const reloaded = await loadReleasePlan(cwd);
    expect(reloaded?.newVersion).toBe("1.1.0");

    await step.compensate();
    expect(await loadReleasePlan(cwd)).toBeNull();
  });

  it("compensate is idempotent when the plan file is already gone (ENOENT swallowed)", async () => {
    const plan: PersistedReleasePlan = {
      schema: 1,
      strategy: "github-flow",
      currentVersion: "1.0.0",
      newVersion: "1.1.0",
      suggestedBump: "minor",
      changelog: "",
      notes: "",
      commits: "",
      preparedAt: new Date().toISOString(),
      baseCommit: "deadbeef",
      targetBranch: "main",
      releaseBranchCreated: false,
      tokens: { input: 0, output: 0 },
    };
    const step = savePlanStep(cwd, plan);
    await expect(step.compensate()).resolves.toBeUndefined();
  });
});

// ─── plan-last invariant ─────────────────────────────────────────────────────

describe("prepareRelease step ordering invariant", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-prep-order-"));
    await initGitflowRepo(cwd);
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("the release plan file is the LAST artifact created — every other artifact exists by the time the plan is on disk", async () => {
    // Drive a real prepare and inspect the transaction post-success: the plan
    // file's mtime must be greater-or-equal to every other artifact's mtime,
    // which proves it was written last. ADR-004 §Decision item 1.
    const { stat } = await import("node:fs/promises");
    await prepareRelease({
      cwd,
      provider: planMock("minor"),
      strategy: "gitflow",
    });
    const planMtime = (
      await stat(join(cwd, ".gitwise", "release-plan.json"))
    ).mtimeMs;
    const notesMtime = (
      await stat(join(cwd, ".gitwise", "release-1.1.0.md"))
    ).mtimeMs;
    const pkgMtime = (await stat(join(cwd, "package.json"))).mtimeMs;
    const changelogMtime = (await stat(join(cwd, "CHANGELOG.md"))).mtimeMs;
    const gitignoreMtime = (await stat(join(cwd, ".gitignore"))).mtimeMs;

    expect(planMtime).toBeGreaterThanOrEqual(notesMtime);
    expect(planMtime).toBeGreaterThanOrEqual(pkgMtime);
    expect(planMtime).toBeGreaterThanOrEqual(changelogMtime);
    expect(planMtime).toBeGreaterThanOrEqual(gitignoreMtime);
  });
});

// ─── Transaction integration with the step factories ────────────────────────

describe("Transaction wiring with prepare-release step factories", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-step-tx-"));
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("a failure after several steps fires every compensate in LIFO order and restores end-state", async () => {
    const calls: string[] = [];
    const tx = new Transaction();

    await tx.run({
      name: "a",
      apply: async () => {
        calls.push("apply:a");
        return "result-a";
      },
      compensate: async (result) => {
        calls.push(`compensate:a:${result}`);
      },
    });
    await tx.run({
      name: "b",
      apply: async () => {
        calls.push("apply:b");
        return "result-b";
      },
      compensate: async (result) => {
        calls.push(`compensate:b:${result}`);
      },
    });

    // Simulate the prepare's catch path: a downstream step throws.
    const { GitwiseError } = await import("../../../src/errors.js");
    const reason = new GitwiseError({
      code: "TEST_FAILURE",
      message: "synthetic",
    });
    await tx.rollback(reason, SILENT_LOGGER);

    expect(calls).toEqual([
      "apply:a",
      "apply:b",
      "compensate:b:result-b",
      "compensate:a:result-a",
    ]);
  });
});
