/**
 * Task 07 integration tests — Transactional rollback for `prepareRelease`.
 *
 * Every fixture below deliberately fails `prepareRelease` AFTER a specific
 * step succeeds and asserts the repo's end state is byte-equal to the
 * pre-prepare state (per ADR-004 §Decision item 1). The point is the
 * rollback contract — not the LLM, not the strategy, not the plan shape.
 *
 * Failures are injected via real filesystem state (chmod a manifest
 * read-only, pre-create a path as a directory so writeFile throws EISDIR,
 * install a pre-commit hook that rejects). The mocked path is the LOWEST-
 * level helper the next step would call; this keeps the test focused on
 * the prepare flow rather than on jest plumbing, and the assertions all
 * read real on-disk state.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prepareRelease } from "../../src/commands/release.js";
import { MockLLMProvider } from "../../src/testing/mock-llm-provider.js";

const exec = promisify(execFile);

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
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
    content: "## Release notes\n\npolish.",
    tokens: { input: 60, output: 15 },
  });
  return mock;
}

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

interface RepoState {
  headSha: string;
  branches: string;
  pkgBytes: Buffer;
  gitignoreContent: string | null;
  changelogContent: string | null;
  planExists: boolean;
}

async function readOptional(p: string): Promise<string | null> {
  return (await pathExists(p)) && !(await isDirectory(p))
    ? readFile(p, "utf-8")
    : null;
}

async function snapshot(cwd: string): Promise<RepoState> {
  const { stdout: headSha } = await exec("git", ["rev-parse", "HEAD"], { cwd });
  const { stdout: branches } = await exec(
    "git",
    ["branch", "--list"],
    { cwd },
  );
  return {
    headSha: headSha.trim(),
    branches: branches.trim(),
    pkgBytes: await readFile(join(cwd, "package.json")),
    gitignoreContent: await readOptional(join(cwd, ".gitignore")),
    changelogContent: await readOptional(join(cwd, "CHANGELOG.md")),
    planExists: await pathExists(join(cwd, ".gitwise", "release-plan.json")),
  };
}

function expectByteEqual(pre: RepoState, post: RepoState): void {
  expect(post.headSha).toBe(pre.headSha);
  expect(post.branches).toBe(pre.branches);
  expect(post.pkgBytes.equals(pre.pkgBytes)).toBe(true);
  expect(post.gitignoreContent).toBe(pre.gitignoreContent);
  expect(post.changelogContent).toBe(pre.changelogContent);
  expect(post.planExists).toBe(pre.planExists);
}

describe("prepareRelease rollback — failure boundaries (gitflow)", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-prep-rb-"));
    await initGitflowRepo(cwd);
    // Run prepare from the develop branch (gitflow's expected starting point).
    await exec("git", ["checkout", "develop"], { cwd });
  });

  afterEach(async () => {
    // Restore writeable perms so the test runner can clean up.
    try {
      await chmod(join(cwd, "package.json"), 0o644);
    } catch {}
    await rm(cwd, { recursive: true, force: true });
  });

  it("happy path: end state contains the plan file as the marker of completion (plan written LAST)", async () => {
    const persisted = await prepareRelease({
      cwd,
      provider: planMock("minor"),
      strategy: "gitflow",
    });
    expect(persisted.releaseBranchCreated).toBe(true);
    expect(persisted.targetBranch).toBe("release/1.1.0");

    expect(
      await pathExists(join(cwd, ".gitwise", "release-plan.json")),
    ).toBe(true);

    // Plan mtime ≥ every other artifact's mtime — plan was written last.
    const planMtime = (
      await stat(join(cwd, ".gitwise", "release-plan.json"))
    ).mtimeMs;
    const notesMtime = (
      await stat(join(cwd, ".gitwise", "release-1.1.0.md"))
    ).mtimeMs;
    const pkgMtime = (await stat(join(cwd, "package.json"))).mtimeMs;
    const changelogMtime = (await stat(join(cwd, "CHANGELOG.md"))).mtimeMs;
    expect(planMtime).toBeGreaterThanOrEqual(notesMtime);
    expect(planMtime).toBeGreaterThanOrEqual(pkgMtime);
    expect(planMtime).toBeGreaterThanOrEqual(changelogMtime);
  });

  it("failure after branch creation: branch deleted, no notes file, no plan, end state byte-equal to pre-prepare", async () => {
    // Pre-create `.gitwise/release-1.1.0.md` AS A DIRECTORY so the
    // writeFileStep that follows the branch creation fails on `readFile`
    // (EISDIR). The branch step has already succeeded by then, so this
    // isolates the boundary "branch applied, notes about to apply, fails".
    await mkdir(join(cwd, ".gitwise", "release-1.1.0.md"), { recursive: true });
    const pre = await snapshot(cwd);

    await expect(
      prepareRelease({
        cwd,
        provider: planMock("minor"),
        strategy: "gitflow",
      }),
    ).rejects.toBeTruthy();

    // The release branch was deleted by createReleaseBranchStep's compensate.
    const { stdout: postBranches } = await exec(
      "git",
      ["branch", "--list", "release/1.1.0"],
      { cwd },
    );
    expect(postBranches.trim()).toBe("");

    // Everything else is byte-equal to pre-prepare (the directory we
    // pre-created remains — it is the failure injection, not gitwise state).
    const post = await snapshot(cwd);
    expectByteEqual(pre, post);
  });

  it("failure after notes write: notes file removed, package.json untouched, branch deleted, plan absent", async () => {
    // chmod package.json read-only so the writeWorkspaceVersionStep that
    // follows the notes write fails on writeFile (EACCES). Both
    // createReleaseBranchStep AND writeFileStep have already applied at
    // that point.
    await chmod(join(cwd, "package.json"), 0o444);
    const pre = await snapshot(cwd);

    await expect(
      prepareRelease({
        cwd,
        provider: planMock("minor"),
        strategy: "gitflow",
      }),
    ).rejects.toBeTruthy();

    // Notes-step compensate unlinked the file.
    expect(
      await pathExists(join(cwd, ".gitwise", "release-1.1.0.md")),
    ).toBe(false);

    // Branch deleted.
    const { stdout: postBranches } = await exec(
      "git",
      ["branch", "--list", "release/1.1.0"],
      { cwd },
    );
    expect(postBranches.trim()).toBe("");

    const post = await snapshot(cwd);
    expectByteEqual(pre, post);
  });

  it("failure after gitignore mutation: gitignore reverted, CHANGELOG removed, package.json restored, commit reset, branch deleted", async () => {
    // Install a pre-commit hook that always rejects so the commitReleaseStep
    // (which runs right after the gitignore mutation) fails. Every prior
    // step's compensate must fire and restore byte-for-byte state.
    await mkdir(join(cwd, ".git", "hooks"), { recursive: true });
    await writeFile(
      join(cwd, ".git", "hooks", "pre-commit"),
      "#!/bin/sh\necho 'pre-commit rejects' >&2\nexit 1\n",
      { mode: 0o755 },
    );
    const pre = await snapshot(cwd);

    await expect(
      prepareRelease({
        cwd,
        provider: planMock("minor"),
        strategy: "gitflow",
      }),
    ).rejects.toMatchObject({ code: "COMMIT_HOOK_FAILURE" });

    // Notes unlinked, CHANGELOG unlinked (it did not exist pre-prepare),
    // package.json byte-equal to pre, .gitignore byte-equal to pre, plan
    // absent, branch deleted.
    expect(
      await pathExists(join(cwd, ".gitwise", "release-1.1.0.md")),
    ).toBe(false);
    expect(await pathExists(join(cwd, "CHANGELOG.md"))).toBe(false);
    const { stdout: postBranches } = await exec(
      "git",
      ["branch", "--list", "release/1.1.0"],
      { cwd },
    );
    expect(postBranches.trim()).toBe("");

    const post = await snapshot(cwd);
    expectByteEqual(pre, post);
  });

  it("failure at plan write: plan removed, every prior compensate fired, end state == pre-prepare", async () => {
    // Pre-create `.gitwise/release-plan.json` as a DIRECTORY so the
    // savePlanStep's writeFile (inside writeJSON) fails with EISDIR. Every
    // prior step has already applied successfully at that point. The
    // resulting LIFO rollback must un-commit the release commit, revert
    // every file write, unlink the notes file, and delete the release
    // branch.
    await mkdir(join(cwd, ".gitwise", "release-plan.json"), { recursive: true });
    const pre = await snapshot(cwd);

    await expect(
      prepareRelease({
        cwd,
        provider: planMock("minor"),
        strategy: "gitflow",
      }),
    ).rejects.toBeTruthy();

    // Plan file (as a regular file) is absent — the failure-injection
    // directory persists but no plan was persisted.
    expect(await isDirectory(join(cwd, ".gitwise", "release-plan.json"))).toBe(true);
    // Branch deleted by createReleaseBranchStep's compensate.
    const { stdout: postBranches } = await exec(
      "git",
      ["branch", "--list", "release/1.1.0"],
      { cwd },
    );
    expect(postBranches.trim()).toBe("");
    // Notes unlinked.
    expect(
      await pathExists(join(cwd, ".gitwise", "release-1.1.0.md")),
    ).toBe(false);
    // CHANGELOG.md unlinked (did not exist pre-prepare).
    expect(await pathExists(join(cwd, "CHANGELOG.md"))).toBe(false);

    const post = await snapshot(cwd);
    expectByteEqual(pre, post);
  });

  it("pre-existing release branch surfaces RELEASE_BRANCH_CONFLICT with a docs/recovery.md hint and writes nothing", async () => {
    await exec("git", ["branch", "release/1.1.0"], { cwd });
    const pre = await snapshot(cwd);

    await expect(
      prepareRelease({
        cwd,
        provider: planMock("minor"),
        strategy: "gitflow",
      }),
    ).rejects.toMatchObject({
      code: "RELEASE_BRANCH_CONFLICT",
      exitCode: 61,
      message: expect.stringContaining("docs/recovery.md"),
    });

    // Nothing was written; the pre-existing release branch is still there.
    expect(
      await pathExists(join(cwd, ".gitwise", "release-plan.json")),
    ).toBe(false);
    expect(
      await pathExists(join(cwd, ".gitwise", "release-1.1.0.md")),
    ).toBe(false);
    const post = await snapshot(cwd);
    expectByteEqual(pre, post);
  });
});

describe("prepareRelease rollback — github-flow (no branch step)", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-prep-rb-gh-"));
    await exec("git", ["init", "-b", "main"], { cwd });
    await exec("git", ["config", "user.email", "test@test.com"], { cwd });
    await exec("git", ["config", "user.name", "Test"], { cwd });
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "p", version: "1.0.0" }, null, 2) + "\n",
    );
    await exec("git", ["add", "."], { cwd });
    await exec("git", ["commit", "-m", "chore: initial"], { cwd });
    await writeFile(join(cwd, "feature.ts"), "export const f = 1;");
    await exec("git", ["add", "feature.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("failure at plan write: notes unlinked, gitignore reverted, plan absent (end state == pre-prepare)", async () => {
    await mkdir(join(cwd, ".gitwise", "release-plan.json"), { recursive: true });
    const pre = await snapshot(cwd);

    await expect(
      prepareRelease({ cwd, provider: planMock("minor") }),
    ).rejects.toBeTruthy();

    expect(
      await pathExists(join(cwd, ".gitwise", "release-1.1.0.md")),
    ).toBe(false);
    // .gitignore byte-equal to pre-prepare (no pre-existing .gitignore =>
    // mutateGitignoreStep compensate unlinks the file it created).
    expect(await pathExists(join(cwd, ".gitignore"))).toBe(false);

    const post = await snapshot(cwd);
    expectByteEqual(pre, post);
  });
});
