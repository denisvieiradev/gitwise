import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { access, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MockLLMProvider } from "../../src/testing/mock-llm-provider.js";
import { prepareRelease } from "../../src/commands/release.js";
import { loadReleasePlan } from "../../src/commands/release-plan.js";

const exec = promisify(execFile);

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function planMock(bump = "minor"): MockLLMProvider {
  const mock = new MockLLMProvider();
  mock.queueByIndex({ content: JSON.stringify({ suggestion: bump, reasoning: "feat present" }), tokens: { input: 50, output: 10 } });
  mock.queueByIndex({ content: "### Added\n- shiny thing", tokens: { input: 80, output: 20 } });
  mock.queueByIndex({ content: "## Release notes\n\nLots of polish.", tokens: { input: 60, output: 15 } });
  return mock;
}

async function initRepoOnMain(dir: string): Promise<void> {
  await exec("git", ["init", "-b", "main"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await exec("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "lifecycle-pkg", version: "1.0.0" }, null, 2));
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-m", "chore: initial"], { cwd: dir });
}

describe("prepareRelease integration — gitflow lifecycle", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-prep-gitflow-int-"));
    await initRepoOnMain(cwd);
    // Branch develop off main and add a feature commit there.
    await exec("git", ["checkout", "-b", "develop"], { cwd });
    await writeFile(join(cwd, "feature.ts"), "export const f = 1;");
    await exec("git", ["add", "feature.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: develop feature"], { cwd });
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("creates release branch, writes all artifacts, commits the bump, and creates no tag", async () => {
    const mock = planMock("minor");
    const plan = await prepareRelease({ cwd, provider: mock, strategy: "gitflow" });

    // Plan-side assertions
    expect(plan.strategy).toBe("gitflow");
    expect(plan.releaseBranchCreated).toBe(true);
    expect(plan.targetBranch).toBe("release/1.1.0");
    expect(plan.newVersion).toBe("1.1.0");

    // Branch was created and we're standing on it
    const { stdout: currentBranch } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    expect(currentBranch.trim()).toBe("release/1.1.0");

    // Manifest bumped on release branch
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8")) as { version: string };
    expect(pkg.version).toBe("1.1.0");

    // CHANGELOG entry present
    const changelog = await readFile(join(cwd, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("## [1.1.0]");

    // Notes file present (user-editable)
    const notes = await readFile(join(cwd, ".gitwise/release-1.1.0.md"), "utf-8");
    expect(notes).toContain("Release notes");

    // Plan file persisted and reloadable
    const loaded = await loadReleasePlan(cwd);
    expect(loaded).not.toBeNull();
    expect(loaded?.newVersion).toBe("1.1.0");
    expect(loaded?.targetBranch).toBe("release/1.1.0");

    // .gitignore now covers the plan file
    const gitignore = await readFile(join(cwd, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".gitwise/release-plan.json");

    // Latest commit on the release branch is the version-bump commit (committed by prepare)
    const { stdout: log } = await exec("git", ["log", "--oneline", "-1"], { cwd });
    expect(log).toContain("chore(release): v1.1.0");

    // No tag has been created — that's finish's job
    const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd });
    expect(tags.trim()).toBe("");

    // main branch's package.json is still on the previous version
    await exec("git", ["checkout", "main"], { cwd });
    const mainPkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8")) as { version: string };
    expect(mainPkg.version).toBe("1.0.0");
  });
});

describe("prepareRelease integration — github-flow lifecycle", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-prep-ghflow-int-"));
    await initRepoOnMain(cwd);
    await writeFile(join(cwd, "feature.ts"), "export const f = 1;");
    await exec("git", ["add", "feature.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: trunk feature"], { cwd });
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("does not create a branch and leaves package.json untouched", async () => {
    const mock = planMock("minor");
    const plan = await prepareRelease({ cwd, provider: mock });

    expect(plan.strategy).toBe("github-flow");
    expect(plan.releaseBranchCreated).toBe(false);
    expect(plan.targetBranch).toBe("main");

    // No release branch was created
    const { stdout: branches } = await exec("git", ["branch", "--list"], { cwd });
    expect(branches).not.toContain("release/");

    // package.json untouched
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8")) as { version: string };
    expect(pkg.version).toBe("1.0.0");

    // No CHANGELOG.md was created
    expect(await pathExists(join(cwd, "CHANGELOG.md"))).toBe(false);

    // No tag, no extra commit
    const { stdout: tags } = await exec("git", ["tag", "-l"], { cwd });
    expect(tags.trim()).toBe("");

    // Notes + plan file exist
    expect(await pathExists(join(cwd, ".gitwise/release-1.1.0.md"))).toBe(true);
    expect(await pathExists(join(cwd, ".gitwise/release-plan.json"))).toBe(true);

    // .gitignore now covers the plan file
    const gitignore = await readFile(join(cwd, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".gitwise/release-plan.json");
  });
});

describe("prepareRelease integration — re-run protection", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gitwise-prep-rerun-int-"));
    await initRepoOnMain(cwd);
    await exec("git", ["checkout", "-b", "develop"], { cwd });
    await writeFile(join(cwd, "feature.ts"), "export const f = 1;");
    await exec("git", ["add", "feature.ts"], { cwd });
    await exec("git", ["commit", "-m", "feat: develop feature"], { cwd });
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("refuses to overwrite an in-flight plan when prepare is run twice", async () => {
    const firstMock = planMock("minor");
    const firstPlan = await prepareRelease({ cwd, provider: firstMock, strategy: "gitflow" });
    expect(firstPlan.newVersion).toBe("1.1.0");
    expect(firstMock.getCallCount()).toBeGreaterThan(0);

    const secondMock = planMock("major");
    let thrown: unknown;
    try {
      await prepareRelease({ cwd, provider: secondMock, strategy: "gitflow" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as { code?: string }).code).toBe("RELEASE_PLAN_EXISTS");

    // Original plan file is untouched: same newVersion as the first prepare.
    const loaded = await loadReleasePlan(cwd);
    expect(loaded?.newVersion).toBe("1.1.0");

    // The failed second prepare must not have consumed any LLM calls — it
    // bails before reaching the planner.
    expect(secondMock.getCallCount()).toBe(0);
  });
});
