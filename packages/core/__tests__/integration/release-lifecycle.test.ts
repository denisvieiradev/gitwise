/**
 * Task 09 integration tests — full release lifecycle scenarios.
 *
 * These tests drive the public `prepareRelease` / `finishRelease` /
 * `abortRelease` / `applyRelease` / `runReleaseInProcess` entry points end-to-end
 * against real temp git repos (the existing convention). The `gh` CLI is
 * mocked at the `src/infra/github.js` module boundary; the LLM is stubbed via
 * `MockLLMProvider`. No network, no `gh` binary, no LLM credentials needed.
 *
 * Scenarios covered (per task_09 TechSpec):
 *   1. GitFlow lifecycle — prepare → finish.
 *   2. GitHub-flow lifecycle — prepare → finish.
 *   3. Edited notes resume — user rewrites .gitwise/release-<v>.md between phases.
 *   4. Stale-plan recovery — finish detects a pre-existing tag, abort cleans up.
 *   5. Legacy one-shot — `applyRelease` end-to-end (byte-identical artifacts).
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

function planMock(bump = "minor", notes = "## Release notes\n\nFresh and polished."): MockLLMProvider {
  const mock = new MockLLMProvider();
  mock.queueByIndex({
    content: JSON.stringify({ suggestion: bump, reasoning: "feat present" }),
    tokens: { input: 50, output: 10 },
  });
  mock.queueByIndex({
    content: "### Added\n- shiny thing",
    tokens: { input: 80, output: 20 },
  });
  mock.queueByIndex({ content: notes, tokens: { input: 60, output: 15 } });
  return mock;
}

async function initRepoOnMain(dir: string, version = "1.0.0"): Promise<void> {
  await exec("git", ["init", "-b", "main"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "lifecycle-pkg", version }, null, 2),
  );
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "chore: initial"], { cwd: dir });
}

async function initGitflowRepo(dir: string): Promise<void> {
  await initRepoOnMain(dir);
  await exec("git", ["checkout", "-b", "develop"], { cwd: dir });
  await writeFile(join(dir, "feature.ts"), "export const f = 1;");
  await exec("git", ["add", "feature.ts"], { cwd: dir });
  await exec("git", ["commit", "-m", "feat: develop feature"], { cwd: dir });
}

async function addOrigin(cwd: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gitwise-int-origin-"));
  await exec("git", ["init", "--bare", "-b", "main"], { cwd: dir });
  await exec("git", ["remote", "add", "origin", dir], { cwd });
  return dir;
}

// ─── 1. GitFlow lifecycle ────────────────────────────────────────────────────

describe("release lifecycle integration — gitflow prepare → finish", () => {
  let cwd: string;
  let originDir: string | null;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-int-gitflow-"));
    originDir = null;
    await initGitflowRepo(cwd);
  });

  afterEach(async () => {
    jest.dontMock("../../src/infra/github.js");
    jest.resetModules();
    await rm(cwd, { recursive: true, force: true });
    if (originDir) await rm(originDir, { recursive: true, force: true });
  });

  it("prepare creates artifacts without tagging; finish tags, merges both branches, deletes plan + release branch", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { prepareRelease, finishRelease } = await import(
      "../../src/commands/release.js"
    );
    const { loadReleasePlan } = await import(
      "../../src/commands/release-plan.js"
    );

    // PREPARE
    const mock = planMock("minor");
    const persisted = await prepareRelease({
      cwd,
      provider: mock,
      strategy: "gitflow",
    });

    expect(persisted.strategy).toBe("gitflow");
    expect(persisted.releaseBranchCreated).toBe(true);
    expect(persisted.targetBranch).toBe("release/1.1.0");

    // Artifacts in place
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(true);
    expect(await pathExists(join(cwd, ".gitwise/release-1.1.0.md"))).toBe(true);
    expect(await pathExists(join(cwd, "CHANGELOG.md"))).toBe(true);
    // No tag yet — that is finish's responsibility
    const { stdout: tagsBefore } = await exec("git", ["tag", "-l"], { cwd });
    expect(tagsBefore.trim()).toBe("");

    // FINISH — local-only (no remote push to keep the test hermetic).
    originDir = await addOrigin(cwd);
    await finishRelease({
      cwd,
      tagAndPush: true,
      createGhRelease: false,
    });

    // Tag exists locally and on the remote.
    const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd });
    expect(tags.trim()).toBe("v1.1.0");
    const { stdout: remoteTags } = await exec("git", ["ls-remote", "--tags", "origin"], { cwd });
    expect(remoteTags).toContain("refs/tags/v1.1.0");

    // Both branches contain the release commit.
    const { stdout: mainLog } = await exec("git", ["log", "main", "--oneline"], { cwd });
    expect(mainLog).toContain("chore(release): v1.1.0");
    const { stdout: devLog } = await exec("git", ["log", "develop", "--oneline"], { cwd });
    expect(devLog).toContain("chore(release): v1.1.0");

    // Plan file gone, release branch gone.
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(false);
    const { stdout: branches } = await exec("git", ["branch", "--list", "release/*"], { cwd });
    expect(branches.trim()).toBe("");

    // Sanity: loadReleasePlan returns null post-finish.
    expect(await loadReleasePlan(cwd)).toBeNull();
  });
});

describe("release lifecycle integration — gitflow finish merge conflict", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-int-gitflow-conflict-"));
    await initGitflowRepo(cwd);
  });

  afterEach(async () => {
    jest.dontMock("../../src/infra/github.js");
    jest.resetModules();
    await rm(cwd, { recursive: true, force: true });
  });

  it("surfaces FINISH_MERGE_CONFLICT (with target/source/newVersion) when develop diverged after prepare", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { prepareRelease, finishRelease } = await import(
      "../../src/commands/release.js"
    );

    // PREPARE — release/1.1.0 branches off develop and bumps package.json
    // to "1.1.0" on the release branch only.
    await prepareRelease({
      cwd,
      provider: planMock("minor"),
      strategy: "gitflow",
    });
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(true);

    // Simulate develop advancing between prepare and finish with a change
    // that conflicts with the release branch's package.json bump.
    await exec("git", ["checkout", "develop"], { cwd });
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "lifecycle-pkg", version: "9.9.9" }, null, 2),
    );
    await exec("git", ["commit", "-am", "chore: divergent version"], { cwd });

    // Plan target is "release/1.1.0"; finishRelease validates HEAD == target.
    await exec("git", ["checkout", "release/1.1.0"], { cwd });

    // The merge into main is clean (main was untouched), so finish proceeds
    // to merging the release branch into develop, which conflicts.
    await expect(
      finishRelease({ cwd, tagAndPush: false, createGhRelease: false }),
    ).rejects.toMatchObject({
      code: "FINISH_MERGE_CONFLICT",
      target: "develop",
      source: "release/1.1.0",
      newVersion: "1.1.0",
    });

    // ADR-003 invariant: the plan file is gone before merges begin, so a
    // mid-merge failure leaves it absent. The notes file is preserved.
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(false);
    expect(await pathExists(join(cwd, ".gitwise/release-1.1.0.md"))).toBe(true);

    // No tag was created — finish bailed out before step 9.
    const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd });
    expect(tags.trim()).toBe("");
  });
});

// ─── 2. GitHub-flow lifecycle ────────────────────────────────────────────────

describe("release lifecycle integration — github-flow prepare → finish", () => {
  let cwd: string;
  let originDir: string | null;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-int-ghflow-"));
    originDir = null;
    await initRepoOnMain(cwd);
    // Trunk feature commit so we have new work since the initial commit.
    await writeFile(join(cwd, "feature.ts"), "export const f = 1;");
    await exec("git", ["add", "feature.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });
  });

  afterEach(async () => {
    jest.dontMock("../../src/infra/github.js");
    jest.resetModules();
    await rm(cwd, { recursive: true, force: true });
    if (originDir) await rm(originDir, { recursive: true, force: true });
  });

  it("prepare does not mutate manifest or create a branch; finish bumps, tags, deletes plan", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { prepareRelease, finishRelease } = await import(
      "../../src/commands/release.js"
    );

    // PREPARE
    const mock = planMock("minor");
    const persisted = await prepareRelease({ cwd, provider: mock });

    expect(persisted.strategy).toBe("github-flow");
    expect(persisted.releaseBranchCreated).toBe(false);
    expect(persisted.targetBranch).toBe("main");

    // Manifest untouched, no CHANGELOG written, no extra commit, no tag, no branch.
    const pkgAfterPrepare = JSON.parse(
      await readFile(join(cwd, "package.json"), "utf-8"),
    ) as { version: string };
    expect(pkgAfterPrepare.version).toBe("1.0.0");
    expect(await pathExists(join(cwd, "CHANGELOG.md"))).toBe(false);
    const { stdout: branches } = await exec("git", ["branch", "--list"], { cwd });
    expect(branches).not.toContain("release/");
    const { stdout: tagsBefore } = await exec("git", ["tag", "-l"], { cwd });
    expect(tagsBefore.trim()).toBe("");
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(true);

    // FINISH — manifest bump now happens here. Bare-origin lets finishRelease's
    // tagAndPush=true path complete without needing a real remote.
    originDir = await addOrigin(cwd);
    await finishRelease({ cwd, tagAndPush: true, createGhRelease: false });

    const pkgAfterFinish = JSON.parse(
      await readFile(join(cwd, "package.json"), "utf-8"),
    ) as { version: string };
    expect(pkgAfterFinish.version).toBe("1.1.0");

    const changelog = await readFile(join(cwd, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("## [1.1.0]");

    const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd });
    expect(tags.trim()).toBe("v1.1.0");

    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(false);
  });
});

// ─── 3. Edited notes resume ──────────────────────────────────────────────────

describe("release lifecycle integration — edited notes survive into finish", () => {
  let cwd: string;
  let originDir: string | null;
  const ghReleaseCalls: Array<{ tag: string; body: string }> = [];

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-int-edited-"));
    originDir = null;
    ghReleaseCalls.length = 0;
    await initRepoOnMain(cwd);
    await writeFile(join(cwd, "feature.ts"), "export const f = 1;");
    await exec("git", ["add", "feature.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });
  });

  afterEach(async () => {
    jest.dontMock("../../src/infra/github.js");
    jest.resetModules();
    await rm(cwd, { recursive: true, force: true });
    if (originDir) await rm(originDir, { recursive: true, force: true });
  });

  it("finish uses the on-disk notes file (not plan.notes) for tag annotation + gh release body", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => true,
      createGitHubRelease: async (params: { tag: string; body: string }) => {
        ghReleaseCalls.push({ tag: params.tag, body: params.body });
        return { url: "https://example.test/release/n" };
      },
    }));
    const { prepareRelease, finishRelease } = await import(
      "../../src/commands/release.js"
    );

    const mock = planMock("minor", "ORIGINAL LLM notes that the user will overwrite.");
    await prepareRelease({ cwd, provider: mock });

    // User rewrites the notes file in place between prepare and finish.
    // Note: git treats lines beginning with "#" as comments in tag messages,
    // so we use a plain heading (no leading "#") to assert verbatim survival.
    const editedBody =
      "Hand-edited release notes\n=========================\n\n- This text replaces the LLM output.\n- Finish must pick it up.";
    await writeFile(join(cwd, ".gitwise/release-1.1.0.md"), editedBody, "utf-8");

    originDir = await addOrigin(cwd);
    await finishRelease({ cwd, tagAndPush: true, createGhRelease: true });

    // Tag annotation reflects the edited notes.
    const { stdout: annotation } = await exec(
      "git",
      ["tag", "-l", "--format=%(contents)", "v1.1.0"],
      { cwd },
    );
    expect(annotation).toContain("Hand-edited release notes");
    expect(annotation).not.toContain("ORIGINAL LLM notes");

    // gh release body matches the edited file verbatim.
    expect(ghReleaseCalls).toHaveLength(1);
    expect(ghReleaseCalls[0]?.body).toBe(editedBody);
    expect(ghReleaseCalls[0]?.tag).toBe("v1.1.0");
  });
});

// ─── 3b. Missing notes file fallback ─────────────────────────────────────────

describe("release lifecycle integration — finish falls back to plan.notes when the notes file is missing", () => {
  let cwd: string;
  let originDir: string | null;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-int-missing-notes-"));
    originDir = null;
    await initRepoOnMain(cwd);
    await writeFile(join(cwd, "feature.ts"), "export const f = 1;");
    await exec("git", ["add", "feature.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });
  });

  afterEach(async () => {
    jest.dontMock("../../src/infra/github.js");
    jest.resetModules();
    await rm(cwd, { recursive: true, force: true });
    if (originDir) await rm(originDir, { recursive: true, force: true });
  });

  it("annotates the tag with plan.notes when .gitwise/release-<v>.md was deleted between prepare and finish", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { prepareRelease, finishRelease } = await import(
      "../../src/commands/release.js"
    );

    // Notes deliberately use a plain heading (no leading "#") so the tag
    // message preserves the line verbatim — git strips comment lines from
    // annotated tag messages.
    const originalNotes =
      "LLM-produced notes\n==================\n\n- Falls back when file is gone.";
    await prepareRelease({ cwd, provider: planMock("minor", originalNotes) });

    // User (or CI) deletes the on-disk notes file between prepare and finish.
    await rm(join(cwd, ".gitwise/release-1.1.0.md"));

    originDir = await addOrigin(cwd);
    await expect(
      finishRelease({ cwd, tagAndPush: true, createGhRelease: false }),
    ).resolves.toBeUndefined();

    // Tag annotation reflects the in-memory plan.notes — no raw ENOENT.
    const { stdout: annotation } = await exec(
      "git",
      ["tag", "-l", "--format=%(contents)", "v1.1.0"],
      { cwd },
    );
    expect(annotation).toContain("LLM-produced notes");

    // Plan file is gone (ADR-003 plan-first delete still happened).
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(false);
  });
});

// ─── 4. Stale-plan recovery ──────────────────────────────────────────────────

describe("release lifecycle integration — stale-plan tag conflict + abort recovery", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-int-stale-"));
    await initRepoOnMain(cwd);
    await writeFile(join(cwd, "feature.ts"), "export const f = 1;");
    await exec("git", ["add", "feature.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("finish rejects with STALE_PLAN_TAG_EXISTS and leaves the plan on disk; abort then cleans up", async () => {
    const { prepareRelease, finishRelease, abortRelease } = await import(
      "../../src/commands/release.js"
    );

    const mock = planMock("minor");
    await prepareRelease({ cwd, provider: mock });
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(true);

    // Simulate the stale-plan scenario: a v1.1.0 tag appears between prepare
    // and finish (manual user action, CI, etc.).
    await exec("git", ["tag", "v1.1.0"], { cwd });

    await expect(
      finishRelease({ cwd, tagAndPush: false, createGhRelease: false }),
    ).rejects.toMatchObject({ code: "STALE_PLAN_TAG_EXISTS" });

    // Plan file is preserved so the user can inspect or `abort`.
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(true);

    // abort clears the plan file. Notes file is preserved by design.
    await abortRelease({ cwd });
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(false);
    expect(await pathExists(join(cwd, ".gitwise/release-1.1.0.md"))).toBe(true);
  });
});

// ─── 5. Legacy one-shot ──────────────────────────────────────────────────────

describe("release lifecycle integration — legacy one-shot applyRelease", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-int-legacy-"));
    await initRepoOnMain(cwd);
    await writeFile(join(cwd, "feature.ts"), "export const f = 1;");
    await exec("git", ["add", "feature.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });
  });

  afterEach(async () => {
    jest.dontMock("../../src/infra/github.js");
    jest.resetModules();
    await rm(cwd, { recursive: true, force: true });
  });

  it("produces byte-identical package.json, CHANGELOG entry, and notes file vs. the task_08 snapshot", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { applyRelease } = await import("../../src/commands/release.js");

    const fixedPlan = {
      suggestedBump: "minor" as const,
      newVersion: "1.1.0",
      currentVersion: "1.0.0",
      changelog: "### Added\n- Snapshot feature",
      notes: "Release notes that survive verbatim.",
      commits: "feat: snapshot",
      tokens: { input: 0, output: 0 },
    };

    await applyRelease(fixedPlan, {
      cwd,
      tagAndPush: false,
      createGhRelease: false,
    });

    // package.json: only `version` flipped; other keys preserved in order.
    const pkg = JSON.parse(
      await readFile(join(cwd, "package.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(pkg).toEqual({ name: "lifecycle-pkg", version: "1.1.0" });

    // CHANGELOG.md: header + entry, byte-equal to the task_08 snapshot.
    const changelog = await readFile(join(cwd, "CHANGELOG.md"), "utf-8");
    const today = new Date().toISOString().split("T")[0];
    const expectedHeader = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org/).

`;
    const expectedEntry = `## [1.1.0] - ${today}\n\n### Added\n- Snapshot feature\n\n`;
    expect(changelog).toBe(expectedHeader + expectedEntry);

    // .gitwise/release-1.1.0.md: notes survive verbatim.
    const notes = await readFile(
      join(cwd, ".gitwise/release-1.1.0.md"),
      "utf-8",
    );
    expect(notes).toBe(fixedPlan.notes);

    // Release commit on main.
    const { stdout: log } = await exec("git", ["log", "--oneline", "-1"], { cwd });
    expect(log).toContain("chore(release): v1.1.0");

    // Plan file lifecycle: written and deleted within the unified flow.
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(false);
  });
});

// ─── 6. Back-to-back releases ────────────────────────────────────────────────

describe("release lifecycle integration — successive prepares survive prior notes file", () => {
  let cwd: string;
  let originDir: string | null;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-int-successive-"));
    originDir = null;
    await initGitflowRepo(cwd);
  });

  afterEach(async () => {
    jest.dontMock("../../src/infra/github.js");
    jest.resetModules();
    await rm(cwd, { recursive: true, force: true });
    if (originDir) await rm(originDir, { recursive: true, force: true });
  });

  it("a second prepareRelease in the same repo does not trip on the prior release's notes file", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { prepareRelease, finishRelease } = await import(
      "../../src/commands/release.js"
    );

    // Round 1: ship v1.1.0 end-to-end. Bare origin lets finishRelease push.
    originDir = await addOrigin(cwd);
    await prepareRelease({
      cwd,
      provider: planMock("minor"),
      strategy: "gitflow",
    });
    await finishRelease({ cwd, tagAndPush: true, createGhRelease: false });

    // Notes file from round 1 should still be on disk per ADR-003.
    expect(await pathExists(join(cwd, ".gitwise/release-1.1.0.md"))).toBe(true);
    // And it must now be gitignored — i.e. invisible to `git status`.
    const { stdout: dirtyAfterRound1 } = await exec(
      "git",
      ["status", "--porcelain"],
      { cwd },
    );
    expect(dirtyAfterRound1.trim()).toBe("");

    // Add a new commit on develop so round 2 has something to release.
    await exec("git", ["checkout", "develop"], { cwd });
    await writeFile(join(cwd, "feature2.ts"), "export const f2 = 2;");
    await exec("git", ["add", "feature2.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: second feature"], { cwd });

    // Round 2: prepareRelease must NOT fail with WORKING_TREE_DIRTY even
    // though .gitwise/release-1.1.0.md is still on disk.
    const persisted2 = await prepareRelease({
      cwd,
      provider: planMock("minor"),
      strategy: "gitflow",
    });

    expect(persisted2.newVersion).toBe("1.2.0");
    expect(persisted2.targetBranch).toBe("release/1.2.0");
    expect(await pathExists(join(cwd, ".gitwise/release-1.2.0.md"))).toBe(true);
    // Prior notes file is still preserved alongside the new one.
    expect(await pathExists(join(cwd, ".gitwise/release-1.1.0.md"))).toBe(true);
  });

  it("github-flow: a second prepareRelease in the same repo does not trip on the prior release's notes file", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { prepareRelease, finishRelease } = await import(
      "../../src/commands/release.js"
    );

    // Start fresh on main (the gitflow init in beforeEach left us on develop).
    await exec("git", ["checkout", "main"], { cwd });
    await writeFile(join(cwd, "trunk.ts"), "export const t = 1;");
    await exec("git", ["add", "trunk.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });

    // Round 1: github-flow prepare + finish. Finish folds the .gitignore
    // modification (made by prepare's ensureGitignored) into the release
    // commit, so no manual gitignore commit is needed here.
    originDir = await addOrigin(cwd);
    await prepareRelease({ cwd, provider: planMock("minor") });
    await finishRelease({ cwd, tagAndPush: true, createGhRelease: false });

    // The release commit must include the .gitignore change, and the working
    // tree must be clean afterward (notes file is gitignored by the fix).
    expect(await pathExists(join(cwd, ".gitwise/release-1.1.0.md"))).toBe(true);
    const { stdout: releaseCommitFiles } = await exec(
      "git",
      ["show", "--name-only", "--pretty=format:", "HEAD"],
      { cwd },
    );
    expect(releaseCommitFiles).toContain(".gitignore");
    const { stdout: dirtyAfterRound1 } = await exec(
      "git",
      ["status", "--porcelain"],
      { cwd },
    );
    expect(dirtyAfterRound1.trim()).toBe("");

    // New trunk commit so round 2 has something to release.
    await writeFile(join(cwd, "trunk2.ts"), "export const t2 = 2;");
    await exec("git", ["add", "trunk2.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: second trunk feature"], { cwd });

    // Round 2 must succeed.
    const persisted2 = await prepareRelease({
      cwd,
      provider: planMock("minor"),
    });

    expect(persisted2.newVersion).toBe("1.2.0");
    expect(await pathExists(join(cwd, ".gitwise/release-1.2.0.md"))).toBe(true);
    expect(await pathExists(join(cwd, ".gitwise/release-1.1.0.md"))).toBe(true);
  });

  it("github-flow: prepare → abort leaves .gitignore dirty, and the next prepare still succeeds", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { prepareRelease, abortRelease } = await import(
      "../../src/commands/release.js"
    );

    // Start fresh on main (the gitflow init in beforeEach left us on develop).
    await exec("git", ["checkout", "main"], { cwd });
    await writeFile(join(cwd, "trunk.ts"), "export const t = 1;");
    await exec("git", ["add", "trunk.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });

    // Round 1: github-flow prepare, then abort before finish runs. Prepare's
    // `ensureGitignored` mutates `.gitignore` but no commit happens on
    // github-flow — that mutation is deferred to finish. Aborting therefore
    // leaves the working tree with a stray ` M .gitignore` (or `?? .gitignore`
    // on a brand-new repo with no prior file).
    await prepareRelease({ cwd, provider: planMock("minor") });
    await abortRelease({ cwd });

    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(false);
    const { stdout: dirtyAfterAbort } = await exec(
      "git",
      ["status", "--porcelain"],
      { cwd },
    );
    // The leftover MUST be exactly the .gitignore line — nothing else should
    // be dirty after abort.
    const dirtyLines = dirtyAfterAbort
      .split("\n")
      .map((l) => l.replace(/\s+$/, ""))
      .filter((l) => l.length > 0);
    expect(dirtyLines).toHaveLength(1);
    expect(dirtyLines[0]!.slice(3).trim()).toBe(".gitignore");

    // Round 2: prepareRelease must NOT fail with WORKING_TREE_DIRTY even
    // though `.gitignore` is still dirty from the prior aborted run. This is
    // the regression guard — before the fix, the unconditional preflight
    // rejected here and the user had to `git checkout -- .gitignore` by hand.
    const persisted2 = await prepareRelease({
      cwd,
      provider: planMock("minor"),
    });

    expect(persisted2.newVersion).toBe("1.1.0");
    expect(persisted2.strategy).toBe("github-flow");
    expect(persisted2.releaseBranchCreated).toBe(false);
    expect(await pathExists(join(cwd, ".gitwise/release-1.1.0.md"))).toBe(true);
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(true);
  });

  it("prepare preflight still rejects unrelated dirty paths even when .gitignore is the only allowed leftover", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { prepareRelease } = await import("../../src/commands/release.js");

    // Start fresh on main.
    await exec("git", ["checkout", "main"], { cwd });
    await writeFile(join(cwd, "trunk.ts"), "export const t = 1;");
    await exec("git", ["add", "trunk.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });

    // Two dirty paths: a stray `.gitignore` (which prepare must tolerate) and
    // an unrelated tracked-file modification (which it must still reject).
    await writeFile(join(cwd, ".gitignore"), "node_modules/\n");
    await writeFile(join(cwd, "trunk.ts"), "export const t = 2;");

    await expect(
      prepareRelease({ cwd, provider: planMock("minor") }),
    ).rejects.toMatchObject({ code: "WORKING_TREE_DIRTY" });

    // No plan should have been written.
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(
      false,
    );
  });

  it("github-flow: finish rejects with WORKING_TREE_DIRTY when the user smuggled extra lines into .gitignore between prepare and finish", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { prepareRelease, finishRelease } = await import(
      "../../src/commands/release.js"
    );

    // Start fresh on main with a tracked `.gitignore` already containing one
    // line, so we can assert prepare's additions don't dislodge it AND that
    // an extra user edit (appended after prepare) is what trips finish.
    await exec("git", ["checkout", "main"], { cwd });
    await writeFile(join(cwd, ".gitignore"), "node_modules/\n");
    await writeFile(join(cwd, "trunk.ts"), "export const t = 1;");
    await exec("git", ["add", ".gitignore", "trunk.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });

    // Prepare on github-flow. ensureGitignored appends the two release paths
    // to `.gitignore` but does NOT commit (github-flow defers to finish).
    await prepareRelease({ cwd, provider: planMock("minor") });
    const afterPrepareGitignore = await readFile(
      join(cwd, ".gitignore"),
      "utf-8",
    );
    expect(afterPrepareGitignore).toContain(".gitwise/release-plan.json");
    expect(afterPrepareGitignore).toContain(".gitwise/release-*.md");

    // User edits `.gitignore` between prepare and finish — say, silencing a
    // local build artifact. The release commit must NOT silently absorb this.
    await writeFile(
      join(cwd, ".gitignore"),
      `${afterPrepareGitignore}build/\n`,
    );

    // Finish should now refuse with WORKING_TREE_DIRTY rather than folding
    // the stray edit into `chore(release): v1.1.0`.
    await expect(
      finishRelease({ cwd, tagAndPush: false, createGhRelease: false }),
    ).rejects.toMatchObject({ code: "WORKING_TREE_DIRTY" });

    // The plan must still be on disk so the user can recover with abort or
    // by reverting their `.gitignore` edit and re-running finish.
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(
      true,
    );
    // No release commit was created.
    const { stdout: log } = await exec(
      "git",
      ["log", "--oneline", "-1"],
      { cwd },
    );
    expect(log).not.toContain("chore(release): v1.1.0");
  });

  it("github-flow: finish still tolerates `.gitignore` when it matches prepare's output byte-for-byte", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../../src/infra/github.js", () => ({
      isGhAvailable: async () => false,
      createGitHubRelease: async () => ({ url: "n/a" }),
    }));
    const { prepareRelease, finishRelease } = await import(
      "../../src/commands/release.js"
    );

    // Identical setup to the rejection case, minus the post-prepare edit:
    // confirms the tightened allow-list is not over-strict on the happy path.
    await exec("git", ["checkout", "main"], { cwd });
    await writeFile(join(cwd, ".gitignore"), "node_modules/\n");
    await writeFile(join(cwd, "trunk.ts"), "export const t = 1;");
    await exec("git", ["add", ".gitignore", "trunk.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });

    await prepareRelease({ cwd, provider: planMock("minor") });
    await finishRelease({ cwd, tagAndPush: false, createGhRelease: false });

    // Release commit landed and folded `.gitignore` in alongside the bump.
    const { stdout: releaseCommitFiles } = await exec(
      "git",
      ["show", "--name-only", "--pretty=format:", "HEAD"],
      { cwd },
    );
    expect(releaseCommitFiles).toContain(".gitignore");
    expect(releaseCommitFiles).toContain("package.json");
    expect(releaseCommitFiles).toContain("CHANGELOG.md");

    // Working tree is clean after finish.
    const { stdout: dirty } = await exec(
      "git",
      ["status", "--porcelain"],
      { cwd },
    );
    expect(dirty.trim()).toBe("");

    // Pre-existing line was preserved (not clobbered by ensureGitignored).
    const finalGitignore = await readFile(join(cwd, ".gitignore"), "utf-8");
    expect(finalGitignore).toContain("node_modules/");
    expect(finalGitignore).toContain(".gitwise/release-plan.json");
    expect(finalGitignore).toContain(".gitwise/release-*.md");
  });
});
